import { chromium } from "playwright";

import { db } from "../src/db/client.ts";

function parseArgs() {
  const limit = Number(process.argv[2] ?? "3");

  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer.");
  }

  return {
    limit,
  };
}

async function loadSavedMessages(limit) {
  const result = await db.query(
    `
    SELECT id, created_at, audio_url
    FROM public.messages
    WHERE audio_url IS NOT NULL
      AND btrim(audio_url) <> ''
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [limit],
  );

  return result.rows;
}

async function verifySavedMessagePlayback(page, savedMessage) {
  return page.evaluate(async ({ audioValue }) => {
    const base64ToBlob = (base64, mimeType) => {
      const binary = window.atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      return new Blob([bytes], { type: mimeType });
    };

    const createAudioUrlFromStoredValue = (storedAudioValue) => {
      const trimmedAudioValue = storedAudioValue.trim();

      if (trimmedAudioValue.startsWith("data:")) {
        const match = trimmedAudioValue.match(/^data:([^;]+);base64,(.+)$/i);

        if (!match) {
          throw new Error("Could not parse data URL audio value.");
        }

        return URL.createObjectURL(base64ToBlob(match[2], match[1]));
      }

      return URL.createObjectURL(base64ToBlob(trimmedAudioValue, "audio/mpeg"));
    };

    const audioUrl = createAudioUrlFromStoredValue(audioValue);
    const audio = document.createElement("audio");
    audio.src = audioUrl;
    audio.preload = "metadata";
    document.body.appendChild(audio);

    const events = [];
    const log = (type) => {
      events.push({
        type,
        currentTime: audio.currentTime,
        paused: audio.paused,
        readyState: audio.readyState,
        duration: Number.isFinite(audio.duration) ? audio.duration : null,
        ts: performance.now(),
      });
    };

    ["loadstart", "loadedmetadata", "canplay", "playing", "pause", "ended", "error"].forEach(
      (eventName) => {
        audio.addEventListener(eventName, () => log(eventName));
      },
    );

    log("play-call");
    await audio.play();

    await new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("Timed out waiting for saved audio playback to end."));
      }, 60000);

      audio.addEventListener(
        "ended",
        () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        { once: true },
      );

      audio.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeoutId);
          reject(new Error("Saved audio playback raised an error event."));
        },
        { once: true },
      );
    });

    URL.revokeObjectURL(audioUrl);

    return {
      audioUrlPrefix: audioUrl.slice(0, 5),
      events,
    };
  }, { audioValue: savedMessage.audio_url });
}

async function main() {
  const { limit } = parseArgs();
  const savedMessages = await loadSavedMessages(limit);

  if (savedMessages.length === 0) {
    throw new Error("No saved message audio found.");
  }

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const page = await browser.newPage();
  await page.setContent(
    "<!doctype html><html><body><p>saved-message-playback-verifier</p></body></html>",
  );

  const results = [];

  for (const savedMessage of savedMessages) {
    results.push({
      messageId: savedMessage.id,
      createdAt: savedMessage.created_at,
      playback: await verifySavedMessagePlayback(page, savedMessage),
    });
  }

  console.log(
    JSON.stringify(
      {
        count: results.length,
        results,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
