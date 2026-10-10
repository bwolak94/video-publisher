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
}
