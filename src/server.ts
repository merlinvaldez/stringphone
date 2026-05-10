import express from "express";
import "dotenv/config";
import multer from "multer";
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

app.use("/health", (_req, res) => {
  res.json({ ok: true, service: "stringphone-backend" });
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
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        audio: {
          mimeType: "audio/mpeg",
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
