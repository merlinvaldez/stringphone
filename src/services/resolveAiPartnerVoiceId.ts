import { getSupportedTtsLanguage } from "../lib/languages.js";
import { resolveOutputSpeechVoiceId } from "./resolveOutputSpeechVoiceId.js";

export async function resolveAiPartnerVoiceId(input: {
  languageCode: string;
  existingVoiceId?: string | null;
  existingVoiceLabel?: string | null;
}) {
  const language = getSupportedTtsLanguage(input.languageCode);

  if (!language) {
    throw new Error("Partner language is not supported for speech.");
  }

  const normalizedExistingVoiceId = input.existingVoiceId?.trim() || null;
  const voiceId =
    normalizedExistingVoiceId ?? (await resolveOutputSpeechVoiceId(language));

  return {
    language,
    provider: language.provider,
    voiceId,
    voiceLabel:
      input.existingVoiceLabel?.trim() ||
      `${language.name} AI partner voice`,
  };
}
