import type { KeyframeVariant } from './api'

export type ScenePlanScene = {
  scene_id: string
  duration_s: number
  characters: string[]
  image_prompt: string
  motion_prompt: string
  camera: string
  voiceover: string
  speaker?: string
  sfx_tags: string[]
  model_hint: 'action' | 'dialog' | 'landscape'
  /** Populated by GET /api/shorts/:jobId — keyframe variants from scene_keyframes table */
  keyframe_variants?: KeyframeVariant[]
}
