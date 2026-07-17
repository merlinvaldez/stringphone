const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";

export async function parseApiError(response, fallbackMessage) {
  try {
    const body = await response.json();
    return body.error ?? fallbackMessage;
  } catch {
    return response.statusText || fallbackMessage;
  }
}

export async function translateTextMessage({ text, sourceLanguage, targetLanguage }) {
  const response = await fetch(`${API_BASE_URL}/chat/messages/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Text translation failed."),
    );
  }

  return response.json();
}

export async function translateVoiceMessage({
  recording,
  sourceLanguage,
  targetLanguage,
}) {
  const formData = new FormData();
  const extension = recording.blob.type.includes("mp4") ? "m4a" : "webm";
  const fileName = `stringphone-turn.${extension}`;

  formData.append("sourceLanguage", sourceLanguage.code);
  formData.append("targetLanguage", targetLanguage.code);
  formData.append("sourceAudio", recording.blob, fileName);
  formData.append("voiceSample", recording.blob, fileName);

  const response = await fetch(`${API_BASE_URL}/chat/messages/voice`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Voice translation failed."),
    );
  }

  return response.json();
}
