export const AUDIO_COST_PER_SCENE = 0.05; // ElevenLabs per scene
export const VIDEO_COST_PER_SCENE = 0.15; // Runway per scene

export interface RegenerationCostInput {
  narrationDirty: boolean;
  visualDirty: boolean;
}

/**
 * Estimates total API cost for a set of dirty scenes.
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

export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}
