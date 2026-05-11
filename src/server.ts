import express, { type Response } from "express";
import "dotenv/config";
import multer from "multer";
import {
  assertRoomAccess,
  broadcastRoomSnapshot,
  buildRoomSnapshot,
  createRoom,
  createRoomMessage,
  getParticipantLanguages,
  getRoomMessageForRetry,
  joinRoom,
  type RoomRecord,
  RealtimeRoomError,
  subscribeToRoom,
  updateRoomLanguages,
  updateRoomMessage,
} from "./lib/realtimeRooms.js";
import { runTextChatMessage } from "./lib/runTextChatMessage.js";
import { runSpeechTranslation } from "./lib/runSpeechTranslation.js";
import { runUiTranslations } from "./lib/runUiTranslations.js";
import { runVoiceChatMessage } from "./lib/runVoiceChatMessage.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const upload = multer({ storage: multer.memoryStorage() });
const allowedOrigins = new Set(
  (process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://localhost:5174,http://localhost:5175")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
app.use((req, res, next) => {
  const requestOrigin = req.header("Origin");

  if (requestOrigin && allowedOrigins.has(requestOrigin)) {
    res.header("Access-Control-Allow-Origin", requestOrigin);
  }

  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json());

function getErrorMessage(
  body: Record<string, unknown> | undefined,
  fallback: string,
) {
  return typeof body?.error === "string" ? body.error : fallback;
}

function coerceUploadedFile(file: Express.Multer.File | undefined) {
  if (!file) {
    return undefined;
  }

  return {
    buffer: file.buffer,
    filename: file.originalname,
    mimeType: file.mimetype,
  };
}

function sendRoomError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof RealtimeRoomError) {
    return res.status(error.status).json(error.body);
  }

  console.error(fallbackMessage, error);
  return res.status(502).json({ error: fallbackMessage });
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
      originalPronunciation: "",
      transcript: "",
      translatedText: "",
      translatedPronunciation: "",
      errorMessage: "",
      translatedAudio: undefined,
    });
  }

  broadcastRoomSnapshot(room);

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
      broadcastRoomSnapshot(room);
      return {
        ok: true,
        messageId,
      };
    }

    updateRoomMessage(room, messageId, {
      status: "ready",
      originalText: result.originalText,
      originalPronunciation: result.originalPronunciation,
      translatedText: result.translatedText,
      translatedPronunciation: result.translatedPronunciation,
      errorMessage: "",
    });
    broadcastRoomSnapshot(room);

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
    broadcastRoomSnapshot(room);

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
      originalPronunciation: "",
      transcript: "",
      translatedText: "",
      translatedPronunciation: "",
      errorMessage: "",
      translatedAudio: undefined,
    });
  }

  broadcastRoomSnapshot(room);

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
      broadcastRoomSnapshot(room);
      return {
        ok: true,
        messageId,
      };
    }

    updateRoomMessage(room, messageId, {
      status: "ready",
      originalText: result.transcript,
      originalPronunciation: result.originalPronunciation,
      transcript: result.transcript,
      translatedText: result.translatedText,
      translatedPronunciation: result.translatedPronunciation,
      translatedAudio: {
        mimeType: result.audioMimeType,
        base64: result.audioBuffer.toString("base64"),
      },
      errorMessage: "",
    });
    broadcastRoomSnapshot(room);

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
    broadcastRoomSnapshot(room);

    return {
      ok: true,
      messageId,
    };
  }
}

app.use("/health", (_req, res) => {
  res.json({ ok: true, service: "stringphone-backend" });
});

app.post("/chat/rooms", (req, res) => {
  try {
    const result = createRoom({
      hostDisplayName: req.body?.displayName,
      hostLanguage: req.body?.hostLanguage,
      guestLanguage: req.body?.guestLanguage,
    });

    return res.status(201).json({
      room: buildRoomSnapshot(result.room),
      participant: result.participant,
      participantSessionToken: result.participantSessionToken,
      inviteToken: result.inviteToken,
    });
  } catch (error) {
    return sendRoomError(res, error, "Failed to create shared room");
  }
});

