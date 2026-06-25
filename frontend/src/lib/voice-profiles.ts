export type Language = "en" | "pl" | "de" | "fr" | "es";

export interface VoiceProfile {
  voiceId: string;
  displayName: string;
  languageLabel: string;
}

export const VOICE_PROFILES: Record<Language, VoiceProfile> = {
  en: { voiceId: "eleven_en_adam",   displayName: "Adam",  languageLabel: "English" },
  pl: { voiceId: "eleven_pl_marek",  displayName: "Marek", languageLabel: "Polish" },
  de: { voiceId: "eleven_de_lukas",  displayName: "Lukas", languageLabel: "German" },
  fr: { voiceId: "eleven_fr_pierre", displayName: "Pierre",languageLabel: "French" },
  es: { voiceId: "eleven_es_carlos", displayName: "Carlos",languageLabel: "Spanish" },
};

export function getVoiceProfile(language: Language): VoiceProfile {
  return VOICE_PROFILES[language];
}
