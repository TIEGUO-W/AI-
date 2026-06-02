import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const VIDEOS_DIR = path.join(PUBLIC_DIR, 'uploads', 'coach-videos');
const SKELETONS_DIR = path.join(PUBLIC_DIR, 'uploads', 'coach-skeletons');

const MAX_DURATION_SEC = 30 * 60; // 30 分钟上限

// 反爬绕过 UA + Referer
const ANTI_SCRAPE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const ANTI_SCRAPE_REFERER = 'https://www.bilibili.com';

// 直链视频扩展名
const DIRECT_VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv'];

// ============ URL 类型识别 ============

function isDirectVideoUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    const pathname = u.pathname.toLowerCase();
    if (DIRECT_VIDEO_EXTS.some(ext => pathname.endsWith(ext))) return true;
    const host = u.hostname.toLowerCase();
    const cdnPatterns = [
      /\.cos\./, /\.oss\./, /\.s3\./, /\.tos\./,
      /cdn/, /cloudfront/, /akamai/, /fastly/,
      /blob\.core/, /windows\.net/,
      /storage\.googleapis/,
    ];
    if (cdnPatterns.some(p => p.test(host))) return true;
    return false;
  } catch {
    return false;
  }
}

function isBilibiliUrl(urlStr: string): boolean {
  try {
    const host = new URL(urlStr).hostname.toLowerCase();
    return host.includes('bilibili.com') || host.includes('b23.tv');
  } catch {
    return false;
  }
}

// ============ 直链下载 ============

async function directDownload(url: string, outputPath: string): Promise<{ title: string; duration: number }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': ANTI_SCRAPE_UA },
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    throw new Error(`直接下载失败: HTTP ${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('video') && !contentType.includes('octet-stream') && !contentType.includes('mp4')) {
    throw new Error(`链接返回非视频内容 (${contentType})，请确认是有效的视频直链`);
  }

  const arrayBuf = await res.arrayBuffer();
  await writeFile(outputPath, Buffer.from(arrayBuf));

  const urlObj = new URL(url);
  const filename = decodeURIComponent(urlObj.pathname.split('/').pop() ?? '未命名视频');
  const title = filename.replace(/\.[^.]+$/, '');

  return { title, duration: 0 };
}

// ============ B站专用下载器（绕过 yt-dlp 412 问题） ============

interface BiliVideoInfo {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  duration: number;
  desc: string;
  owner: { name: string };
  pages: Array<{ cid: number; part: string; duration: number }>;
}

/** 从B站链接提取 BV 号 */
function extractBvid(url: string): string | null {
  // 标准链接: bilibili.com/video/BVxxxxxx
  const bvMatch = url.match(/BV[a-zA-Z0-9]+/);
  if (bvMatch) return bvMatch[0];
  // 短链接 b23.tv 需要先跟随重定向获取真实 URL（暂不支持，提示用户）
  return null;
}

/** 调用B站 API 获取视频信息 */
async function getBiliVideoInfo(bvid: string): Promise<BiliVideoInfo> {
  const res = await fetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
    {
      headers: {
        'User-Agent': ANTI_SCRAPE_UA,
        'Referer': ANTI_SCRAPE_REFERER,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!res.ok) {
    throw new Error(`B站 API 请求失败: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { code: number; message: string; data: BiliVideoInfo };
  if (json.code !== 0) {
    throw new Error(`B站视频获取失败: ${json.message}`);
  }

  return json.data;
}

/** 解析 b23.tv 短链接 → 真实 URL */
async function resolveBiliShortUrl(shortUrl: string): Promise<string> {
  const res = await fetch(shortUrl, {
    redirect: 'manual',
    headers: { 'User-Agent': ANTI_SCRAPE_UA },
    signal: AbortSignal.timeout(10_000),
  });
  // b23.tv 返回 302 重定向
  const location = res.headers.get('location');
  if (location) return location;
  // 如果没有重定向，尝试跟随
  const finalRes = await fetch(shortUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': ANTI_SCRAPE_UA },
    signal: AbortSignal.timeout(10_000),
  });
  return finalRes.url;
}

/** B站视频下载 — 优先 MP4 格式（360P，音视频已合并），降级 DASH + ffmpeg */
async function downloadBiliVideo(
  bvid: string,
  cid: number,
  outputPath: string,
): Promise<void> {
  // 策略一：MP4 格式（fnval=0，低清但音视频合并，无需 ffmpeg）
  const mp4Success = await tryBiliMp4Download(bvid, cid, outputPath);
  if (mp4Success) return;

  // 策略二：DASH 格式 + ffmpeg 合并（更高画质）
  const dashSuccess = await tryBiliDashDownload(bvid, cid, outputPath);
  if (dashSuccess) return;

  throw new Error('B站视频下载失败：MP4 和 DASH 格式均不可用');
}

