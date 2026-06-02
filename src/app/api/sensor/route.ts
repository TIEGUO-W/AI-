import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculateRecovery, type RecoveryBreakdown } from '@/lib/health-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SensorState {
  sessionId?: string | null;
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
  receivedFields?: string[];
}

interface SensorStore {
  sessions: Record<string, SensorState>;
}

const stateFile = path.join(process.cwd(), '.sensor-state.json');
const emptyState: SensorState = { updatedAt: null, updatedAtIso: null };

function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || null;
}

async function readSensorStore(): Promise<SensorStore> {
  try {
    const raw = await readFile(stateFile, 'utf-8');
    const parsed = JSON.parse(raw) as SensorStore | SensorState;
    if ('sessions' in parsed && parsed.sessions) {
      return { sessions: parsed.sessions };
    }
    const legacyState = parsed as SensorState;
    const legacySessionId = normalizeSessionId(legacyState.sessionId);
    return legacySessionId ? { sessions: { [legacySessionId]: legacyState } } : { sessions: {} };
  } catch {
    return { sessions: {} };
  }
}

async function writeSensorStore(store: SensorStore): Promise<void> {
  await writeFile(stateFile, JSON.stringify(store, null, 2), 'utf-8');
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
): number | null {
  const hasKey = keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
  if (!hasKey) return null;
  return readFirstNumber(body, keys) ?? null;
}

function mergeSleepHours(
  body: Record<string, unknown>,
): number | null {
  const directKeys = ['sleepHours', 'sleep', 'sleep_hours', '睡眠', '睡眠时长'];
  if (directKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    return readFirstNumber(body, directKeys) ?? null;
  }

  const minuteKeys = ['sleepMinutes', 'sleep_minutes', '睡眠分钟'];
  if (minuteKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    const minutes = readFirstNumber(body, minuteKeys);
    return typeof minutes === 'number' ? Math.round((minutes / 60) * 10) / 10 : null;
  }

  const secondKeys = ['sleepSeconds', 'sleep_seconds', '睡眠秒数'];
  if (secondKeys.some((key) => Object.prototype.hasOwnProperty.call(body, key))) {
    const seconds = readFirstNumber(body, secondKeys);
    return typeof seconds === 'number' ? Math.round((seconds / 3600) * 10) / 10 : null;
  }

  return null;
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

export async function GET(request: NextRequest) {
  const sessionId = normalizeSessionId(request.nextUrl.searchParams.get('sessionId'));
  if (!sessionId) {
    return NextResponse.json({ ...emptyState, sessionId: null, error: 'missing sessionId' }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  }
  const store = await readSensorStore();
  const sensorState = store.sessions[sessionId] ?? { ...emptyState, sessionId };
  return NextResponse.json(sensorState, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readBody(request);
    const sessionId =
      normalizeSessionId(body.sessionId) ??
      normalizeSessionId(body.userId) ??
      normalizeSessionId(request.nextUrl.searchParams.get('sessionId'));
    if (!sessionId) {
      return NextResponse.json({ ok: false, error: 'missing sessionId' }, { status: 400 });
    }

    const store = await readSensorStore();
    const updatedAt = Date.now();
    const draft: SensorState = {
      sessionId,
      heartRate: mergeNumber(body, ['heartRate', 'hr', 'heart_rate', '心率']),
      steps: mergeNumber(body, ['steps', 'stepCount', 'step_count', '步数']),
      activeEnergy: mergeNumber(body, ['activeEnergy', 'calories', 'energy', '活动能量', '卡路里']),
      restingHeartRate: mergeNumber(body, ['restingHeartRate', 'restingHR', 'resting_hr', '静息心率']),
      hrv: mergeNumber(body, ['hrv', 'HRV', '心率变异性']),
      sleepHours: mergeSleepHours(body),
      recoveryIndex: mergeNumber(body, ['recoveryIndex', 'recovery', '恢复指数']),
      temp: mergeNumber(body, ['temp', 'temperature', '温度']),
      humidity: mergeNumber(body, ['humidity', '湿度']),
      source: body.source === 'manual' ? 'manual' : 'apple_health',
      updatedAt,
      updatedAtIso: new Date(updatedAt).toISOString(),
      receivedFields: Object.keys(body),
    };
    const recovery = calculateRecovery(draft);
    const next: SensorState = {
      ...draft,
      recoveryIndex: recovery.recoveryIndex,
      recoveryBreakdown: recovery,
    };

    const nextStore: SensorStore = {
      sessions: {
        ...store.sessions,
        [sessionId]: next,
      },
    };

    await writeSensorStore(nextStore);
    return NextResponse.json({ ok: true, state: next }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sensor update failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
