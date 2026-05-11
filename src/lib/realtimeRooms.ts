import { randomBytes, randomUUID } from "node:crypto";
import type { Response } from "express";
import { CANONICAL_TTS_LANGUAGES, getSupportedTtsLanguage } from "./languages.js";

type RoomRole = "host" | "guest";
type MessageKind = "text" | "voice";
type MessageStatus =
  | "pending"
  | "transcribing"
  | "translating"
  | "generating_audio"
  | "ready"
  | "error";

type RoomLanguage = {
  code: string;
  label: string;
};

type RetryInput =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "voice";
      sourceAudioBase64: string;
      sourceAudioMimeType: string;
      sourceAudioFilename: string;
    };

type RoomParticipant = {
  id: string;
  role: RoomRole;
  displayName: string;
  sessionToken: string;
  joinedAt: string;
  lastSeenAt: string;
};

export type PublicRoomParticipant = Omit<RoomParticipant, "sessionToken">;

export type PublicRoomMessage = {
  id: string;
  roomId: string;
  kind: MessageKind;
  originMode: "chat";
  authorParticipantId: string;
  authorRole: RoomRole;
  status: MessageStatus;
  sourceLanguageCode: string;
  sourceLanguageLabel: string;
  targetLanguageCode: string;
  targetLanguageLabel: string;
  originalText: string;
  originalPronunciation: string;
  translatedText: string;
  translatedPronunciation: string;
  transcript: string;
  createdAt: string;
  errorMessage: string;
  translatedAudio?: {
    mimeType: string;
    base64: string;
  };
};

type RoomMessage = PublicRoomMessage & {
  retryInput: RetryInput;
};

type RoomSubscriber = {
  id: string;
  response: Response;
  heartbeat: ReturnType<typeof setInterval>;
};

export type RoomRecord = {
  id: string;
  inviteToken: string;
  createdAt: string;
  lastActivityAt: string;
  hostLanguage: RoomLanguage;
  guestLanguage: RoomLanguage;
  participants: RoomParticipant[];
  messages: RoomMessage[];
  subscribers: Map<string, RoomSubscriber>;
};

export type PublicRoomSnapshot = {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  hostLanguage: RoomLanguage;
  guestLanguage: RoomLanguage;
  participants: PublicRoomParticipant[];
  participantCount: number;
  guestJoined: boolean;
  messages: PublicRoomMessage[];
};

export class RealtimeRoomError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.name = "RealtimeRoomError";
    this.status = status;
    this.body = { error: message, ...body };
  }
}

const roomsById = new Map<string, RoomRecord>();
const roomIdByInviteToken = new Map<string, string>();

const ROOM_IDLE_TTL_MS = 1000 * 60 * 60 * 24;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 5;
const SSE_HEARTBEAT_INTERVAL_MS = 1000 * 15;