app.post("/chat/rooms/join", (req, res) => {
  try {
    const result = joinRoom({
      inviteToken: req.body?.inviteToken,
      displayName: req.body?.displayName,
    });

    broadcastRoomSnapshot(result.room);

    return res.status(200).json({
      room: buildRoomSnapshot(result.room),
      participant: result.participant,
      participantSessionToken: result.participantSessionToken,
      inviteToken: result.inviteToken,
    });
  } catch (error) {
    return sendRoomError(res, error, "Failed to join shared room");
  }
});

app.get("/chat/rooms/:roomId", (req, res) => {
  try {
    const { room, participant } = assertRoomAccess(
      req.params.roomId,
      req.query.session,
    );

    return res.status(200).json({
      room: buildRoomSnapshot(room),
      participant: {
        id: participant.id,
        role: participant.role,
        displayName: participant.displayName,
        joinedAt: participant.joinedAt,
        lastSeenAt: participant.lastSeenAt,
      },
    });
  } catch (error) {
    return sendRoomError(res, error, "Failed to load shared room");
  }
});

app.get("/chat/rooms/:roomId/events", (req, res) => {
  try {
    const { room } = assertRoomAccess(req.params.roomId, req.query.session);
    const unsubscribe = subscribeToRoom(room, res);

    req.on("close", unsubscribe);
  } catch (error) {
    return sendRoomError(res, error, "Failed to connect shared room events");
  }
});

app.post("/chat/rooms/:roomId/languages", (req, res) => {
  try {
    const access = assertRoomAccess(
      req.params.roomId,
      req.body?.participantSessionToken,
    );
    const room = updateRoomLanguages({
      room: access.room,
      participant: access.participant,
      hostLanguage: req.body?.hostLanguage,
      guestLanguage: req.body?.guestLanguage,
    });

    broadcastRoomSnapshot(room);

    return res.status(200).json({
      room: buildRoomSnapshot(room),
      participant: {
        id: access.participant.id,
        role: access.participant.role,
        displayName: access.participant.displayName,
        joinedAt: access.participant.joinedAt,
        lastSeenAt: access.participant.lastSeenAt,
      },
    });
  } catch (error) {
    return sendRoomError(res, error, "Failed to update shared room languages");
  }
});

app.post("/chat/rooms/:roomId/messages/text", async (req, res) => {
  try {
    const access = assertRoomAccess(
      req.params.roomId,
      req.body?.participantSessionToken,
    );

    const result = await processRoomTextMessage({
      room: access.room,
      participant: access.participant,
      text: typeof req.body?.text === "string" ? req.body.text : "",
    });

    return res.status(200).json(result);
  } catch (error) {
    return sendRoomError(res, error, "Shared room text translation failed");
  }
});

app.post(
  "/chat/rooms/:roomId/messages/voice",
  upload.fields([{ name: "sourceAudio", maxCount: 1 }]),
  async (req, res) => {
    const uploadedFiles = req.files as
      | {
          sourceAudio?: Express.Multer.File[];
        }
      | undefined;
    const sourceAudioFile = coerceUploadedFile(uploadedFiles?.sourceAudio?.[0]);

    try {
      const access = assertRoomAccess(
        req.params.roomId,
        req.body?.participantSessionToken,
      );

      if (!sourceAudioFile) {
        throw new RealtimeRoomError(400, "sourceAudio is required");
      }

      const result = await processRoomVoiceMessage({
        room: access.room,
        participant: access.participant,
        sourceAudioFile,
      });

      return res.status(200).json(result);
    } catch (error) {
      return sendRoomError(res, error, "Shared room voice translation failed");
    }
  },
);

