import { useState, useEffect, useRef, useCallback } from 'react';
import type { Biometrics, CoachPersonality } from '@/types/dashboard';
import { PERSONALITY_LABELS, PERSONALITY_EMOJI } from '@/utils/coachVoice';
import { calculateRecovery } from '@/lib/health-metrics';

interface CustomPlanModalProps {
  open: boolean;
  onClose: () => void;
  personality: CoachPersonality;
  biometrics: Biometrics;
}

type Step = 'syncing' | 'metrics' | 'plan';

// Simulated health metrics
const MOCK_METRICS = {
  sleepHours: 5.2,
  sleepQuality: 'poor' as const,
  restingHR: 62,
  hrv: 34,
  recoveryIndex: 45,
  lastWorkout: '昨天 18:30 · 深蹲 4组',
};

const SLEEP_ADVICE: Record<string, string> = {
  poor: '睡眠不足，恢复不充分',
  fair: '睡眠尚可，基本恢复',
  good: '睡眠充足，完全恢复',
};

const RECOVERY_ADVICE = {
  recover: {
    label: '恢复优先',
    text: '今日不宜冲击极限，以恢复性训练为主。',
    plan: [
      { emoji: '🧘', title: '动态拉伸', desc: '全身关节活化 · 15 分钟', color: 'from-green-400/20 to-cyan-400/10 border-green-700/30' },
      { emoji: '🚶', title: '低强度有氧', desc: '快走或骑行 · 心率 ≤ 120 BPM · 20 分钟', color: 'from-blue-400/20 to-purple-500/10 border-blue-700/30' },
      { emoji: '🧊', title: '筋膜放松', desc: '泡沫轴全身滚动 · 10 分钟', color: 'from-purple-400/20 to-pink-500/10 border-purple-700/30' },
    ],
  },
  moderate: {
    label: '适中训练',
    text: '今天适合中等强度训练，注意控制组间休息。',
    plan: [
      { emoji: '🧘', title: '动态热身', desc: '髋膝踝激活 · 10 分钟', color: 'from-green-400/20 to-cyan-400/10 border-green-700/30' },
      { emoji: '🏋️', title: '技术训练', desc: '自重深蹲或俯卧撑 · 3 组', color: 'from-cyan-400/20 to-blue-500/10 border-cyber-cyan/30' },
      { emoji: '🚶', title: '轻有氧收尾', desc: '心率 ≤ 130 BPM · 15 分钟', color: 'from-blue-400/20 to-purple-500/10 border-blue-700/30' },
    ],
  },
  train: {
    label: '状态良好',
    text: '恢复状态不错，可以安排正常训练，但仍需保持动作质量。',
    plan: [
      { emoji: '🔥', title: '充分热身', desc: '动态拉伸 + 激活 · 12 分钟', color: 'from-orange-400/20 to-red-500/10 border-orange-700/30' },
      { emoji: '🏋️', title: '主训练', desc: '目标动作 · 4 组 × 12-15 次', color: 'from-cyan-400/20 to-blue-500/10 border-cyber-cyan/30' },
      { emoji: '🧊', title: '拉伸恢复', desc: '训练后放松 · 10 分钟', color: 'from-purple-400/20 to-pink-500/10 border-purple-700/30' },
    ],
  },
} as const;

const DEMO_DATA_LABEL = '演示数据';

