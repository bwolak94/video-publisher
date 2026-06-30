export type ReferencePacing = "slow" | "medium" | "fast" | "dynamic";
export type ReferenceTone =
  | "serious"
  | "comedic"
  | "inspirational"
  | "educational"
  | "dramatic";

export interface ReferenceAudioAnalysis {
  hasMusic: boolean;
  hasSpeech: boolean;
  avgLoudnessLUFS: number;
}

export interface ReferenceAnalysisBrief {
  sourceUrl: string;
  totalDurationSeconds: number;
  sceneCount: number;
  avgSceneDurationSeconds: number;
  pacing: ReferencePacing;
  toneProfile: ReferenceTone;
  structurePattern: string;
  transcript: string;
  keyTopics: string[];
  visualStyle: string;
  audioAnalysis: ReferenceAudioAnalysis;
  analyzedAt: string | null;
}