app.post("/chat/rooms/:roomId/messages/:messageId/retry", async (req, res) => {
  try {
    const access = assertRoomAccess(
      req.params.roomId,
      req.body?.participantSessionToken,
    );
    const message = getRoomMessageForRetry(
      access.room,
      req.params.messageId,
      access.participant.id,
    );

    if (message.retryInput.kind === "text") {
      const result = await processRoomTextMessage({
        room: access.room,
        participant: access.participant,
        text: message.retryInput.text,
        existingMessageId: message.id,
      });

      return res.status(200).json(result);
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

    return res.status(200).json(result);
  } catch (error) {
    return sendRoomError(res, error, "Failed to retry shared room message");
  }
});

app.post("/ui/translations", async (req, res) => {
  try {
    const result = await runUiTranslations({
      targetLanguage: req.body?.targetLanguage,
    });

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("UI translation bundle failed", error);
    return res.status(502).json({ error: "UI translation bundle failed" });
  }
});

app.post("/chat/messages/text", async (req, res) => {
  try {
    const result = await runTextChatMessage({
      text: req.body?.text,
      sourceLanguage: req.body?.sourceLanguage,
      targetLanguage: req.body?.targetLanguage,
    });

    if (!result.ok) {
      return res.status(result.status).json(result.body);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Text chat translation failed", error);
    return res.status(502).json({ error: "Text chat translation failed" });
  }
});

app.post(
  "/chat/messages/voice",
  upload.fields([
    { name: "sourceAudio", maxCount: 1 },
    { name: "voiceSample", maxCount: 1 },
  ]),
  async (req, res) => {
    const uploadedFiles = req.files as
      | {
          sourceAudio?: Express.Multer.File[];
          voiceSample?: Express.Multer.File[];
        }
      | undefined;
    const sourceAudioFile = uploadedFiles?.sourceAudio?.[0];
    const voiceSampleFile = uploadedFiles?.voiceSample?.[0];

    try {
      const result = await runVoiceChatMessage({
        sourceLanguage: req.body?.sourceLanguage,
        targetLanguage: req.body?.targetLanguage,
        sourceAudioFile: sourceAudioFile
          ? {
              buffer: sourceAudioFile.buffer,
              filename: sourceAudioFile.originalname,
              mimeType: sourceAudioFile.mimetype,
            }
          : undefined,
        voiceSampleFile: voiceSampleFile
          ? {
              buffer: voiceSampleFile.buffer,
              filename: voiceSampleFile.originalname,
              mimeType: voiceSampleFile.mimetype,
            }
          : undefined,
      });

      if (!result.ok) {
        return res.status(result.status).json(result.body);
      }

      return res.status(200).json({
        transcript: result.transcript,
        translatedText: result.translatedText,
        originalPronunciation: result.originalPronunciation,
        translatedPronunciation: result.translatedPronunciation,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        audio: {
          mimeType: result.audioMimeType,
          base64: result.audioBuffer.toString("base64"),
        },
      });
    } catch (error) {
      console.error("Voice chat translation failed", error);
      return res.status(502).json({ error: "Voice chat translation failed" });
    }
  },
);

app.post(
  "/speech/translate",
  upload.fields([
    { name: "sourceAudio", maxCount: 1 },
    { name: "voiceSample", maxCount: 1 },
  ]),
  async (req, res) => {
    const uploadedFiles = req.files as
      | {
          sourceAudio?: Express.Multer.File[];
          voiceSample?: Express.Multer.File[];
        }
      | undefined;
    const sourceAudioFile = uploadedFiles?.sourceAudio?.[0];
    const voiceSampleFile = uploadedFiles?.voiceSample?.[0];

    try {
      const result = await runSpeechTranslation({
        responseMode: req.body?.responseMode,
        sourceLanguage: req.body?.sourceLanguage,
        targetLanguage: req.body?.targetLanguage,
        sourceAudioFile: sourceAudioFile
          ? {
              buffer: sourceAudioFile.buffer,
              filename: sourceAudioFile.originalname,
              mimeType: sourceAudioFile.mimetype,
            }
          : undefined,
        voiceSampleFile: voiceSampleFile
          ? {
              buffer: voiceSampleFile.buffer,
              filename: voiceSampleFile.originalname,
              mimeType: voiceSampleFile.mimetype,
            }
          : undefined,
      });

      if (!result.ok) {
        return res.status(result.status).json(result.body);
      }

      if (result.wantsJson) {
        return res.status(200).json({
          transcript: result.transcript,
          translation: result.translation,
          targetLanguage: result.targetLanguage,
          audio: {
            mimeType: "audio/mpeg",
            base64: result.audioBuffer.toString("base64"),
          },
        });
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        'inline; filename="translated-speech.mp3"',
      );
      return res.status(200).send(result.audioBuffer);
    } catch (error) {
      console.error("Speech pipeline failed", error);
      return res.status(502).json({ error: "Speech pipeline failed" });
    }
  },
);

app.listen(port, () => {
  console.log(`StringPhone backend is listening on Port: ${port}`);
});