export default function CustomPlanModal({ open, onClose, personality, biometrics }: CustomPlanModalProps) {
  const [step, setStep] = useState<Step>('syncing');
  const [syncProgress, setSyncProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recovery = biometrics.recoveryBreakdown ?? calculateRecovery(biometrics);
  const recoveryAdvice = RECOVERY_ADVICE[recovery.recommendation];
  const metrics = {
    sleepHours: biometrics.sleepHours ?? MOCK_METRICS.sleepHours,
    sleepQuality: recovery.sleepQuality,
    restingHR: biometrics.restingHeartRate ?? biometrics.heartRate ?? MOCK_METRICS.restingHR,
    hrv: biometrics.hrv ?? MOCK_METRICS.hrv,
    recoveryIndex: recovery.recoveryIndex,
    lastWorkout: MOCK_METRICS.lastWorkout,
    sourceLabel: biometrics.source === 'apple_health' ? 'Apple Health' : DEMO_DATA_LABEL,
  };

  // Reset and start flow when opened
  useEffect(() => {
    if (!open) {
      setStep('syncing');
      setSyncProgress(0);
      return;
    }

    // ── Step 1: Syncing animation ─────────────────────────────────
    const t1 = setInterval(() => {
      setSyncProgress((p) => {
        if (p >= 100) {
          clearInterval(t1);
          return 100;
        }
        return p + Math.random() * 18;
      });
    }, 200);

    const t2 = setTimeout(() => {
      clearInterval(t1);
      setSyncProgress(100);
      setStep('metrics');
    }, 2200);

    return () => {
      clearInterval(t1);
      clearTimeout(t2);
    };
  }, [open]);

  // ── Step 2 → 3: Metrics then Plan ──────────────────────────────
  useEffect(() => {
    if (step !== 'metrics') return;
    const t = setTimeout(() => setStep('plan'), 1800);
    return () => clearTimeout(t);
  }, [step]);

  const handleClose = useCallback(() => {
    setStep('syncing');
    setSyncProgress(0);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={handleClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" />

      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/90 backdrop-blur-xl shadow-2xl overflow-hidden animate-slide-up"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{step === 'syncing' ? '🔄' : step === 'metrics' ? '📊' : '⚡'}</span>
            <h2 className="text-sm font-semibold text-white tracking-wide">
              {step === 'syncing'
                ? '同步健康数据'
                : step === 'metrics'
                  ? '身体状态评估'
                  : 'AI 定制今日计划'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-500 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="px-5 py-4 min-h-[280px]">
          {/* ═══ STEP 1: Syncing ═══════════════════════════════ */}
          {step === 'syncing' && (
            <div className="flex flex-col items-center justify-center py-6">
              {/* Animated rings */}
              <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-slate-700/50" />
                <div
                  className="absolute inset-0 rounded-full border-2 border-cyber-cyan/40 animate-spin"
                  style={{
                    clipPath: `inset(0 0 ${100 - syncProgress}% 0)`,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-mono font-bold text-cyber-cyan tabular-nums">
                    {Math.round(syncProgress)}%
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-300 font-mono tracking-wide mb-1">
                正在读取健康数据
              </p>
              <p className="text-[11px] text-slate-500 font-mono">
                Syncing Demo Health Data...
              </p>

              {/* Pulsing data lines */}
              <div className="mt-5 w-full space-y-2">
                {['心率变异性 (HRV)', '静息心率', '睡眠分析', '运动负荷', '恢复指数'].map((label, i) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30"
                    style={{ opacity: syncProgress > i * 18 ? 1 : 0.3, transition: 'opacity 0.3s' }}
                  >
                    <span className="text-[11px] text-slate-400 font-mono">{label}</span>
                    {syncProgress > i * 18 + 10 ? (
                      <span className="text-[11px] text-cyber-cyan font-mono tabular-nums">
                        {label === '心率变异性 (HRV)' ? `${metrics.hrv} ms` :
                         label === '静息心率' ? `${metrics.restingHR} BPM` :
                         label === '睡眠分析' ? `${metrics.sleepHours} h` :
                         label === '运动负荷' ? recovery.loadLevel : `${metrics.recoveryIndex}%`}
                      </span>
                    ) : (
                      <span className="inline-block w-12 h-3 rounded bg-slate-700/60 animate-pulse" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Metrics Review ═════════════════════════ */}
          {step === 'metrics' && (
            <div className="space-y-3 animate-slide-up">
              <p className="text-[11px] text-slate-500 font-mono mb-2">
                数据同步完成 · 基于过去 48h 数据分析
              </p>

              {/* Sleep card */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-orange-700/40 bg-orange-950/30">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">😴</span>
                  <div>
                    <p className="text-xs text-slate-300 font-medium">昨晚睡眠</p>
                    <p className="text-[10px] text-orange-400/70 font-mono">{SLEEP_ADVICE[metrics.sleepQuality]}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-orange-400 font-mono tabular-nums">
                  {metrics.sleepHours}<span className="text-xs font-normal text-orange-400/60"> h</span>
                </span>
              </div>

              {/* Resting HR card */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-cyber-cyan/20 bg-slate-800/40">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">💓</span>
                  <div>
                    <p className="text-xs text-slate-300 font-medium">静息心率</p>
                    <p className="text-[10px] text-cyber-cyan/60 font-mono">正常范围</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-cyber-cyan font-mono tabular-nums">
                  {metrics.restingHR}<span className="text-xs font-normal text-cyber-cyan/60"> BPM</span>
                </span>
              </div>

              {/* Recovery index card */}
              <div className="flex items-center justify-between p-3 rounded-xl border border-red-700/30 bg-red-950/25">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">📉</span>
                  <div>
                    <p className="text-xs text-slate-300 font-medium">身体恢复指数</p>
                    <p className="text-[10px] text-red-400/70 font-mono">
                      {recoveryAdvice.label} · 睡眠{recovery.sleepScore}/HRV{recovery.hrvScore}/负荷{recovery.activityLoadScore}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold text-red-400 font-mono tabular-nums">
                  {metrics.recoveryIndex}<span className="text-xs font-normal text-red-400/60">%</span>
                </span>
              </div>

              {/* Last workout */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <span className="text-[10px] text-slate-500 font-mono">上次训练</span>
                <span className="text-[11px] text-slate-400 font-mono">{MOCK_METRICS.lastWorkout}</span>
              </div>
            </div>
          )}

          {/* ═══ STEP 3: AI Plan ════════════════════════════════ */}
          {step === 'plan' && (
            <div className="animate-slide-up space-y-4">
              {/* Coach verdict */}
              <div className="p-4 rounded-xl border border-cyber-cyan/20 bg-cyber-cyan/5">
                <div className="flex items-center gap-2 mb-2">
                  <span>{PERSONALITY_EMOJI[personality]}</span>
                  <span className="text-xs font-semibold text-cyber-cyan">
                    {PERSONALITY_LABELS[personality]} · AI 评估结论
                  </span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">
                  检测到你昨晚睡眠 <span className="text-orange-400 font-semibold">{metrics.sleepHours} 小时</span>，
                  身体恢复指数 <span className="text-red-400 font-semibold">{metrics.recoveryIndex}%</span>。
                  今日<span className="text-cyber-cyan font-semibold">{recoveryAdvice.text}</span>
                </p>
              </div>

              {/* Today's plan */}
              <div>
                <h4 className="text-xs font-semibold text-white tracking-wide mb-2.5 flex items-center gap-1.5">
                  <span className="w-1 h-4 rounded-full bg-cyber-cyan inline-block" />
                  今日运动清单
                </h4>
                <div className="space-y-2">
                  {recoveryAdvice.plan.map((item) => (
                    <div
                      key={item.title}
                      className={`flex items-center gap-3 p-3 rounded-xl border bg-gradient-to-r ${item.color} bg-slate-800/40`}
                    >
                      <span className="text-lg flex-shrink-0">{item.emoji}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-200 font-medium truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Disclaimer */}
              <p className="text-[10px] text-slate-600 font-mono text-center">
                恢复度 = 睡眠35% + HRV25% + 静息心率20% + 运动负荷20% · 实际计划请咨询专业教练
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="px-5 py-3 border-t border-slate-700/40 flex items-center justify-between">
          <span className="text-[10px] text-slate-600 font-mono">
            {step === 'syncing'
              ? `${DEMO_DATA_LABEL} · 未接入 HealthKit`
              : step === 'metrics'
                ? `数据来源：${metrics.sourceLabel}`
                : `🎯 ${PERSONALITY_LABELS[personality]} 生成`}
          </span>
          {step === 'plan' && (
            <button
              onClick={handleClose}
              className="px-4 py-1.5 rounded-full text-xs font-medium bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/40 hover:bg-cyber-cyan/25 transition-all"
            >
              确认计划
            </button>
          )}
        </div>

        {/* ── Top glow line ─────────────────────────────────────── */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyber-cyan/50 to-transparent" />
      </div>
    </div>
  );
}