/** 尝试 MP4 格式下载 */
async function tryBiliMp4Download(bvid: string, cid: number, outputPath: string): Promise<boolean> {
  try {
    const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=16&fnver=0&fnval=0&fourk=0`;
    const res = await fetch(playUrl, {
      headers: {
        'User-Agent': ANTI_SCRAPE_UA,
        'Referer': ANTI_SCRAPE_REFERER,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return false;

    const json = (await res.json()) as {
      code: number;
      data?: {
        durl?: Array<{ url: string; backup_url?: string[]; size: number }>;
      };
    };
    if (json.code !== 0 || !json.data?.durl?.length) return false;

    const videoUrl = json.data.durl[0].url;
    return await downloadBiliStream(videoUrl, json.data.durl[0].backup_url, outputPath);
  } catch {
    return false;
  }
}

/** 尝试 DASH 格式下载 + ffmpeg 合并 */
async function tryBiliDashDownload(bvid: string, cid: number, outputPath: string): Promise<boolean> {
  try {
    const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=64&fnver=0&fnval=16&fourk=0`;
    const res = await fetch(playUrl, {
      headers: {
        'User-Agent': ANTI_SCRAPE_UA,
        'Referer': ANTI_SCRAPE_REFERER,
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return false;

    const json = (await res.json()) as {
      code: number;
      data?: {
        dash?: {
          video?: Array<{ baseUrl: string; base_url: string; backupUrl?: string[]; backup_url?: string[]; id: number; mimeType: string }>;
          audio?: Array<{ baseUrl: string; base_url: string; backupUrl?: string[]; backup_url?: string[]; id: number; mimeType: string }>;
        };
      };
    };
    if (json.code !== 0 || !json.data?.dash) return false;

    const { video, audio } = json.data.dash;
    if (!video?.length) return false;

    // 选第一个视频流和音频流
    const videoStream = video[0];
    const videoUrl = videoStream.baseUrl || videoStream.base_url;
    const videoBackup = videoStream.backupUrl || videoStream.backup_url;

    if (!audio?.length) {
      // 没有音频流，只下载视频
      return await downloadBiliStream(videoUrl, videoBackup, outputPath);
    }

    const audioStream = audio[0];
    const audioUrl = audioStream.baseUrl || audioStream.base_url;
    const audioBackup = audioStream.backupUrl || audioStream.backup_url;

    // 下载音视频到临时文件，然后用 ffmpeg 合并
    const tempDir = path.dirname(outputPath);
    const tempVideo = path.join(tempDir, `${path.basename(outputPath, '.mp4')}_video.m4s`);
    const tempAudio = path.join(tempDir, `${path.basename(outputPath, '.mp4')}_audio.m4s`);

    const [vOk, aOk] = await Promise.all([
      downloadBiliStream(videoUrl, videoBackup, tempVideo),
      downloadBiliStream(audioUrl, audioBackup, tempAudio),
    ]);

    if (!vOk || !aOk) return false;

    // ffmpeg 合并
    const merged = await ffmpegMerge(tempAudio, tempVideo, outputPath);
    // 清理临时文件
    const { unlink } = await import('fs/promises');
    await unlink(tempVideo).catch(() => {});
    await unlink(tempAudio).catch(() => {});

    return merged;
  } catch {
    return false;
  }
}

/** 下载B站视频/音频流（带 backup_url 降级） */
async function downloadBiliStream(
  primaryUrl: string,
  backupUrls: string[] | undefined,
  outputPath: string,
): Promise<boolean> {
  const urls = [primaryUrl, ...(backupUrls ?? [])];

  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: {
          'User-Agent': ANTI_SCRAPE_UA,
          'Referer': ANTI_SCRAPE_REFERER,
        },
        signal: AbortSignal.timeout(300_000), // 5 分钟超时
      });

      if (!resp.ok) continue;

      const buf = await resp.arrayBuffer();
      await writeFile(outputPath, Buffer.from(buf));
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** ffmpeg 合并音频+视频流 */
async function ffmpegMerge(audioPath: string, videoPath: string, outputPath: string): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outputPath,
    ], { stdio: 'ignore' });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 120_000); // 2 分钟超时

    proc.on('close', code => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    proc.on('error', () => resolve(false));
  });
}

// ============ yt-dlp 通用下载器（非B站平台） ============

