export type PipelineStep =
  | "research"
  | "script"
  | "quality_review"
  | `audio_scene_${number}`
  | `video_scene_${number}`
  | "render"
  | "youtube_upload";

export type JobProgressEvent =
  | { type: "step_started"; projectId: string; step: string; jobId: string }
  | { type: "step_completed"; projectId: string; step: string; jobId: string; durationMs?: number }
  | { type: "step_failed"; projectId: string; step: string; jobId: string; error: string }
  | { type: "render_progress"; projectId: string; percent: number }
  | { type: "upload_progress"; projectId: string; percent: number }
  | { type: "pipeline_done"; projectId: string; videoUrl: string };
