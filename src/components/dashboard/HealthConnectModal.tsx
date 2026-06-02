interface HealthConnectModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}

const HEALTH_SHORTCUT_URL =
  process.env.NEXT_PUBLIC_HEALTH_SHORTCUT_URL ||
  'https://www.icloud.com/shortcuts/dfbd7fc9cf984585a5da6bf637fe923e';

function qrUrl(value: string, size = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encodeURIComponent(value)}`;
}

export default function HealthConnectModal({ open, onClose, sessionId }: HealthConnectModalProps) {
  if (!open) return null;

  const uploadPath = sessionId
    ? `/api/sensor?sessionId=${encodeURIComponent(sessionId)}`
    : '/api/sensor?sessionId=';
  const uploadUrl = typeof window === 'undefined'
    ? uploadPath
    : `${window.location.protocol}//${window.location.host}${uploadPath}`;
  const connectPayload = JSON.stringify({ uploadUrl, sessionId });

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-cyber-cyan/30 bg-slate-950/95 shadow-2xl">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyber-cyan/70 to-transparent" />

        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-cyber-cyan">
                Apple Health Sync
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">用 iPhone 连接真实健康数据</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-white"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">1. 扫码安装</p>
                <span className="rounded-full bg-cyber-cyan/10 px-2 py-0.5 text-[10px] text-cyber-cyan">
                  iCloud 快捷指令
                </span>
              </div>
              <div className="flex justify-center rounded-xl bg-white p-3">
                <img
                  src={qrUrl(HEALTH_SHORTCUT_URL)}
                  alt="安装 Apple Health 快捷指令二维码"
                  className="h-44 w-44"
                />
              </div>
              <a
                href={HEALTH_SHORTCUT_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center justify-center rounded-xl border border-cyber-cyan/50 bg-cyber-cyan/15 px-4 py-2.5 text-sm font-semibold text-cyber-cyan hover:bg-cyber-cyan/25"
              >
                在 iPhone 上打开安装
              </a>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-white">2. 运行后扫码连接</p>
                <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                  绑定本网页
                </span>
              </div>
              <div className="flex justify-center rounded-xl bg-white p-3">
                <img
                  src={qrUrl(connectPayload)}
                  alt="绑定当前网页健康会话二维码"
                  className="h-44 w-44"
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                快捷指令授权后会把你手机里的健康数据发到这个网页，只绑定当前浏览器会话。
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm font-semibold text-white">本次先同步这些容易稳定获取的数据</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300 md:grid-cols-4">
              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-2">实时/最近心率</span>
              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-2">今日步数</span>
              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-2">手腕温度</span>
              <span className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-2">活动能量</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <p className="text-sm font-semibold text-white">睡眠数据下一步增强</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              睡眠包含多段记录和睡眠阶段，不能像心率、步数一样简单取一个值。我们先同步稳定字段，拿到真数据后再把睡眠聚合成可解释的恢复度输入。
            </p>
          </div>

          <details className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <summary className="cursor-pointer text-xs text-slate-500">调试信息</summary>
            <div className="mt-3 space-y-2">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">Session ID</p>
                <p className="mt-1 break-all text-xs font-mono text-slate-300">{sessionId || '生成中'}</p>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">POST URL</p>
                <p className="mt-1 break-all text-xs font-mono text-cyber-cyan">{uploadUrl}</p>
              </div>
            </div>
          </details>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
          <span className="text-[10px] font-mono text-slate-600">同步成功后，页面会自动刷新心率、步数和训练计划</span>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-300 hover:border-cyber-cyan/50 hover:text-cyber-cyan"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
