import { NextRequest, NextResponse } from 'next/server';
import { ASRClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { audioUrl, base64Data } = body;

    if (!audioUrl && !base64Data) {
      return NextResponse.json(
        { error: '需要 audioUrl 或 base64Data' },
        { status: 400 }
      );
    }

    // Basic URL validation for audioUrl mode
    if (audioUrl) {
      try {
        const parsed = new URL(audioUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return NextResponse.json({ error: 'audioUrl 必须是 HTTP/HTTPS 地址' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'audioUrl 格式无效' }, { status: 400 });
      }
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new ASRClient(config, customHeaders);

    const result = await client.recognize({
      uid: 'coach-user',
      ...(audioUrl ? { url: audioUrl } : { base64Data }),
    });

    console.log('[ASR] 识别结果:', result.text);
    return NextResponse.json({ text: result.text, duration: result.duration });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '语音识别失败';
    console.error('[ASR] 错误:', message);
    // If the error is about no valid speech (silence), return empty result gracefully
    if (/no valid speech|silence audio/i.test(message)) {
      return NextResponse.json({ text: '', duration: 0 });
    }
    // If the error is about audio download failure, return 400 (client provided bad URL)
    const isDownloadError = /audio download failed|download failed/i.test(message);
    return NextResponse.json(
      { error: isDownloadError ? '音频下载失败，请检查 audioUrl 是否可访问' : message },
      { status: isDownloadError ? 400 : 500 }
    );
  }
}
