import { getConversation } from "../db/queries/conversations.js";
import { createVoiceSample } from "../db/queries/voiceSamples.js";
import { prepareVoiceReference } from "../services/prepareVoiceReference.js";

type VoiceSampleFile = {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
};

export type RunSaveUserVoiceSampleInput = {
  userId: number;
  conversationId?: unknown;
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

function toStoredAudioBase64(file: VoiceSampleFile) {
  return file.buffer.toString("base64");
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

  const preparedVoiceSample = await prepareVoiceReference(input.voiceSampleFile);
  const voiceSample = await createVoiceSample({
    userId: input.userId,
    sourceConversationId,
    audioUrl: toStoredAudioBase64(preparedVoiceSample),
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
