export const AUDIO_COST_PER_SCENE = 0.05;        // ElevenLabs per scene (~167 chars avg)
export const VIDEO_COST_PER_SCENE = 0.15;        // Runway per scene
export const LAMBDA_RENDER_COST_PER_MIN = 0.001; // AWS Lambda render

export interface RegenerationCostInput {
  narrationDirty: boolean;
  visualDirty: boolean;
}

export interface CostBreakdown {
  audioTotal: number;
  videoTotal: number;
  renderTotal: number;
  total: number;
}

export interface BreakdownInput extends RegenerationCostInput {
  durationInSeconds?: number;
}

/**
 * Estimates total API cost for a set of dirty scenes (scalar, for modal display).
 * - Audio ($0.05) only when narrationDirty
 * - Video ($0.15) only when visualDirty
 */
export function estimateCost(scenes: RegenerationCostInput[]): number {
  return scenes.reduce((total, scene) => {
    return (
      total +
      (scene.narrationDirty ? AUDIO_COST_PER_SCENE : 0) +
      (scene.visualDirty ? VIDEO_COST_PER_SCENE : 0)
    );
  }, 0);
}

/**
 * Returns a full cost breakdown (audio / video / render) for display in CostBreakdown UI.
 * Uses narrationDirty and visualDirty flags; renderTotal is always included
 * (proportional to total duration of dirty scenes).
 */
export function estimateBreakdown(scenes: BreakdownInput[]): CostBreakdown {
  const audioTotal = scenes.reduce(
    (sum, s) => sum + (s.narrationDirty ? AUDIO_COST_PER_SCENE : 0),
    0
  );
  const videoTotal = scenes.reduce(
    (sum, s) => sum + (s.visualDirty ? VIDEO_COST_PER_SCENE : 0),
    0
  );
  const totalSeconds = scenes.reduce((sum, s) => sum + (s.durationInSeconds ?? 5), 0);
  const renderTotal = (totalSeconds / 60) * LAMBDA_RENDER_COST_PER_MIN;

  return {
    audioTotal,
    videoTotal,
    renderTotal,
    total: audioTotal + videoTotal + renderTotal,
  };
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}