async function ytdlpAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    const proc = spawn('yt-dlp', ['--version'], { stdio: 'ignore' });
    proc.on('close', code => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

async function getVideoInfo(url: string): Promise<{ duration: number; title: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--no-playlist', '--dump-json', '--no-warnings',
      '--user-agent', ANTI_SCRAPE_UA,
      '--add-header', `Referer:${ANTI_SCRAPE_REFERER}`,
      url,
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('解析超时（30秒），请检查链接是否可访问'));
    }, 30_000);
    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        const errLine = stderr.trim().split('\n').pop() ?? '';
        let hint = 'yt-dlp 无法解析此链接';
        if (errLine.includes('412') || errLine.includes('Precondition')) {
          hint = '该平台有反爬保护（HTTP 412），暂不支持从此平台下载。请尝试提供视频直链（.mp4/.webm）';
        } else if (errLine.includes('403') || errLine.includes('Forbidden')) {
          hint = '访问被拒绝（HTTP 403），该视频可能有访问限制。请尝试提供视频直链';
        } else if (errLine.includes('Sign in') || errLine.includes('login') || errLine.includes('age')) {
          hint = '该视频需要登录或有年龄限制，暂不支持下载';
        } else if (errLine.includes('Video unavailable') || errLine.includes('not found')) {
          hint = '视频不存在或已被删除，请检查链接';
        } else if (errLine.includes('Unsupported URL')) {
          hint = '不支持的视频平台，请提供视频直链（.mp4/.webm）';
        } else if (errLine.includes('HTTP Error')) {
          hint = `网络请求失败: ${errLine.slice(0, 100)}。请尝试提供视频直链`;
        }
        reject(new Error(hint));
        return;
      }
      try {
        const info = JSON.parse(stdout.trim().split('\n')[0]);
        resolve({ duration: info.duration ?? 0, title: info.title ?? '未知' });
      } catch { reject(new Error('链接解析失败，返回数据格式异常')); }
    });
    proc.on('error', () => reject(new Error('yt-dlp 启动失败')));
  });
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', [
      '--no-playlist',
      '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best',
      '--merge-output-format', 'mp4',
      '--no-warnings',
      '--user-agent', ANTI_SCRAPE_UA,
      '--add-header', `Referer:${ANTI_SCRAPE_REFERER}`,
      '-o', outputPath,
      url,
    ]);
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('下载超时（5分钟）'));
    }, 5 * 60_000);
    proc.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`下载失败: ${stderr.slice(-200)}`));
        return;
      }
      resolve();
    });
    proc.on('error', reject);
  });
}

// ============ POST handler ============

