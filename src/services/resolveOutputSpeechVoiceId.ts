import { CARTESIA_API_BASE_URL, getCartesiaHeaders } from "../lib/cartesia.js";
import { ELEVENLABS_FARSI_TEST_VOICE_ID } from "../lib/elevenlabs.js";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import { mistral } from "../lib/mistral.js";

type CartesiaVoiceLocale = {
  locale?: string;
  is_native?: boolean;
};

type CartesiaVoice = {
  id?: string;
  language?: string;
  is_public?: boolean;
  access?: {
    type?: string;
    visibility?: string;
  };
  locales?: CartesiaVoiceLocale[];
};

type CartesiaVoicePage = {
  data?: CartesiaVoice[];
  has_more?: boolean;
  next_page?: string | null;
};

let cartesiaVoiceCatalogPromise: Promise<CartesiaVoice[]> | null = null;
let mistralVoiceCatalogPromise: Promise<
  Array<{
    id: string;
    slug?: string | null;
    languages?: string[];
  }>
> | null = null;

const MISTRAL_DEFAULT_VOICE_SLUG = "en_paul_neutral";

function isPublicCartesiaVoice(voice: CartesiaVoice) {
  return (
    voice.is_public === true ||
    voice.access?.type === "public" ||
    voice.access?.visibility === "all"
  );
}

function voiceMatchesLanguage(voice: CartesiaVoice, languageCode: string) {
  const normalizedLanguageCode = languageCode.toLowerCase();

  if (voice.language?.toLowerCase() === normalizedLanguageCode) {
    return true;
  }

  return (
    Array.isArray(voice.locales) &&
    voice.locales.some(
      (locale) =>
        typeof locale?.locale === "string" &&
        locale.locale.toLowerCase().startsWith(`${normalizedLanguageCode}-`),
    )
  );
}

function voiceHasNativeLocale(voice: CartesiaVoice, languageCode: string) {
  const normalizedLanguageCode = languageCode.toLowerCase();

  return (
    Array.isArray(voice.locales) &&
    voice.locales.some(
      (locale) =>
        locale?.is_native === true &&
        typeof locale.locale === "string" &&
        locale.locale.toLowerCase().startsWith(`${normalizedLanguageCode}-`),
    )
  );
}

async function fetchCartesiaVoiceCatalog() {
  const voices: CartesiaVoice[] = [];
  let nextPage: string | null = null;

  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const url = new URL(`${CARTESIA_API_BASE_URL}/voices`);
    url.searchParams.set("limit", "100");

    if (nextPage) {
      url.searchParams.set("starting_after", nextPage);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: getCartesiaHeaders(),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to list Cartesia voices: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as CartesiaVoicePage;
    const pageVoices = Array.isArray(body.data) ? body.data : [];

    voices.push(...pageVoices);

    if (!body.has_more || !body.next_page || pageVoices.length === 0) {
      break;
    }

    nextPage = body.next_page;
  }

  return voices;
}

async function listCartesiaVoices() {
  if (!cartesiaVoiceCatalogPromise) {
    cartesiaVoiceCatalogPromise = fetchCartesiaVoiceCatalog().catch((error) => {
      cartesiaVoiceCatalogPromise = null;
      throw error;
    });
  }

  return cartesiaVoiceCatalogPromise;
}

async function fetchMistralVoiceCatalog() {
  const firstPage = await mistral.audio.voices.list({
    type: "preset",
    offset: 0,
    limit: 100,
  });
  const totalPages =
    typeof firstPage.totalPages === "number" && firstPage.totalPages > 1
      ? firstPage.totalPages
      : 1;
  const items = [...(firstPage.items ?? [])];

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await mistral.audio.voices.list({
      type: "preset",
      offset: (page - 1) * 100,
      limit: 100,
    });

    items.push(...(nextPage.items ?? []));
  }

  return items;
}

async function listMistralVoices() {
  if (!mistralVoiceCatalogPromise) {
    mistralVoiceCatalogPromise = fetchMistralVoiceCatalog().catch((error) => {
      mistralVoiceCatalogPromise = null;
      throw error;
    });
  }

  return mistralVoiceCatalogPromise;
}

function mistralVoiceMatchesLanguage(
  voice: { slug?: string | null; languages?: string[] },
  languageCode: string,
) {
  const normalizedLanguageCode = languageCode.toLowerCase();

  return (
    voice.languages?.some((language) => language.toLowerCase().startsWith(normalizedLanguageCode)) ||
    voice.slug?.toLowerCase().startsWith(`${normalizedLanguageCode}_`)
  );
}

async function resolveMistralVoiceId(language: SupportedTtsLanguage) {
  const voices = await listMistralVoices();
  const directLanguageMatch =
    voices.find((voice) => mistralVoiceMatchesLanguage(voice, language.code)) ?? null;

  if (directLanguageMatch?.id) {
    return directLanguageMatch.id;
  }

  const neutralVoice =
    voices.find((voice) => voice.slug?.toLowerCase() === MISTRAL_DEFAULT_VOICE_SLUG) ??
    voices.find((voice) => voice.slug?.toLowerCase().includes("neutral")) ??
    null;

  return neutralVoice?.id ?? voices[0]?.id ?? null;
}

async function resolveCartesiaVoiceId(language: SupportedTtsLanguage) {
  const publicVoices = (await listCartesiaVoices()).filter(
    (voice) => typeof voice.id === "string" && voice.id && isPublicCartesiaVoice(voice),
  );
  const matchingVoices = publicVoices.filter((voice) =>
    voiceMatchesLanguage(voice, language.code),
  );
  const nativeMatch =
    matchingVoices.find((voice) => voiceHasNativeLocale(voice, language.code)) ?? null;

  return nativeMatch?.id ?? matchingVoices[0]?.id ?? publicVoices[0]?.id ?? null;
}

export async function resolveOutputSpeechVoiceId(language: SupportedTtsLanguage) {
  if (language.provider === "mistral") {
    return resolveMistralVoiceId(language);
  }

  if (language.provider === "elevenlabs") {
    return language.code === "fa" ? ELEVENLABS_FARSI_TEST_VOICE_ID : null;
  }

  return resolveCartesiaVoiceId(language);
}
