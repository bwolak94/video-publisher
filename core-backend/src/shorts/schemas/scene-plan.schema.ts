import { z } from "zod";

export const ScenePlanSceneSchema = z.object({
  scene_id: z.string(),
  duration_s: z.number().positive(),
  characters: z.array(z.string()),
  image_prompt: z.string(),
  motion_prompt: z.string(),
  camera: z.string(),
  voiceover: z.string(),
  speaker: z.string().optional(),
  sfx_tags: z.array(z.string()),
  model_hint: z.enum(["action", "dialog", "landscape"]),
});

export const ScenePlanSchema = z.array(ScenePlanSceneSchema);
export type ScenePlanScene = z.infer<typeof ScenePlanSceneSchema>;
