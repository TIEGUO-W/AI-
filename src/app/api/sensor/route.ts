import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
  updatedAtIso?: string | null;
  lastReceived?: Record<string, unknown>;
}

const stateFile = path.join(process.cwd(), '.sensor-state.json');
const emptyState: SensorState = { updatedAt: null, updatedAtIso: null };

async function readSensorState(): Promise<SensorState> {
  try {
    const raw = await readFile(stateFile, 'utf-8');
    return { ...emptyState, ...JSON.parse(raw) as SensorState };
  } catch {
    return emptyState;
  }
}

async function writeSensorState(state: SensorState): Promise<void> {
  await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const match = value.replace(',', '').match(/-?\d+(\.\d+)?/);
    const parsed = match ? Number(match[0]) : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readFirstNumber(body: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = readNumber(body[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return await request.json() as Record<string, unknown>;
  }

  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }

  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

export async function GET() {
  const sensorState = await readSensorState();
  return NextResponse.json(sensorState, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    const sensorState = await readSensorState();
    const updatedAt = Date.now();
    const next: SensorState = {
      ...sensorState,
      heartRate: readFirstNumber(body, ['heartRate', 'hr', 'heart_rate', '心率']) ?? sensorState.heartRate,
      steps: readFirstNumber(body, ['steps', 'stepCount', 'step_count', '步数']) ?? sensorState.steps,
      activeEnergy: readFirstNumber(body, ['activeEnergy', 'calories', 'energy', '活动能量', '卡路里']) ?? sensorState.activeEnergy,
      restingHeartRate: readFirstNumber(body, ['restingHeartRate', 'restingHR', 'resting_hr', '静息心率']) ?? sensorState.restingHeartRate,
      hrv: readFirstNumber(body, ['hrv', 'HRV', '心率变异性']) ?? sensorState.hrv,
      sleepHours: readFirstNumber(body, ['sleepHours', 'sleep', 'sleep_hours', '睡眠', '睡眠时长']) ?? sensorState.sleepHours,
      recoveryIndex: readFirstNumber(body, ['recoveryIndex', 'recovery', '恢复指数']) ?? sensorState.recoveryIndex,
      temp: readFirstNumber(body, ['temp', 'temperature', '温度']) ?? sensorState.temp,
      humidity: readFirstNumber(body, ['humidity', '湿度']) ?? sensorState.humidity,
      source: body.source === 'manual' ? 'manual' : 'apple_health',
      updatedAt,
      updatedAtIso: new Date(updatedAt).toISOString(),
      lastReceived: body,
    };

    await writeSensorState(next);
    return NextResponse.json({ ok: true, state: next }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sensor update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
