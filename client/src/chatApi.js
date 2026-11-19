const API_BASE_URL =
  import.meta.env?.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";

function buildApiUrl(path, query = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value == null || value === "") {
      return;
    }

    params.set(key, String(value));
  });

  const queryString = params.toString();
  return `${API_BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;
}

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
  authFetch,
  conversationId = null,
}) {
  const formData = new FormData();
  const extension = recording.blob.type.includes("mp4") ? "m4a" : "webm";
  const fileName = `stringphone-turn.${extension}`;

  formData.append("sourceLanguage", sourceLanguage.code);
  formData.append("targetLanguage", targetLanguage.code);
  formData.append("sourceAudio", recording.blob, fileName);

  if (conversationId) {
    formData.append("conversationId", conversationId);
  }

  const request = typeof authFetch === "function" ? authFetch : fetch;
  const response = await request(`${API_BASE_URL}/chat/messages/voice`, {
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

export async function processLiveConversationSegment({
  audioBlob,
  sourceLanguage,
  targetLanguage,
  authFetch,
  conversationId = null,
  segmentStartedAt = "",
  segmentEndedAt = "",
}) {
  const formData = new FormData();
  const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
  const fileName = `stringphone-live-segment.${extension}`;

  formData.append("sourceLanguage", sourceLanguage.code);
  formData.append("targetLanguage", targetLanguage.code);
  formData.append("sourceAudio", audioBlob, fileName);

  if (conversationId) {
    formData.append("conversationId", conversationId);
  }

  if (segmentStartedAt) {
    formData.append("segmentStartedAt", segmentStartedAt);
  }

  if (segmentEndedAt) {
    formData.append("segmentEndedAt", segmentEndedAt);
  }

  const request = typeof authFetch === "function" ? authFetch : fetch;
  const response = await request(`${API_BASE_URL}/chat/messages/live-segment`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Live transcription failed."),
    );
  }

  return response.json();
}

export async function createLiveTranscriptionClientSecret({
  sourceLanguage,
  targetLanguage,
  forceFallback = false,
  fallbackReason = "",
  authFetch,
}) {
  const request = typeof authFetch === "function" ? authFetch : fetch;
  const response = await request(`${API_BASE_URL}/chat/live-transcription/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
      forceFallback,
      fallbackReason,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Unable to start live transcription."),
    );
  }

  return response.json();
}

export async function processLiveConversationTranscript({
  utteranceId,
  revision,
  transcript,
  translatedText,
  liveMode,
  sender,
  sourceLanguage,
  targetLanguage,
  audioBlob = null,
  authFetch,
  conversationId = null,
}) {
  const formData = new FormData();
  formData.append("utteranceId", utteranceId);
  formData.append("revision", String(revision));
  formData.append("transcript", transcript);
  formData.append("liveMode", liveMode);
  formData.append("sourceLanguage", sourceLanguage.code);
  formData.append("targetLanguage", targetLanguage.code);

  if (sender === "self" || sender === "partner") {
    formData.append("sender", sender);
  }

  if (translatedText) {
    formData.append("translatedText", translatedText);
  }

  if (conversationId) {
    formData.append("conversationId", conversationId);
  }

  if (audioBlob && typeof audioBlob.size === "number" && audioBlob.size > 0) {
    const extension = audioBlob.type.includes("mp4") ? "m4a" : "webm";
    formData.append(
      "sourceAudio",
      audioBlob,
      `stringphone-live-transcript.${extension}`,
    );
  }

  const request = typeof authFetch === "function" ? authFetch : fetch;
  const response = await request(`${API_BASE_URL}/chat/messages/live-transcript`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Live transcription failed."),
    );
  }

  return response.json();
}