function createOpaqueToken() {
  return randomBytes(24).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function coerceDisplayName(rawValue: unknown, fallback: string) {
  if (typeof rawValue !== "string") {
    return fallback;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, 48);
}

function resolveLanguage(rawValue: unknown, fieldName: string): RoomLanguage {
  const language = getSupportedTtsLanguage(rawValue);

  if (!language) {
    throw new RealtimeRoomError(400, `${fieldName} is not supported`, {
      supportedLanguages: CANONICAL_TTS_LANGUAGES,
    });
  }

  return {
    code: language.code,
    label: language.name,
  };
}

function toPublicParticipant(participant: RoomParticipant): PublicRoomParticipant {
  return {
    id: participant.id,
    role: participant.role,
    displayName: participant.displayName,
    joinedAt: participant.joinedAt,
    lastSeenAt: participant.lastSeenAt,
  };
}

function toPublicMessage(message: RoomMessage): PublicRoomMessage {
  return {
    id: message.id,
    roomId: message.roomId,
    kind: message.kind,
    originMode: message.originMode,
    authorParticipantId: message.authorParticipantId,
    authorRole: message.authorRole,
    status: message.status,
    sourceLanguageCode: message.sourceLanguageCode,
    sourceLanguageLabel: message.sourceLanguageLabel,
    targetLanguageCode: message.targetLanguageCode,
    targetLanguageLabel: message.targetLanguageLabel,
    originalText: message.originalText,
    originalPronunciation: message.originalPronunciation,
    translatedText: message.translatedText,
    translatedPronunciation: message.translatedPronunciation,
    transcript: message.transcript,
    createdAt: message.createdAt,
    errorMessage: message.errorMessage,
    translatedAudio: message.translatedAudio,
  };
}

export function buildRoomSnapshot(room: RoomRecord): PublicRoomSnapshot {
  return {
    id: room.id,
    createdAt: room.createdAt,
    lastActivityAt: room.lastActivityAt,
    hostLanguage: room.hostLanguage,
    guestLanguage: room.guestLanguage,
    participants: room.participants.map(toPublicParticipant),
    participantCount: room.participants.length,
    guestJoined: room.participants.some((participant) => participant.role === "guest"),
    messages: room.messages.map(toPublicMessage),
  };
}

function sendSnapshotEvent(response: Response, room: RoomRecord) {
  response.write(`event: snapshot\ndata: ${JSON.stringify({ room: buildRoomSnapshot(room) })}\n\n`);
}

function touchParticipant(participant: RoomParticipant) {
  participant.lastSeenAt = nowIso();
}

function touchRoom(room: RoomRecord) {
  room.lastActivityAt = nowIso();
}

function closeSubscriber(room: RoomRecord, subscriberId: string) {
  const subscriber = room.subscribers.get(subscriberId);

  if (!subscriber) {
    return;
  }

  clearInterval(subscriber.heartbeat);
  room.subscribers.delete(subscriberId);

  if (!subscriber.response.writableEnded) {
    subscriber.response.end();
  }
}

function disposeRoom(roomId: string) {
  const room = roomsById.get(roomId);

  if (!room) {
    return;
  }

  for (const subscriberId of room.subscribers.keys()) {
    closeSubscriber(room, subscriberId);
  }

  roomsById.delete(roomId);
  roomIdByInviteToken.delete(room.inviteToken);
}

function cleanExpiredRooms() {
  const cutoff = Date.now() - ROOM_IDLE_TTL_MS;

  for (const room of roomsById.values()) {
    const roomAge = new Date(room.lastActivityAt).getTime();
    if (roomAge < cutoff) {
      disposeRoom(room.id);
    }
  }
}

const cleanupTimer = setInterval(cleanExpiredRooms, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();

export function createRoom(input: {
  hostDisplayName?: unknown;
  hostLanguage: unknown;
  guestLanguage: unknown;
}) {
  const createdAt = nowIso();
  const room: RoomRecord = {
    id: randomUUID(),
    inviteToken: createOpaqueToken(),
    createdAt,
    lastActivityAt: createdAt,
    hostLanguage: resolveLanguage(input.hostLanguage, "hostLanguage"),
    guestLanguage: resolveLanguage(input.guestLanguage, "guestLanguage"),
    participants: [],
    messages: [],
    subscribers: new Map(),
  };

  const hostParticipant: RoomParticipant = {
    id: randomUUID(),
    role: "host",
    displayName: coerceDisplayName(input.hostDisplayName, "Host"),
    sessionToken: createOpaqueToken(),
    joinedAt: createdAt,
    lastSeenAt: createdAt,
  };

  room.participants.push(hostParticipant);
  roomsById.set(room.id, room);
  roomIdByInviteToken.set(room.inviteToken, room.id);

  return {
    room,
    participant: toPublicParticipant(hostParticipant),
    participantSessionToken: hostParticipant.sessionToken,
    inviteToken: room.inviteToken,
  };
}

export function updateRoomLanguages(input: {
  room: RoomRecord;
  participant: RoomParticipant;
  hostLanguage: unknown;
  guestLanguage: unknown;
}) {
  const { room, participant, hostLanguage, guestLanguage } = input;

  if (participant.role !== "host") {
    throw new RealtimeRoomError(403, "Only the host can change shared chat languages");
  }

  if (room.participants.some((candidate) => candidate.role === "guest")) {
    throw new RealtimeRoomError(
      409,
      "Shared chat languages lock once the second participant joins",
    );
  }

  room.hostLanguage = resolveLanguage(hostLanguage, "hostLanguage");
  room.guestLanguage = resolveLanguage(guestLanguage, "guestLanguage");
  touchRoom(room);

  return room;
}

export function joinRoom(input: {
  inviteToken: unknown;
  displayName?: unknown;
}) {
  if (typeof input.inviteToken !== "string" || !input.inviteToken.trim()) {
    throw new RealtimeRoomError(400, "inviteToken is required");
  }

  const roomId = roomIdByInviteToken.get(input.inviteToken.trim());
  const room = roomId ? roomsById.get(roomId) : null;

  if (!room) {
    throw new RealtimeRoomError(404, "Join link not found or expired");
  }

  const existingGuest = room.participants.find(
    (participant) => participant.role === "guest",
  );

  if (existingGuest) {
    throw new RealtimeRoomError(409, "This room already has two participants");
  }

  const joinedAt = nowIso();
  const guestParticipant: RoomParticipant = {
    id: randomUUID(),
    role: "guest",
    displayName: coerceDisplayName(input.displayName, "Guest"),
    sessionToken: createOpaqueToken(),
    joinedAt,
    lastSeenAt: joinedAt,
  };

  room.participants.push(guestParticipant);
  touchRoom(room);

  return {
    room,
    participant: toPublicParticipant(guestParticipant),
    participantSessionToken: guestParticipant.sessionToken,
    inviteToken: room.inviteToken,
  };
}

export function assertRoomAccess(roomId: string, participantSessionToken: unknown) {
  if (typeof participantSessionToken !== "string" || !participantSessionToken.trim()) {
    throw new RealtimeRoomError(401, "participantSessionToken is required");
  }

  const room = roomsById.get(roomId);

  if (!room) {
    throw new RealtimeRoomError(404, "Room not found or expired");
  }

  const participant = room.participants.find(
    (candidate) => candidate.sessionToken === participantSessionToken.trim(),
  );

  if (!participant) {
    throw new RealtimeRoomError(401, "Room session is invalid");
  }

  touchParticipant(participant);
  touchRoom(room);

  return {
    room,
    participant,
  };
}

export function getParticipantLanguages(room: RoomRecord, role: RoomRole) {
  if (role === "host") {
    return {
      sourceLanguage: room.hostLanguage,
      targetLanguage: room.guestLanguage,
    };
  }

  return {
    sourceLanguage: room.guestLanguage,
    targetLanguage: room.hostLanguage,
  };
}

export function createRoomMessage(
  room: RoomRecord,
  participant: RoomParticipant,
  input: {
    kind: MessageKind;
    status: MessageStatus;
    originalText: string;
    transcript?: string;
    retryInput: RetryInput;
  },
) {
  const { sourceLanguage, targetLanguage } = getParticipantLanguages(
    room,
    participant.role,
  );
  const message: RoomMessage = {
    id: randomUUID(),
    roomId: room.id,
    kind: input.kind,
    originMode: "chat",
    authorParticipantId: participant.id,
    authorRole: participant.role,
    status: input.status,
    sourceLanguageCode: sourceLanguage.code,
    sourceLanguageLabel: sourceLanguage.label,
    targetLanguageCode: targetLanguage.code,
    targetLanguageLabel: targetLanguage.label,
    originalText: input.originalText,
    originalPronunciation: "",
    translatedText: "",
    translatedPronunciation: "",
    transcript: input.transcript ?? "",
    createdAt: nowIso(),
    errorMessage: "",
    retryInput: input.retryInput,
  };

  room.messages.push(message);
  touchRoom(room);
  return message;
}

export function updateRoomMessage(
  room: RoomRecord,
  messageId: string,
  patch: Partial<
    Omit<
      RoomMessage,
      | "id"
      | "roomId"
      | "kind"
      | "originMode"
      | "authorParticipantId"
      | "authorRole"
      | "sourceLanguageCode"
      | "sourceLanguageLabel"
      | "targetLanguageCode"
      | "targetLanguageLabel"
      | "createdAt"
      | "retryInput"
    >
  >,
) {
  const message = room.messages.find((candidate) => candidate.id === messageId);

  if (!message) {
    throw new RealtimeRoomError(404, "Message not found");
  }

  Object.assign(message, patch);
  touchRoom(room);
  return message;
}

export function getRoomMessageForRetry(
  room: RoomRecord,
  messageId: string,
  participantId: string,
) {
  const message = room.messages.find((candidate) => candidate.id === messageId);

  if (!message) {
    throw new RealtimeRoomError(404, "Message not found");
  }

  if (message.authorParticipantId !== participantId) {
    throw new RealtimeRoomError(403, "Only the sender can retry this message");
  }

  return message;
}

export function broadcastRoomSnapshot(room: RoomRecord) {
  touchRoom(room);

  for (const [subscriberId, subscriber] of room.subscribers.entries()) {
    try {
      sendSnapshotEvent(subscriber.response, room);
    } catch {
      closeSubscriber(room, subscriberId);
    }
  }
}

export function subscribeToRoom(room: RoomRecord, response: Response) {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  response.flushHeaders?.();

  const subscriberId = randomUUID();
  const heartbeat = setInterval(() => {
    response.write(`event: heartbeat\ndata: ${Date.now()}\n\n`);
  }, SSE_HEARTBEAT_INTERVAL_MS);

  const subscriber: RoomSubscriber = {
    id: subscriberId,
    response,
    heartbeat,
  };

  room.subscribers.set(subscriberId, subscriber);
  sendSnapshotEvent(response, room);

  return () => {
    closeSubscriber(room, subscriberId);
  };
}
