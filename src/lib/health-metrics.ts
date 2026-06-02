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
  recoveryIndex: number;
  sleepScore: number;
  hrvScore: number;
  restingHrScore: number;
  activityLoadScore: number;
  sleepQuality: 'poor' | 'fair' | 'good';
  loadLevel: 'low' | 'moderate' | 'high';
  recommendation: 'recover' | 'moderate' | 'train';
  hasAnyInput: boolean;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value);
}

function scoreSleep(hours?: number | null): number {
  if (typeof hours !== 'number') return 60;
  if (hours < 4) return 25;
  if (hours < 6) return 45 + (hours - 4) * 10;
  if (hours <= 8) return 75 + (hours - 6) * 10;
  if (hours <= 9) return 95;
  return 85;
}

function scoreHrv(hrv?: number | null): number {
  if (typeof hrv !== 'number') return 60;
  return clamp((hrv / 60) * 100);
}

function scoreRestingHr(restingHeartRate?: number | null, currentHeartRate?: number | null): number {
  const hr = typeof restingHeartRate === 'number' ? restingHeartRate : currentHeartRate;
  if (typeof hr !== 'number') return 60;
  if (hr <= 55) return 95;
  if (hr <= 70) return 90 - (hr - 55) * 1.2;
  if (hr <= 85) return 72 - (hr - 70) * 2;
  return clamp(40 - (hr - 85) * 1.5);
}

function scoreActivityLoad(steps?: number | null, activeEnergy?: number | null): number {
  const stepLoad = typeof steps === 'number' ? clamp(steps / 12000 * 100) : 50;
  const energyLoad = typeof activeEnergy === 'number' ? clamp(activeEnergy / 600 * 100) : 50;
  const load = (stepLoad * 0.55) + (energyLoad * 0.45);
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
      recoveryIndex: 0,
      sleepScore: 0,
      hrvScore: 0,
      restingHrScore: 0,
      activityLoadScore: 0,
      sleepQuality: 'poor',
      loadLevel: 'moderate',
      recommendation: 'recover',
      hasAnyInput: false,
    };
  }

  if (typeof input.recoveryIndex === 'number') {
    const recoveryIndex = round(clamp(input.recoveryIndex));
    const sleep = scoreSleep(input.sleepHours);
    const hrv = scoreHrv(input.hrv);
    const restingHr = scoreRestingHr(input.restingHeartRate, input.heartRate);
    const activityLoad = scoreActivityLoad(input.steps, input.activeEnergy);
    return {
      recoveryIndex,
      sleepScore: round(sleep),
      hrvScore: round(hrv),
      restingHrScore: round(restingHr),
      activityLoadScore: round(activityLoad),
      sleepQuality: sleepQuality(sleep),
      loadLevel: loadLevel(activityLoad),
      recommendation: recommendation(recoveryIndex),
      hasAnyInput: true,
    };
  }

  const sleep = scoreSleep(input.sleepHours);
  const hrv = scoreHrv(input.hrv);
  const restingHr = scoreRestingHr(input.restingHeartRate, input.heartRate);
  const activityLoad = scoreActivityLoad(input.steps, input.activeEnergy);
  const recoveryIndex = round(clamp(
    sleep * 0.35 +
    hrv * 0.25 +
    restingHr * 0.20 +
    activityLoad * 0.20,
  ));

  return {
    recoveryIndex,
    sleepScore: round(sleep),
    hrvScore: round(hrv),
    restingHrScore: round(restingHr),
    activityLoadScore: round(activityLoad),
    sleepQuality: sleepQuality(sleep),
    loadLevel: loadLevel(activityLoad),
    recommendation: recommendation(recoveryIndex),
    hasAnyInput: true,
  };
}