export async function processLiveConversationDraftTranslation({
  utteranceId,
  revision,
  transcript,
  sourceLanguage,
  targetLanguage,
  authFetch,
  sender,
}) {
  const request = typeof authFetch === "function" ? authFetch : fetch;
  const response = await request(`${API_BASE_URL}/chat/messages/live-translation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      utteranceId,
      revision,
      transcript,
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
      sender,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Live draft translation failed."),
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

export async function fetchLessons(authFetch) {
  const response = await authFetch(`${API_BASE_URL}/lessons`);

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to fetch lessons"));
  }

  return response.json();
}

export async function archiveLesson(authFetch, lessonId) {
  const response = await authFetch(`${API_BASE_URL}/lessons/${lessonId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to archive lesson"));
  }

  return response.json();
}

export async function fetchOutputSpeech({
  text,
  language,
  speechVoice = null,
  clonedVoiceId = null,
  pronunciationText = "",
  authFetch,
  signal,
}) {
  const request = typeof authFetch === "function" ? authFetch : fetch;
  const trimmedPronunciation =
    typeof pronunciationText === "string" ? pronunciationText.trim() : "";
  const response = await request(`${API_BASE_URL}/speech/output`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      text,
      language,
      ...(speechVoice ? { speechVoice } : {}),
      ...(clonedVoiceId ? { clonedVoiceId } : {}),
      ...(trimmedPronunciation ? { pronunciationText: trimmedPronunciation } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Speech generation failed."),
    );
  }

  return new Blob([await response.arrayBuffer()], {
    type: response.headers.get("Content-Type") ?? "audio/wav",
  });
}

async function convertAudioBlobToWavIfPossible(blob) {
  if (
    !blob ||
    typeof window === "undefined" ||
    typeof blob.arrayBuffer !== "function"
  ) {
    return blob;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (typeof AudioContextCtor !== "function") {
    return blob;
  }

  let ctx = null;
  try {
    const rawBuffer = await blob.arrayBuffer();
    if (!rawBuffer || rawBuffer.byteLength === 0) {
      return blob;
    }
    ctx = new AudioContextCtor();
    const audioBuffer = await ctx.decodeAudioData(rawBuffer.slice(0));
    const numChannels = audioBuffer.numberOfChannels || 1;
    const sampleRate = audioBuffer.sampleRate || 44100;
    const length = audioBuffer.length || 0;
    if (length <= 0) {
      return blob;
    }

    const targetSampleRate = Math.min(sampleRate, 24000);
    const outputLength =
      targetSampleRate === sampleRate
        ? length
        : Math.max(1, Math.round((length * targetSampleRate) / sampleRate));
    const monoPcm = new Int16Array(outputLength);
    const channelData = [];
    for (let ch = 0; ch < numChannels; ch += 1) {
      channelData.push(audioBuffer.getChannelData(ch));
    }

    for (let i = 0; i < outputLength; i += 1) {
      const srcIdx =
        targetSampleRate === sampleRate
          ? i
          : Math.min(length - 1, Math.floor((i * sampleRate) / targetSampleRate));
      let sum = 0;
      for (let ch = 0; ch < numChannels; ch += 1) {
        sum += channelData[ch][srcIdx] || 0;
      }
      const avg = Math.max(-1, Math.min(1, sum / numChannels));
      monoPcm[i] = avg < 0 ? Math.round(avg * 32768) : Math.round(avg * 32767);
    }

    const pcmByteLength = monoPcm.byteLength;
    const wavArrayBuffer = new ArrayBuffer(44 + pcmByteLength);
    const view = new DataView(wavArrayBuffer);
    const writeAscii = (offset, str) => {
      for (let idx = 0; idx < str.length; idx += 1) {
        view.setUint8(offset + idx, str.charCodeAt(idx));
      }
    };

    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + pcmByteLength, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, pcmByteLength, true);

    new Uint8Array(wavArrayBuffer, 44).set(
      new Uint8Array(monoPcm.buffer, monoPcm.byteOffset, monoPcm.byteLength),
    );

    const wavBlob = new Blob([wavArrayBuffer], { type: "audio/wav" });
    if (Number.isFinite(blob.durationMs) && blob.durationMs > 0) {
      wavBlob.durationMs = blob.durationMs;
    }
    return wavBlob;
  } catch {
    return blob;
  } finally {
    void ctx?.close?.().catch?.(() => undefined);
  }
}

export async function requestChatVoiceClone({
  conversationId = null,
  language,
  samples = [],
  authFetch,
  signal,
}) {
  const formData = new FormData();
  formData.append("language", typeof language === "string" ? language : language?.code || "");
  if (conversationId) {
    formData.append("conversationId", String(conversationId));
  }

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i];
    if (!sample?.blob) continue;
    const uploadBlob = await convertAudioBlobToWavIfPossible(sample.blob);
    const mimeType = uploadBlob.type || sample.mimeType || sample.blob.type || "audio/webm";
    const ext = mimeType.includes("wav")
      ? "wav"
      : mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : "webm";
    formData.append("samples", uploadBlob, `stringphone-sample-${i + 1}.${ext}`);
    formData.append("transcripts", typeof sample.transcript === "string" ? sample.transcript : "");
  }

  const request = typeof authFetch === "function" ? authFetch : fetch;
  const response = await request(`${API_BASE_URL}/speech/clone`, {
    method: "POST",
    signal,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Voice cloning failed."),
    );
  }

  return response.json();
}

export async function createLanguageLesson(
  requestImpl,
  {
    source,
    topic,
    sourceLanguage,
    targetLanguage,
    conversationId,
    messages,
  },
) {
  const response = await requestImpl(`${API_BASE_URL}/lessons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source,
      topic,
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
      conversationId: conversationId ?? null,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to create lesson"));
  }

  return response.json();
}

export async function fetchCollections(authFetch, { q = "" } = {}) {
  const response = await authFetch(buildApiUrl("/collections", { q }));

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to fetch collections"));
  }

  return response.json();
}

export async function fetchCollection(authFetch, languageCode, { q = "" } = {}) {
  const response = await authFetch(
    buildApiUrl(`/collections/${encodeURIComponent(languageCode)}`, { q }),
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to fetch collection"));
  }

  return response.json();
}

export async function saveCollectionEntry(authFetch, payload) {
  const response = await authFetch(`${API_BASE_URL}/collections/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to save collection entry"),
    );
  }

  return response.json();
}

export async function updateCollectionEntry(authFetch, payload) {
  const response = await authFetch(`${API_BASE_URL}/collections/entries`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to update collection entry"),
    );
  }

  return response.json();
}

export async function archiveCollectionEntry(authFetch, entryId) {
  const response = await authFetch(
    buildApiUrl("/collections/entries", { entryId }),
    {
      method: "DELETE",
    },
  );

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to archive collection entry"),
    );
  }

  return response.json();
}
