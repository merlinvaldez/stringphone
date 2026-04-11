import express from "express";
import "dotenv/config";
import multer from "multer";
import { transcribeAudio } from "./services/transcribeAudio.js";
import { translateText } from "./services/translateText.js";
import { generateSpeech } from "./services/generateSpeech.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const upload = multer({ storage: multer.memoryStorage() });

app.use("/health", (_req, res) => {
  res.json({ ok: true, service: "stringphone-backend" });
});

app.post(
  "/speech/translate",
  upload.fields([
    { name: "sourceAudio", maxCount: 1 },
    { name: "voiceSample", maxCount: 1 },
  ]),
  async (req, res) => {
    const targetLanguage = req.body?.targetLanguage;
    const uploadedFiles = req.files as
      | {
          sourceAudio?: Express.Multer.File[];
          voiceSample?: Express.Multer.File[];
        }
      | undefined;
    const sourceAudioFile = uploadedFiles?.sourceAudio?.[0];
    const voiceSampleFile = uploadedFiles?.voiceSample?.[0];

    if (typeof targetLanguage !== "string" || !targetLanguage.trim()) {
      return res.status(400).json({ error: "targetLanguage is required" });
    }

    if (!sourceAudioFile) {
      return res.status(400).json({ error: "sourceAudio file is required" });
    }

    if (!voiceSampleFile) {
      return res.status(400).json({ error: "voiceSample file is required" });
    }

    try {
      const transcript = await transcribeAudio({
        audioBuffer: sourceAudioFile.buffer,
        filename: sourceAudioFile.originalname,
      });

      const translation = await translateText({
        text: transcript,
        targetLanguage: targetLanguage.trim(),
      });

      const audioBuffer = await generateSpeech({
        text: translation,
        voiceSampleBuffer: voiceSampleFile.buffer,
      });

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader(
        "Content-Disposition",
        'inline; filename="translated-speech.mp3"',
      );
      return res.status(200).send(audioBuffer);
    } catch (error) {
      console.error("Speech pipeline failed", error);
      return res.status(502).json({ error: "Speech pipeline failed" });
    }
  },
);

app.listen(port, () => {
  console.log(`StringPhone backend is listening on Port: ${port}`);
});
