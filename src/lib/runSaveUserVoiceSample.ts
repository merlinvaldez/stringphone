import { getConversation } from "../db/queries/conversations.js";
import { createVoiceSample } from "../db/queries/voiceSamples.js";

type VoiceSampleFile = {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
};

export type RunSaveUserVoiceSampleInput = {
  userId: number;
  conversationId?: unknown;
  sourceLanguage?: unknown;
  targetLanguage?: unknown;
  voiceSampleFile?: VoiceSampleFile;
};

export type RunSaveUserVoiceSampleResult =
  | {
      ok: true;
      voiceSampleId: string;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toDataUrl(file: VoiceSampleFile) {
  const mimeType = normalizeOptionalText(file.mimeType) ?? "audio/webm";
  return `data:${mimeType};base64,${file.buffer.toString("base64")}`;
}

export async function runSaveUserVoiceSample(
  input: RunSaveUserVoiceSampleInput,
): Promise<RunSaveUserVoiceSampleResult> {
  if (!Number.isInteger(input.userId) || input.userId < 1) {
    return {
      ok: false,
      status: 400,
      body: { error: "userId is required" },
    };
  }

  if (!input.voiceSampleFile?.buffer?.length) {
    return {
      ok: false,
      status: 400,
      body: { error: "voiceSample file is required" },
    };
  }

  const conversationId = normalizeOptionalText(input.conversationId);
  const sourceLanguage = normalizeOptionalText(input.sourceLanguage);
  const targetLanguage = normalizeOptionalText(input.targetLanguage);
  let sourceConversationId: string | null = null;

  if (conversationId) {
    const conversation = await getConversation(conversationId, input.userId);

    if (!conversation) {
      return {
        ok: false,
        status: 404,
        body: { error: "Conversation not found or unauthorized" },
      };
    }

    sourceConversationId = conversation.id;
  }

  const voiceSample = await createVoiceSample({
    userId: input.userId,
    sourceConversationId,
    sourceLanguage,
    targetLanguage,
    audioUrl: toDataUrl(input.voiceSampleFile),
  });

  if (!voiceSample?.id) {
    return {
      ok: false,
      status: 502,
      body: { error: "Failed to save voice sample" },
    };
  }

  return {
    ok: true,
    voiceSampleId: voiceSample.id,
  };
}
