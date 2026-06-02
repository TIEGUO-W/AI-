import type { DashboardData } from '@/types/dashboard';
import { getCoachMessage } from '@/utils/coachVoice';

const initialAction = '深蹲';
const initialHR = 168;
const initialScore = 85;

export const mockData: DashboardData = {
  environment: {
    aiActive: true,
    connectionStatus: 'disconnected',
    sensorUpdatedAt: null,
  },
  workout: {
    currentAction: initialAction,
    reps: 0,
    targetReps: 20,
    score: initialScore,
    isFormDeformed: false,
  },
  biometrics: {
    heartRate: initialHR,
    hrThreshold: 160,
    hasLiveHeartRate: false,
    source: 'demo',
    updatedAt: null,
  },
  assistant: {
    ...getCoachMessage(initialHR, initialScore, initialAction, false),
    modelId: 'blue',
  },
};
