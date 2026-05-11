const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";
const SHARED_ROOM_TRANSPORT = import.meta.env.VITE_SHARED_ROOM_TRANSPORT ?? "auto";
export const SHARED_ROOM_POLL_INTERVAL_MS = 2000;

async function parseApiError(response, fallbackMessage) {
  try {
    const body = await response.json();
    return body.error ?? fallbackMessage;
  } catch {
    return response.statusText || fallbackMessage;
  }
}

export async function createSharedRoom({
  hostLanguageCode,
  guestLanguageCode,
  displayName = "Host",
}) {
  const response = await fetch(`${API_BASE_URL}/chat/rooms`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      displayName,
      hostLanguage: hostLanguageCode,
      guestLanguage: guestLanguageCode,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to create live room."));
  }

  return response.json();
}

export async function joinSharedRoom({ inviteToken, displayName = "Guest" }) {
  const response = await fetch(`${API_BASE_URL}/chat/rooms/join`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inviteToken,
      displayName,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to join live room."));
  }

  return response.json();
}

export async function fetchSharedRoomSnapshot({
  roomId,
  participantSessionToken,
}) {
  const searchParams = new URLSearchParams({
    session: participantSessionToken,
  });
  const response = await fetch(
    `${API_BASE_URL}/chat/rooms/${roomId}?${searchParams.toString()}`,
  );

  if (!response.ok) {
    throw new Error(await parseApiError(response, "Failed to load live room."));
  }

  return response.json();
}

export async function updateSharedRoomLanguages({
  roomId,
  participantSessionToken,
  hostLanguageCode,
  guestLanguageCode,
}) {
  const response = await fetch(`${API_BASE_URL}/chat/rooms/${roomId}/languages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      participantSessionToken,
      hostLanguage: hostLanguageCode,
      guestLanguage: guestLanguageCode,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to update live room languages."),
    );
  }

  return response.json();
}

export async function sendSharedRoomTextMessage({
  roomId,
  participantSessionToken,
  text,
}) {
  const response = await fetch(`${API_BASE_URL}/chat/rooms/${roomId}/messages/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      participantSessionToken,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to send live text message."),
    );
  }

  return response.json();
}

export async function sendSharedRoomVoiceMessage({
  roomId,
  participantSessionToken,
  recording,
}) {
  const formData = new FormData();
  const extension = recording.blob.type.includes("mp4") ? "m4a" : "webm";
  const fileName = `stringphone-live-room.${extension}`;

  formData.append("participantSessionToken", participantSessionToken);
  formData.append("sourceAudio", recording.blob, fileName);

  const response = await fetch(`${API_BASE_URL}/chat/rooms/${roomId}/messages/voice`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to send live voice message."),
    );
  }

  return response.json();
}

export async function retrySharedRoomMessage({
  roomId,
  participantSessionToken,
  messageId,
}) {
  const response = await fetch(
    `${API_BASE_URL}/chat/rooms/${roomId}/messages/${messageId}/retry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        participantSessionToken,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await parseApiError(response, "Failed to retry live room message."),
    );
  }

  return response.json();
}

export function buildSharedRoomEventsUrl({ roomId, participantSessionToken }) {
  const searchParams = new URLSearchParams({
    session: participantSessionToken,
  });

  return `${API_BASE_URL}/chat/rooms/${roomId}/events?${searchParams.toString()}`;
}

export function shouldPollSharedRoomUpdates() {
  if (SHARED_ROOM_TRANSPORT === "poll") {
    return true;
  }

  if (SHARED_ROOM_TRANSPORT === "sse") {
    return false;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const host = window.location.hostname.toLowerCase();
  return host.endsWith(".vercel.app");
}