export async function POST(request: NextRequest) {
  try {
    await mkdir(VIDEOS_DIR, { recursive: true });
    await mkdir(SKELETONS_DIR, { recursive: true });

    const { url } = (await request.json()) as { url: string };

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: '请提供视频链接' }, { status: 400 });
    }

    // 从粘贴内容中提取 URL（容错：用户可能粘贴了标题+链接）
    const urlMatch = url.match(/https?:\/\/[^\s)]+/);
    if (!urlMatch) {
      return NextResponse.json({ error: '未检测到有效链接' }, { status: 400 });
    }
    let cleanUrl = urlMatch[0];
    // 去掉追踪参数
    try {
      const u = new URL(cleanUrl);
      ['vd_source', 'si', 'spm_id_from', 'share_source', 'utm_source', 'utm_medium'].forEach(p => u.searchParams.delete(p));
      cleanUrl = u.toString();
    } catch { /* keep original */ }

    const recordingId = crypto.randomUUID();
    const videoPath = path.join(VIDEOS_DIR, `${recordingId}.mp4`);
    const statusPath = path.join(SKELETONS_DIR, `${recordingId}.status.json`);

    // ====== 路径一：直链视频（.mp4/.webm 等）→ 直接 fetch 下载 ======
    if (isDirectVideoUrl(cleanUrl)) {
      let info: { title: string; duration: number };
      try {
        await writeFile(statusPath, JSON.stringify({ status: 'downloading', progress: 0, title: '下载中...' }));
        info = await directDownload(cleanUrl, videoPath);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '直接下载失败';
        await writeFile(statusPath, JSON.stringify({ status: 'error', error: msg })).catch(() => {});
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      writeFile(statusPath, JSON.stringify({ status: 'processing', progress: 10, title: info.title }))
        .then(async () => {
          const { CoachVideoProcessor } = await import('@/lib/coach-video-processor');
          return CoachVideoProcessor.process(videoPath, recordingId);
        })
        .catch(async err => {
          console.error('[coach-video-link] processing failed:', err);
          await writeFile(statusPath, JSON.stringify({
            status: 'error',
            error: err instanceof Error ? err.message : '处理失败',
            title: info.title,
          })).catch(() => {});
        });

      return NextResponse.json({
        recordingId,
        coachVideoUrl: `/uploads/coach-videos/${recordingId}.mp4`,
        status: 'processing',
        title: info.title,
        duration: info.duration,
        source: 'direct',
      });
    }

    // ====== 路径二：B站视频 → 直接调 B站 API 下载（绕过 yt-dlp 412） ======
    if (isBilibiliUrl(cleanUrl)) {
      // 解析 b23.tv 短链接
      let resolvedUrl = cleanUrl;
      if (cleanUrl.includes('b23.tv')) {
        try {
          resolvedUrl = await resolveBiliShortUrl(cleanUrl);
        } catch {
          return NextResponse.json(
            { error: 'B站短链接解析失败，请使用完整链接（bilibili.com/video/BVxxxxxx）' },
            { status: 400 },
          );
        }
      }

      const bvid = extractBvid(resolvedUrl);
      if (!bvid) {
        return NextResponse.json(
          { error: '无法从链接中提取B站视频 ID，请使用标准链接格式（bilibili.com/video/BVxxxxxx）' },
          { status: 400 },
        );
      }

      let videoInfo: BiliVideoInfo;
      try {
        videoInfo = await getBiliVideoInfo(bvid);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'B站视频信息获取失败';
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      if (videoInfo.duration > MAX_DURATION_SEC) {
        return NextResponse.json(
          { error: `视频时长 ${Math.round(videoInfo.duration / 60)} 分钟超过上限（30 分钟），请选择更短的视频` },
          { status: 400 },
        );
      }

      const cid = videoInfo.pages[0]?.cid ?? videoInfo.cid;
      const title = videoInfo.title;

      await writeFile(statusPath, JSON.stringify({ status: 'downloading', progress: 0, title }));

      // 异步下载B站视频
      downloadBiliVideo(bvid, cid, videoPath)
        .then(async () => {
          await writeFile(statusPath, JSON.stringify({ status: 'processing', progress: 10, title }));
          const { CoachVideoProcessor } = await import('@/lib/coach-video-processor');
          return CoachVideoProcessor.process(videoPath, recordingId);
        })
        .catch(async err => {
          console.error('[coach-video-link] bilibili download/processing failed:', err);
          await writeFile(
            statusPath,
            JSON.stringify({
              status: 'error',
              error: err instanceof Error ? err.message : 'B站视频下载失败',
              title,
            }),
          ).catch(() => {});
        });

      return NextResponse.json({
        recordingId,
        coachVideoUrl: `/uploads/coach-videos/${recordingId}.mp4`,
        status: 'downloading',
        title,
        duration: videoInfo.duration,
        source: 'bilibili-api',
      });
    }

    // ====== 路径三：其他视频平台 → yt-dlp 解析下载 ======
    if (!(await ytdlpAvailable())) {
      return NextResponse.json(
        { error: '服务端未安装 yt-dlp。请提供视频直链（.mp4/.webm）代替平台页面链接' },
        { status: 500 },
      );
    }

    let info: { duration: number; title: string };
    try {
      info = await getVideoInfo(cleanUrl);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : '无法解析视频链接' },
        { status: 400 },
      );
    }

    if (info.duration > MAX_DURATION_SEC) {
      return NextResponse.json(
        { error: `视频时长 ${Math.round(info.duration / 60)} 分钟超过上限（30 分钟），请选择更短的视频` },
        { status: 400 },
      );
    }

    await writeFile(statusPath, JSON.stringify({ status: 'downloading', progress: 0, title: info.title }));

    downloadVideo(cleanUrl, videoPath)
      .then(async () => {
        await writeFile(statusPath, JSON.stringify({ status: 'processing', progress: 10, title: info.title }));
        const { CoachVideoProcessor } = await import('@/lib/coach-video-processor');
        return CoachVideoProcessor.process(videoPath, recordingId);
      })
      .catch(async err => {
        console.error('[coach-video-link] processing failed:', err);
        await writeFile(
          statusPath,
          JSON.stringify({
            status: 'error',
            error: err instanceof Error ? err.message : '处理失败',
            title: info.title,
          }),
        ).catch(() => {});
      });

    return NextResponse.json({
      recordingId,
      coachVideoUrl: `/uploads/coach-videos/${recordingId}.mp4`,
      status: 'downloading',
      title: info.title,
      duration: info.duration,
      source: 'yt-dlp',
    });
  } catch (err) {
    console.error('[coach-video-link] error:', err);
    return NextResponse.json({ error: '请求失败' }, { status: 500 });
  }
}
