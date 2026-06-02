import { NextRequest, NextResponse } from 'next/server';

interface SensorState {
  heartRate?: number;
  steps?: number;
  activeEnergy?: number;
  restingHeartRate?: number;
  hrv?: number;
  sleepHours?: number;
  recoveryIndex?: number;
  temp?: number;
  humidity?: number;
  source?: 'apple_health' | 'manual';
  updatedAt: number | null;
}

const sensorState: SensorState = {
  updatedAt: null,
};

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function GET() {
  return NextResponse.json(sensorState);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const next: SensorState = {
      ...sensorState,
      heartRate: readNumber(body.heartRate) ?? readNumber(body.hr) ?? sensorState.heartRate,
      steps: readNumber(body.steps) ?? sensorState.steps,
      activeEnergy: readNumber(body.activeEnergy) ?? readNumber(body.calories) ?? sensorState.activeEnergy,
      restingHeartRate: readNumber(body.restingHeartRate) ?? readNumber(body.restingHR) ?? sensorState.restingHeartRate,
      hrv: readNumber(body.hrv) ?? sensorState.hrv,
      sleepHours: readNumber(body.sleepHours) ?? sensorState.sleepHours,
      recoveryIndex: readNumber(body.recoveryIndex) ?? sensorState.recoveryIndex,
      temp: readNumber(body.temp) ?? readNumber(body.temperature) ?? sensorState.temp,
      humidity: readNumber(body.humidity) ?? sensorState.humidity,
      source: body.source === 'manual' ? 'manual' : 'apple_health',
      updatedAt: Date.now(),
    };

    Object.assign(sensorState, next);
    return NextResponse.json({ ok: true, state: sensorState });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sensor update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
