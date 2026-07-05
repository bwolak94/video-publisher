export class LocalizeProjectDto {
  /** BCP-47 language code for the target language (e.g. "de", "fr", "pl", "es") */
  targetLanguage!: string;
  /** voiceId for the target language (ElevenLabs or piper_ prefix for local) */
  targetVoiceId!: string;
  /** If true, also regenerate visual prompts with localized text overlays. Default false. */
  regenerateVisuals?: boolean;
}
