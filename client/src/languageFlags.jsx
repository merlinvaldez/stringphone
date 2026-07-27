import React from "react";
import BD from "country-flag-icons/react/3x2/BD";
import BG from "country-flag-icons/react/3x2/BG";
import CN from "country-flag-icons/react/3x2/CN";
import CZ from "country-flag-icons/react/3x2/CZ";
import DE from "country-flag-icons/react/3x2/DE";
import DK from "country-flag-icons/react/3x2/DK";
import ES from "country-flag-icons/react/3x2/ES";
import FI from "country-flag-icons/react/3x2/FI";
import FR from "country-flag-icons/react/3x2/FR";
import GE from "country-flag-icons/react/3x2/GE";
import GR from "country-flag-icons/react/3x2/GR";
import HR from "country-flag-icons/react/3x2/HR";
import HU from "country-flag-icons/react/3x2/HU";
import ID from "country-flag-icons/react/3x2/ID";
import IL from "country-flag-icons/react/3x2/IL";
import IN from "country-flag-icons/react/3x2/IN";
import IR from "country-flag-icons/react/3x2/IR";
import IT from "country-flag-icons/react/3x2/IT";
import JP from "country-flag-icons/react/3x2/JP";
import KR from "country-flag-icons/react/3x2/KR";
import MY from "country-flag-icons/react/3x2/MY";
import NL from "country-flag-icons/react/3x2/NL";
import NO from "country-flag-icons/react/3x2/NO";
import PH from "country-flag-icons/react/3x2/PH";
import PL from "country-flag-icons/react/3x2/PL";
import PT from "country-flag-icons/react/3x2/PT";
import RO from "country-flag-icons/react/3x2/RO";
import RU from "country-flag-icons/react/3x2/RU";
import SA from "country-flag-icons/react/3x2/SA";
import SE from "country-flag-icons/react/3x2/SE";
import SK from "country-flag-icons/react/3x2/SK";
import TH from "country-flag-icons/react/3x2/TH";
import TR from "country-flag-icons/react/3x2/TR";
import UA from "country-flag-icons/react/3x2/UA";
import US from "country-flag-icons/react/3x2/US";
import VN from "country-flag-icons/react/3x2/VN";

export const LANGUAGE_FLAG_COUNTRY_CODES = {
  en: "US",
  es: "ES",
  fr: "FR",
  de: "DE",
  pt: "PT",
  it: "IT",
  nl: "NL",
  hi: "IN",
  ar: "SA",
  fa: "IR",
  zh: "CN",
  ja: "JP",
  ko: "KR",
  pl: "PL",
  ru: "RU",
  sv: "SE",
  tr: "TR",
  tl: "PH",
  bg: "BG",
  ro: "RO",
  cs: "CZ",
  el: "GR",
  fi: "FI",
  hr: "HR",
  ms: "MY",
  sk: "SK",
  da: "DK",
  ta: "IN",
  uk: "UA",
  hu: "HU",
  no: "NO",
  vi: "VN",
  bn: "BD",
  th: "TH",
  he: "IL",
  ka: "GE",
  id: "ID",
  te: "IN",
  gu: "IN",
  kn: "IN",
  ml: "IN",
  mr: "IN",
  pa: "IN",
};

const FLAG_COMPONENTS = {
  BD,
  BG,
  CN,
  CZ,
  DE,
  DK,
  ES,
  FI,
  FR,
  GE,
  GR,
  HR,
  HU,
  ID,
  IL,
  IN,
  IR,
  IT,
  JP,
  KR,
  MY,
  NL,
  NO,
  PH,
  PL,
  PT,
  RO,
  RU,
  SA,
  SE,
  SK,
  TH,
  TR,
  UA,
  US,
  VN,
};

export function getFlagCountryCode(languageCode, fallback = "") {
  return LANGUAGE_FLAG_COUNTRY_CODES[languageCode] ?? fallback;
}

export function LanguageFlag({ countryCode, label, className = "" }) {
  const FlagIcon = FLAG_COMPONENTS[countryCode];

  if (countryCode && FlagIcon) {
    return (
      <FlagIcon
        title={label}
        className={`shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)] ${className}`.trim()}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-[2px] border border-white/10 bg-white/5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300 ${className}`.trim()}
    >
      {countryCode}
    </span>
  );
}
