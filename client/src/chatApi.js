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

export async function fetchConversations(authFetch) {
  const response = await authFetch(`${API_BASE_URL}/chat/conversations`);
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to fetch conversations"));
  return response.json();
}

export async function createConversation(authFetch, { title, sourceLanguage, targetLanguage }) {
  const response = await authFetch(`${API_BASE_URL}/chat/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, sourceLanguage: sourceLanguage.code, targetLanguage: targetLanguage.code }),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to create conversation"));
  return response.json();
}

export async function fetchMessages(authFetch, conversationId) {
  const response = await authFetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages`);
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to fetch messages"));
  return response.json();
}

export async function updateConversationLanguages(
  authFetch,
  conversationId,
  { sourceLanguage, targetLanguage },
) {
  const response = await authFetch(`${API_BASE_URL}/chat/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
    }),
  });
  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to update conversation languages"),
    );
  }
  return response.json();
}

export async function archiveConversation(authFetch, conversationId) {
  const response = await authFetch(`${API_BASE_URL}/chat/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to archive conversation"),
    );
  }
  return response.json();
}

export async function saveMessage(authFetch, conversationId, messagePayload) {
  const response = await authFetch(`${API_BASE_URL}/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messagePayload),
  });
  if (!response.ok) throw new Error(await parseApiError(response, "Failed to save message"));
  return response.json();
}
