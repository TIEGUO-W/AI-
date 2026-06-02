interface HealthConnectModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
}

const HEALTH_SHORTCUT_URL =
  process.env.NEXT_PUBLIC_HEALTH_SHORTCUT_URL ||
  'https://www.icloud.com/shortcuts/dfbd7fc9cf984585a5da6bf637fe923e';

export default function HealthConnectModal({ open, onClose, sessionId }: HealthConnectModalProps) {
  if (!open) return null;

  const uploadPath = sessionId
    ? `/api/sensor?sessionId=${encodeURIComponent(sessionId)}`
    : '/api/sensor?sessionId=';
  const uploadUrl = typeof window === 'undefined'
    ? uploadPath
    : `${window.location.protocol}//${window.location.host}${uploadPath}`;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-cyber-cyan/30 bg-slate-950/95 shadow-2xl">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyber-cyan/70 to-transparent" />

        <div className="border-b border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-cyber-cyan">
                Apple Health Sync
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">连接你的真实健康数据</h2>
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
          <p className="text-sm leading-relaxed text-slate-300">
            网站不能直接读取 iPhone 健康 App。请在 iPhone 上一键安装我们的 iCloud 快捷指令，授权后由手机把心率、步数、睡眠、HRV 等真实数据上传到当前个人会话。
          </p>

          <a
            href={HEALTH_SHORTCUT_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center rounded-xl border border-cyber-cyan/50 bg-cyber-cyan/15 px-4 py-3 text-sm font-semibold text-cyber-cyan hover:bg-cyber-cyan/25"
          >
            一键安装 iCloud 健康采集快捷指令
          </a>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">Personal Session ID</p>
            <p className="mt-1 break-all text-xs font-mono text-slate-200">{sessionId || '生成中'}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500">Shortcut POST URL</p>
            <p className="mt-1 break-all text-xs font-mono text-cyber-cyan">{uploadUrl}</p>
          </div>

          <div className="rounded-xl border border-yellow-700/30 bg-yellow-950/20 p-3">
            <p className="text-xs leading-relaxed text-yellow-200/80">
              快捷指令请求体必须携带上面的 sessionId。不要再使用 demo_user，否则数据会进入演示会话。
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3">
          <span className="text-[10px] font-mono text-slate-600">未上传的数据会显示为 --，不会用假数据补齐</span>
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
