import "../../src/lib/mistral.js";
import {
  assertRoomAccess,
  buildRoomSnapshot,
  createRoom,
  createRoomMessage,
  getParticipantLanguages,
  getRoomMessageForRetry,
  joinRoom,
  type RoomRecord,
  RealtimeRoomError,
  updateRoomMessage,
} from "../../src/lib/realtimeRooms.js";
import { runTextChatMessage } from "../../src/lib/runTextChatMessage.js";
import { runVoiceChatMessage } from "../../src/lib/runVoiceChatMessage.js";

export const config = {
  runtime: "nodejs",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function getErrorMessage(
  body: Record<string, unknown> | undefined,
  fallback: string,
) {
  return typeof body?.error === "string" ? body.error : fallback;
}

function sendRoomError(error: unknown, fallbackMessage: string) {
  if (error instanceof RealtimeRoomError) {
    return jsonResponse(error.body, error.status);
  }

  console.error(fallbackMessage, error);
  return jsonResponse({ error: fallbackMessage }, 502);
}

function getRouteSegments(url: URL) {
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const directSegments =
    pathSegments[0] === "api" &&
    pathSegments[1] === "chat" &&
    pathSegments[2] === "rooms"
      ? pathSegments.slice(3)
      : [];

  if (directSegments.length > 0) {
    return directSegments;
  }

  const rewrittenPath = url.searchParams.get("path") ?? "";
  return rewrittenPath
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

async function processRoomTextMessage({
  room,
  participant,
  text,
  existingMessageId,
}: {
  room: RoomRecord;
  participant: ReturnType<typeof assertRoomAccess>["participant"];
  text: string;
  existingMessageId?: string;
}) {
  const { sourceLanguage, targetLanguage } = getParticipantLanguages(
    room,
    participant.role,
  );
  const trimmedText = text.trim();

  const messageId =
    existingMessageId ??
    createRoomMessage(room, participant, {
      kind: "text",
      status: "translating",
      originalText: trimmedText,
      retryInput: {
        kind: "text",
        text: trimmedText,
      },
    }).id;

  if (existingMessageId) {
    updateRoomMessage(room, existingMessageId, {
      status: "translating",
      originalText: trimmedText,
      transcript: "",
      translatedText: "",
      errorMessage: "",
      translatedAudio: undefined,
    });
  }

  try {
    const result = await runTextChatMessage({
      text: trimmedText,
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
    });

    if (!result.ok) {
      updateRoomMessage(room, messageId, {
        status: "error",
        errorMessage: getErrorMessage(result.body, "Text translation failed"),
      });
      return {
        ok: true,
        messageId,
      };
    }

    updateRoomMessage(room, messageId, {
      status: "ready",
      originalText: result.originalText,
      translatedText: result.translatedText,
      errorMessage: "",
    });

    return {
      ok: true,
      messageId,
    };
  } catch (error) {
    updateRoomMessage(room, messageId, {
      status: "error",
      errorMessage:
        error instanceof Error ? error.message : "Text translation failed",
    });

    return {
      ok: true,
      messageId,
    };
  }
}

async function processRoomVoiceMessage({
  room,
  participant,
  sourceAudioFile,
  existingMessageId,
}: {
  room: RoomRecord;
  participant: ReturnType<typeof assertRoomAccess>["participant"];
  sourceAudioFile: {
    buffer: Buffer;
    filename: string;
    mimeType?: string;
  };
  existingMessageId?: string;
}) {
  const messageId =
    existingMessageId ??
    createRoomMessage(room, participant, {
      kind: "voice",
      status: "transcribing",
      originalText: "",
      retryInput: {
        kind: "voice",
        sourceAudioBase64: sourceAudioFile.buffer.toString("base64"),
        sourceAudioMimeType: sourceAudioFile.mimeType ?? "audio/webm",
        sourceAudioFilename: sourceAudioFile.filename,
      },
    }).id;

  if (existingMessageId) {
    updateRoomMessage(room, existingMessageId, {
      status: "transcribing",
      originalText: "",
      transcript: "",
      translatedText: "",
      errorMessage: "",
      translatedAudio: undefined,
    });
  }

  try {
    const { sourceLanguage, targetLanguage } = getParticipantLanguages(
      room,
      participant.role,
    );
    const result = await runVoiceChatMessage({
      sourceLanguage: sourceLanguage.code,
      targetLanguage: targetLanguage.code,
      sourceAudioFile,
      voiceSampleFile: sourceAudioFile,
    });

    if (!result.ok) {
      updateRoomMessage(room, messageId, {
        status: "error",
        errorMessage: getErrorMessage(result.body, "Voice translation failed"),
      });
      return {
        ok: true,
        messageId,
      };
    }

    updateRoomMessage(room, messageId, {
      status: "ready",
      originalText: result.transcript,
      transcript: result.transcript,
      translatedText: result.translatedText,
      translatedAudio: {
        mimeType: "audio/mpeg",
        base64: result.audioBuffer.toString("base64"),
      },
      errorMessage: "",
    });

    return {
      ok: true,
      messageId,
    };
  } catch (error) {
    updateRoomMessage(room, messageId, {
      status: "error",
      errorMessage:
        error instanceof Error ? error.message : "Voice translation failed",
    });

    return {
      ok: true,
      messageId,
    };
  }
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const routeSegments = getRouteSegments(url);

    try {
      if (request.method === "POST" && routeSegments.length === 0) {
        const body = await request.json().catch(() => null);
        const result = createRoom({
          hostDisplayName: body?.displayName,
          hostLanguage: body?.hostLanguage,
          guestLanguage: body?.guestLanguage,
        });

        return jsonResponse(
          {
            room: buildRoomSnapshot(result.room),
            participant: result.participant,
            participantSessionToken: result.participantSessionToken,
            inviteToken: result.inviteToken,
          },
          201,
        );
      }

      if (
        request.method === "POST" &&
        routeSegments.length === 1 &&
        routeSegments[0] === "join"
      ) {
        const body = await request.json().catch(() => null);
        const result = joinRoom({
          inviteToken: body?.inviteToken,
          displayName: body?.displayName,
        });

        return jsonResponse({
          room: buildRoomSnapshot(result.room),
          participant: result.participant,
          participantSessionToken: result.participantSessionToken,
          inviteToken: result.inviteToken,
        });
      }

      if (routeSegments.length >= 1) {
        const [roomId, routeRoot, routeLeaf, routeTail] = routeSegments;

        if (request.method === "GET" && routeSegments.length === 1) {
          const { room, participant } = assertRoomAccess(
            roomId,
            url.searchParams.get("session"),
          );

          return jsonResponse({
            room: buildRoomSnapshot(room),
            participant: {
              id: participant.id,
              role: participant.role,
              displayName: participant.displayName,
              joinedAt: participant.joinedAt,
              lastSeenAt: participant.lastSeenAt,
            },
          });
        }

        if (
          request.method === "GET" &&
          routeSegments.length === 2 &&
          routeRoot === "events"
        ) {
          return jsonResponse(
            {
              error:
                "Live room streaming is unavailable on this Vercel deployment. The client should use snapshot polling.",
            },
            501,
          );
        }

        if (
          request.method === "POST" &&
          routeSegments.length === 3 &&
          routeRoot === "messages" &&
          routeLeaf === "text"
        ) {
          const body = await request.json().catch(() => null);
          const access = assertRoomAccess(
            roomId,
            body?.participantSessionToken,
          );
          const result = await processRoomTextMessage({
            room: access.room,
            participant: access.participant,
            text: typeof body?.text === "string" ? body.text : "",
          });

          return jsonResponse(result);
        }

        if (
          request.method === "POST" &&
          routeSegments.length === 3 &&
          routeRoot === "messages" &&
          routeLeaf === "voice"
        ) {
          const formData = await request.formData();
          const sourceAudio = formData.get("sourceAudio");
          const access = assertRoomAccess(
            roomId,
            formData.get("participantSessionToken"),
          );

          if (!(sourceAudio instanceof File)) {
            throw new RealtimeRoomError(400, "sourceAudio is required");
          }

          const result = await processRoomVoiceMessage({
            room: access.room,
            participant: access.participant,
            sourceAudioFile: {
              buffer: Buffer.from(await sourceAudio.arrayBuffer()),
              filename: sourceAudio.name || "source-audio.webm",
              mimeType: sourceAudio.type || undefined,
            },
          });

          return jsonResponse(result);
        }

        if (
          request.method === "POST" &&
          routeSegments.length === 4 &&
          routeRoot === "messages" &&
          routeTail === "retry"
        ) {
          const body = await request.json().catch(() => null);
          const access = assertRoomAccess(
            roomId,
            body?.participantSessionToken,
          );
          const message = getRoomMessageForRetry(
            access.room,
            routeLeaf,
            access.participant.id,
          );

          if (message.retryInput.kind === "text") {
            const result = await processRoomTextMessage({
              room: access.room,
              participant: access.participant,
              text: message.retryInput.text,
              existingMessageId: message.id,
            });

            return jsonResponse(result);
          }

          const result = await processRoomVoiceMessage({
            room: access.room,
            participant: access.participant,
            existingMessageId: message.id,
            sourceAudioFile: {
              buffer: Buffer.from(message.retryInput.sourceAudioBase64, "base64"),
              filename: message.retryInput.sourceAudioFilename,
              mimeType: message.retryInput.sourceAudioMimeType,
            },
          });

          return jsonResponse(result);
        }
      }

      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      if (request.method === "POST" && routeSegments.length === 0) {
        return sendRoomError(error, "Failed to create shared room");
      }

      if (
        request.method === "POST" &&
        routeSegments.length === 1 &&
        routeSegments[0] === "join"
      ) {
        return sendRoomError(error, "Failed to join shared room");
      }

      if (request.method === "GET" && routeSegments.length === 1) {
        return sendRoomError(error, "Failed to load shared room");
      }

      if (
        request.method === "POST" &&
        routeSegments.length === 3 &&
        routeSegments[1] === "messages" &&
        routeSegments[2] === "text"
      ) {
        return sendRoomError(error, "Shared room text translation failed");
      }

      if (
        request.method === "POST" &&
        routeSegments.length === 3 &&
        routeSegments[1] === "messages" &&
        routeSegments[2] === "voice"
      ) {
        return sendRoomError(error, "Shared room voice translation failed");
      }

      if (
        request.method === "POST" &&
        routeSegments.length === 4 &&
        routeSegments[1] === "messages" &&
        routeSegments[3] === "retry"
      ) {
        return sendRoomError(error, "Failed to retry shared room message");
      }

      return sendRoomError(error, "Shared room request failed");
    }
  },
};
