import { useEffect, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "/api";

export const DEFAULT_UI_STRINGS = {
  searchLanguages: "Search languages",
  you: "You",
  partner: "Partner",
  shareInviteMessage:
    "Let's chat on StringPhone so that we can understand each other better.",
  listening: "Listening",
  translating: "Translating",
  speaking: "Speaking",
  partnersTurn: "Partner's turn",
  tap: "Tap",
  speak: "Speak",
  listen: "Listen",
  messageIn: "Type message in {language}",
  translatingVoiceNote: "Translating voice note...",
  secondsLeft: "{seconds}s left",
  recordVoiceNote: "Record voice note",
  stopVoiceNote: "Stop voice note",
  invertLanguages: "Invert languages",
  sendTextMessage: "Send text message",
  playAudio: "Play audio",
  pauseAudio: "Pause audio",
  audioUnavailable: "Audio unavailable.",
  preparingAudio: "Preparing audio...",
  translationFailed: "Translation failed.",
  translatingShort: "Translating...",
  retry: "Retry",
  pending: "Pending",
  transcribing: "Transcribing",
  generatingAudio: "Generating audio",
  ready: "Ready",
  needsRetry: "Needs retry",
};

const SHARE_INVITE_MESSAGE_BY_LANGUAGE = {
  ar: "لنتحدث على StringPhone حتى نتمكن من فهم بعضنا بشكل أفضل.",
  bg: "Нека си пишем в StringPhone, за да се разбираме по-добре.",
  bn: "চলুন StringPhone-এ কথা বলি, যাতে আমরা একে অপরকে আরও ভালোভাবে বুঝতে পারি।",
  cs: "Pojdme si psat na StringPhone, abychom si lepe rozumeli.",
  da: "Lad os chatte pa StringPhone, sa vi kan forsta hinanden bedre.",
  de: "Lass uns auf StringPhone chatten, damit wir uns besser verstehen.",
  el: "Ας μιλησουμε στο StringPhone για να καταλαβαινουμε καλυτερα ο ενας τον αλλο.",
  en: "Let's chat on StringPhone so that we can understand each other better.",
  es: "Hablemos por StringPhone para que podamos entendernos mejor.",
  fa: "بياييد در StringPhone صحبت کنيم تا همديگر را بهتر درک کنيم.",
  fi: "Jutellaan StringPhonessa, jotta ymmarramme toisiamme paremmin.",
  fr: "Discutons sur StringPhone pour mieux nous comprendre.",
  gu: "ચાલો StringPhone પર વાત કરીએ જેથી આપણે એકબીજાને વધુ સારી રીતે સમજી શકીએ.",
  he: "בואו נדבר ב-StringPhone כדי שנבין אחד את השני טוב יותר.",
  hi: "चलिए StringPhone पर बात करते हैं ताकि हम एक-दूसरे को बेहतर समझ सकें।",
  hr: "Dopisujmo se na StringPhoneu kako bismo se bolje razumjeli.",
  hu: "Beszeljunk a StringPhone-on, hogy jobban megertsuk egymast.",
  id: "Ayo ngobrol di StringPhone supaya kita bisa lebih saling memahami.",
  it: "Parliamo su StringPhone cosi possiamo capirci meglio.",
  ja: "お互いをもっとよく理解できるように、StringPhoneで話しましょう。",
  ka: "მოდით, StringPhone-ზე ვილაპარაკოთ, რომ ერთმანეთი უკეთ გავიგოთ.",
  kn: "ನಾವು ಒಬ್ಬರನ್ನೊಬ್ಬರು ಇನ್ನೂ ಚೆನ್ನಾಗಿ ಅರ್ಥಮಾಡಿಕೊಳ್ಳಲು StringPhone ನಲ್ಲಿ ಮಾತನಾಡೋಣ.",
  ko: "서로를 더 잘 이해할 수 있도록 StringPhone에서 이야기해요.",
  ml: "നമുക്ക് പരസ്പരം കൂടുതല്‍ നന്നായി മനസ്സിലാക്കാന്‍ StringPhone-ല്‍ സംസാരിക്കാം.",
  mr: "चला StringPhone वर बोलूया म्हणजे आपण एकमेकांना अधिक चांगल्या प्रकारे समजू शकू.",
  ms: "Mari berbual di StringPhone supaya kita dapat lebih memahami satu sama lain.",
  nl: "Laten we op StringPhone chatten zodat we elkaar beter kunnen begrijpen.",
  no: "La oss chatte pa StringPhone sa vi kan forsta hverandre bedre.",
  pa: "ਆਓ StringPhone ਤੇ ਗੱਲ ਕਰੀਏ ਤਾਂ ਜੋ ਅਸੀਂ ਇਕ ਦੂਜੇ ਨੂੰ ਹੋਰ ਚੰਗੀ ਤਰ੍ਹਾਂ ਸਮਝ ਸਕੀਏ।",
  pl: "Porozmawiajmy na StringPhone, zeby lepiej sie rozumiec.",
  pt: "Vamos conversar no StringPhone para que possamos nos entender melhor.",
  ro: "Hai sa vorbim pe StringPhone ca sa ne putem intelege mai bine.",
  ru: "Давай поговорим в StringPhone, чтобы лучше понимать друг друга.",
  sk: "Podme si pisat na StringPhone, aby sme si lepsie rozumeli.",
  sv: "Lat oss chatta pa StringPhone sa att vi kan forsta varandra battre.",
  ta: "நாம் ஒருவரை ஒருவர் நன்றாக புரிந்துகொள்ள StringPhone-ல் பேசலாம்.",
  te: "మనము ఒకరిని ఒకరు ఇంకా బాగా అర్థం చేసుకోవడానికి StringPhone లో మాట్లాడుకుందాం.",
  th: "มาคุยกันบน StringPhone เพื่อให้เราเข้าใจกันได้ดียิ่งขึ้น",
  tl: "Mag-usap tayo sa StringPhone para mas magkaintindihan tayo.",
  tr: "Birbirimizi daha iyi anlayabilmemiz icin StringPhone'da sohbet edelim.",
  uk: "Давай поспілкуємося в StringPhone, щоб краще розуміти одне одного.",
  vi: "Hay tro chuyen tren StringPhone de chung ta co the hieu nhau hon.",
  zh: "让我们在 StringPhone 上聊天，这样我们就能更好地理解彼此。"
};

function buildFallbackUiStrings(languageCode) {
  return {
    ...DEFAULT_UI_STRINGS,
    shareInviteMessage:
      SHARE_INVITE_MESSAGE_BY_LANGUAGE[languageCode] ??
      DEFAULT_UI_STRINGS.shareInviteMessage,
  };
}

export function getShareInviteMessage(languageCode) {
  return (
    SHARE_INVITE_MESSAGE_BY_LANGUAGE[languageCode] ??
    DEFAULT_UI_STRINGS.shareInviteMessage
  );
}

const uiStringCache = new Map([["en", DEFAULT_UI_STRINGS]]);
const uiStringInflight = new Map();

export function interpolateTemplate(template, variables) {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export async function loadUiStrings(languageCode) {
  if (uiStringCache.has(languageCode)) {
    return uiStringCache.get(languageCode);
  }

  if (uiStringInflight.has(languageCode)) {
    return uiStringInflight.get(languageCode);
  }

  const request = fetch(`${API_BASE_URL}/ui/translations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetLanguage: languageCode }),
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to load UI strings.");
      }

      const payload = await response.json();
      const strings = {
        ...buildFallbackUiStrings(languageCode),
        ...(payload.strings ?? {}),
      };
      uiStringCache.set(languageCode, strings);
      return strings;
    })
    .catch(() => buildFallbackUiStrings(languageCode))
    .finally(() => {
      uiStringInflight.delete(languageCode);
    });

  uiStringInflight.set(languageCode, request);
  return request;
}

export function useUiStrings(language) {
  const languageCode = language?.code ?? "en";
  const [strings, setStrings] = useState(
    uiStringCache.get(languageCode) ?? DEFAULT_UI_STRINGS,
  );

  useEffect(() => {
    let cancelled = false;
    const cachedStrings = uiStringCache.get(languageCode);

    if (cachedStrings) {
      setStrings(cachedStrings);
    }

    loadUiStrings(languageCode).then((loadedStrings) => {
      if (!cancelled) {
        setStrings(loadedStrings);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [languageCode]);

  return strings;
}

export function getStatusLabel(status, uiStrings = DEFAULT_UI_STRINGS) {
  switch (status) {
    case "pending":
      return uiStrings.pending;
    case "transcribing":
      return uiStrings.transcribing;
    case "translating":
      return uiStrings.translating;
    case "generating_audio":
      return uiStrings.generatingAudio;
    case "ready":
      return uiStrings.ready;
    case "error":
      return uiStrings.needsRetry;
    default:
      return "";
  }
}
