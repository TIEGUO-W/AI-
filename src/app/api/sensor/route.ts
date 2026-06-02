import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculateRecovery, type RecoveryBreakdown } from '@/lib/health-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SensorState {
  heartRate?: number | null;
  steps?: number | null;
  activeEnergy?: number | null;
  restingHeartRate?: number | null;
  hrv?: number | null;
  sleepHours?: number | null;
  recoveryIndex?: number | null;
  temp?: number | null;
  humidity?: number | null;
  source?: 'apple_health' | 'manual';
  updatedAt: number | null;
  updatedAtIso?: string | null;
  recoveryBreakdown?: RecoveryBreakdown;
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

function mergeNumber(
  body: Record<string, unknown>,
  keys: string[],
  previous: number | null | undefined,
): number | null | undefined {
  const hasKey = keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!hasKey) return previous;
  return readFirstNumber(body, keys) ?? null;
}

function mergeSleepHours(
  body: Record<string, unknown>,
  previous: number | null | undefined,
): number | null | undefined {
  const direct = mergeNumber(body, ['sleepHours', 'sleep', 'sleep_hours', '睡眠', '睡眠时长'], previous);
  if (direct !== previous) return direct;

  const minutes = mergeNumber(body, ['sleepMinutes', 'sleep_minutes', '睡眠分钟'], undefined);
  if (typeof minutes === 'number') return Math.round((minutes / 60) * 10) / 10;
  if (minutes === null) return null;

  const seconds = mergeNumber(body, ['sleepSeconds', 'sleep_seconds', '睡眠秒数'], undefined);
  if (typeof seconds === 'number') return Math.round((seconds / 3600) * 10) / 10;
  if (seconds === null) return null;

  return previous;
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
    const draft: SensorState = {
      ...sensorState,
      heartRate: mergeNumber(body, ['heartRate', 'hr', 'heart_rate', '心率'], sensorState.heartRate),
      steps: mergeNumber(body, ['steps', 'stepCount', 'step_count', '步数'], sensorState.steps),
      activeEnergy: mergeNumber(body, ['activeEnergy', 'calories', 'energy', '活动能量', '卡路里'], sensorState.activeEnergy),
      restingHeartRate: mergeNumber(body, ['restingHeartRate', 'restingHR', 'resting_hr', '静息心率'], sensorState.restingHeartRate),
      hrv: mergeNumber(body, ['hrv', 'HRV', '心率变异性'], sensorState.hrv),
      sleepHours: mergeSleepHours(body, sensorState.sleepHours),
      recoveryIndex: mergeNumber(body, ['recoveryIndex', 'recovery', '恢复指数'], sensorState.recoveryIndex),
      temp: mergeNumber(body, ['temp', 'temperature', '温度'], sensorState.temp),
      humidity: mergeNumber(body, ['humidity', '湿度'], sensorState.humidity),
      source: body.source === 'manual' ? 'manual' : 'apple_health',
      updatedAt,
      updatedAtIso: new Date(updatedAt).toISOString(),
      lastReceived: body,
    };
    const recovery = calculateRecovery(draft);
    const next: SensorState = {
      ...draft,
      recoveryIndex: recovery.recoveryIndex,
      recoveryBreakdown: recovery,
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
