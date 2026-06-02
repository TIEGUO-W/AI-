export interface HealthMetricInput {
  heartRate?: number | null;
  restingHeartRate?: number | null;
  hrv?: number | null;
  sleepHours?: number | null;
  steps?: number | null;
  activeEnergy?: number | null;
  recoveryIndex?: number | null;
}

export interface RecoveryBreakdown {
  recoveryIndex: number | null;
  sleepScore: number | null;
  hrvScore: number | null;
  restingHrScore: number | null;
  activityLoadScore: number | null;
  sleepQuality: 'poor' | 'fair' | 'good' | null;
  loadLevel: 'low' | 'moderate' | 'high' | null;
  recommendation: 'recover' | 'moderate' | 'train' | null;
  hasAnyInput: boolean;
  hasRecovery: boolean;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value);
}

function scoreSleep(hours?: number | null): number | null {
  if (typeof hours !== 'number') return null;
  if (hours < 4) return 25;
  if (hours < 6) return 45 + (hours - 4) * 10;
  if (hours <= 8) return 75 + (hours - 6) * 10;
  if (hours <= 9) return 95;
  return 85;
}

function scoreHrv(hrv?: number | null): number | null {
  if (typeof hrv !== 'number') return null;
  return clamp((hrv / 60) * 100);
}

function scoreRestingHr(restingHeartRate?: number | null): number | null {
  const hr = restingHeartRate;
  if (typeof hr !== 'number') return null;
  if (hr <= 55) return 95;
  if (hr <= 70) return 90 - (hr - 55) * 1.2;
  if (hr <= 85) return 72 - (hr - 70) * 2;
  return clamp(40 - (hr - 85) * 1.5);
}

function scoreActivityLoad(steps?: number | null, activeEnergy?: number | null): number | null {
  const hasSteps = typeof steps === 'number';
  const hasEnergy = typeof activeEnergy === 'number';
  if (!hasSteps && !hasEnergy) return null;

  const stepLoad = hasSteps ? clamp(steps / 12000 * 100) : null;
  const energyLoad = hasEnergy ? clamp(activeEnergy / 600 * 100) : null;
  const load = stepLoad !== null && energyLoad !== null
    ? (stepLoad * 0.55) + (energyLoad * 0.45)
    : stepLoad ?? energyLoad ?? 0;
  return clamp(100 - Math.max(0, load - 45) * 0.9);
}

function sleepQuality(score: number): RecoveryBreakdown['sleepQuality'] {
  if (score >= 80) return 'good';
  if (score >= 60) return 'fair';
  return 'poor';
}

function loadLevel(score: number): RecoveryBreakdown['loadLevel'] {
  if (score >= 75) return 'low';
  if (score >= 50) return 'moderate';
  return 'high';
}

function recommendation(score: number): RecoveryBreakdown['recommendation'] {
  if (score >= 75) return 'train';
  if (score >= 55) return 'moderate';
  return 'recover';
}

export function calculateRecovery(input: HealthMetricInput): RecoveryBreakdown {
  const hasAnyInput = [
    input.heartRate,
    input.restingHeartRate,
    input.hrv,
    input.sleepHours,
    input.steps,
    input.activeEnergy,
    input.recoveryIndex,
  ].some((value) => typeof value === 'number');

  if (!hasAnyInput) {
    return {
      recoveryIndex: null,
      sleepScore: null,
      hrvScore: null,
      restingHrScore: null,
      activityLoadScore: null,
      sleepQuality: null,
      loadLevel: null,
      recommendation: null,
      hasAnyInput: false,
      hasRecovery: false,
    };
  }

  const sleep = scoreSleep(input.sleepHours);
  const hrv = scoreHrv(input.hrv);
  const restingHr = scoreRestingHr(input.restingHeartRate);
  const activityLoad = scoreActivityLoad(input.steps, input.activeEnergy);

  if (typeof input.recoveryIndex === 'number') {
    const recoveryIndex = round(clamp(input.recoveryIndex));
    return {
      recoveryIndex,
      sleepScore: sleep === null ? null : round(sleep),
      hrvScore: hrv === null ? null : round(hrv),
      restingHrScore: restingHr === null ? null : round(restingHr),
      activityLoadScore: activityLoad === null ? null : round(activityLoad),
      sleepQuality: sleep === null ? null : sleepQuality(sleep),
      loadLevel: activityLoad === null ? null : loadLevel(activityLoad),
      recommendation: recommendation(recoveryIndex),
      hasAnyInput: true,
      hasRecovery: true,
    };
  }

  const components = [
    { score: sleep, weight: 0.35 },
    { score: hrv, weight: 0.25 },
    { score: restingHr, weight: 0.20 },
    { score: activityLoad, weight: 0.20 },
  ].filter((component): component is { score: number; weight: number } => component.score !== null);
  const hasRecovery = components.length >= 2;
  const recoveryIndex = hasRecovery
    ? round(clamp(
        components.reduce((sum, component) => sum + component.score * component.weight, 0) /
        components.reduce((sum, component) => sum + component.weight, 0),
      ))
    : null;

  return {
    recoveryIndex,
    sleepScore: sleep === null ? null : round(sleep),
    hrvScore: hrv === null ? null : round(hrv),
    restingHrScore: restingHr === null ? null : round(restingHr),
    activityLoadScore: activityLoad === null ? null : round(activityLoad),
    sleepQuality: sleep === null ? null : sleepQuality(sleep),
    loadLevel: activityLoad === null ? null : loadLevel(activityLoad),
    recommendation: recoveryIndex === null ? null : recommendation(recoveryIndex),
    hasAnyInput: true,
    hasRecovery,
  };
}
