/** TypeScript interfaces for FEATURE-07 — Quality Gates. */

export type ValidationField = "videoUrl" | "audioUrl" | "duration" | "format" | "integrity";

export interface ValidationError {
  sceneId?: string;
  field: ValidationField;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationReport {
  passed: boolean;
  errors: ValidationError[];
  warnings: string[];
  checkedAt: string;
}

export type QualityIssueType =
  | "black_frames"
  | "frozen_frames"
  | "audio_clipping"
  | "low_bitrate"
  | "slideshow_risk";

export interface QualityIssue {
  type: QualityIssueType;
  severity: "error" | "warning";
  detail: string;
}

export interface QualityReport {
  passed: boolean;
  overallScore: number;        // 0-1
  slideshowRiskScore: number;  // 0-1, > 0.7 = likely slideshow
  durationSeconds: number;
  resolutionWidth: number;
  resolutionHeight: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  audioLoudnessLUFS: number;
  audioTruePeakDBFS: number;
  blackFrameCount: number;
  frozenFrameCount: number;
  issues: QualityIssue[];
  analyzedAt: string;
}
