import { StyleSheet, Text, View } from 'react-native';
import { getSupportedTtsLanguage, LANGUAGE_OPTIONS } from '../shared';

export const LANGUAGE_FLAG_COUNTRY_CODES: Record<string, string> = {
  en: 'US',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  pt: 'PT',
  it: 'IT',
  nl: 'NL',
  hi: 'IN',
  ar: 'SA',
  fa: 'IR',
  zh: 'CN',
  ja: 'JP',
  ko: 'KR',
  pl: 'PL',
  ru: 'RU',
  sv: 'SE',
  tr: 'TR',
  tl: 'PH',
  bg: 'BG',
  ro: 'RO',
  cs: 'CZ',
  el: 'GR',
  fi: 'FI',
  hr: 'HR',
  ms: 'MY',
  sk: 'SK',
  da: 'DK',
  ta: 'IN',
  uk: 'UA',
  hu: 'HU',
  no: 'NO',
  vi: 'VN',
  bn: 'BD',
  th: 'TH',
  he: 'IL',
  ka: 'GE',
  id: 'ID',
  te: 'IN',
  gu: 'IN',
  kn: 'IN',
  ml: 'IN',
  mr: 'IN',
  pa: 'IN',
};

const FLAG_COLORS: Record<string, { bg: string; accent: string; fg: string }> = {
  US: { bg: '#1E3A8A', accent: '#EF4444', fg: '#FFFFFF' },
  ES: { bg: '#B91C1C', accent: '#FACC15', fg: '#FEF08A' },
  FR: { bg: '#1D4ED8', accent: '#EF4444', fg: '#FFFFFF' },
  DE: { bg: '#18181B', accent: '#EF4444', fg: '#FACC15' },
  PT: { bg: '#15803D', accent: '#DC2626', fg: '#FEF08A' },
  IT: { bg: '#15803D', accent: '#DC2626', fg: '#FFFFFF' },
  NL: { bg: '#B91C1C', accent: '#1D4ED8', fg: '#FFFFFF' },
  IN: { bg: '#EA580C', accent: '#15803D', fg: '#FFFFFF' },
  SA: { bg: '#15803D', accent: '#22C55E', fg: '#FFFFFF' },
  IR: { bg: '#15803D', accent: '#DC2626', fg: '#FFFFFF' },
  CN: { bg: '#DC2626', accent: '#FACC15', fg: '#FEF08A' },
  JP: { bg: '#F4F4F5', accent: '#DC2626', fg: '#DC2626' },
  KR: { bg: '#F4F4F5', accent: '#1D4ED8', fg: '#18181B' },
  PL: { bg: '#DC2626', accent: '#F4F4F5', fg: '#FFFFFF' },
  RU: { bg: '#1D4ED8', accent: '#DC2626', fg: '#FFFFFF' },
  SE: { bg: '#0284C7', accent: '#FACC15', fg: '#FEF08A' },
  TR: { bg: '#DC2626', accent: '#F4F4F5', fg: '#FFFFFF' },
  PH: { bg: '#1D4ED8', accent: '#DC2626', fg: '#FEF08A' },
  BG: { bg: '#15803D', accent: '#DC2626', fg: '#FFFFFF' },
  RO: { bg: '#1D4ED8', accent: '#FACC15', fg: '#FEF08A' },
  CZ: { bg: '#1D4ED8', accent: '#DC2626', fg: '#FFFFFF' },
  GR: { bg: '#0284C7', accent: '#F4F4F5', fg: '#FFFFFF' },
  FI: { bg: '#F4F4F5', accent: '#1D4ED8', fg: '#1D4ED8' },
  HR: { bg: '#DC2626', accent: '#1D4ED8', fg: '#FFFFFF' },
  MY: { bg: '#1E3A8A', accent: '#DC2626', fg: '#FEF08A' },
  SK: { bg: '#1D4ED8', accent: '#DC2626', fg: '#FFFFFF' },
  DK: { bg: '#DC2626', accent: '#F4F4F5', fg: '#FFFFFF' },
  UA: { bg: '#0284C7', accent: '#FACC15', fg: '#FEF08A' },
  HU: { bg: '#DC2626', accent: '#15803D', fg: '#FFFFFF' },
  NO: { bg: '#DC2626', accent: '#1E3A8A', fg: '#FFFFFF' },
  VN: { bg: '#DC2626', accent: '#FACC15', fg: '#FEF08A' },
  BD: { bg: '#15803D', accent: '#DC2626', fg: '#FFFFFF' },
  TH: { bg: '#1E3A8A', accent: '#DC2626', fg: '#FFFFFF' },
  IL: { bg: '#F4F4F5', accent: '#0284C7', fg: '#0284C7' },
  GE: { bg: '#F4F4F5', accent: '#DC2626', fg: '#DC2626' },
  ID: { bg: '#DC2626', accent: '#F4F4F5', fg: '#FFFFFF' },
};

export function getFlagCountryCode(languageCode: string, fallback = '') {
  return LANGUAGE_FLAG_COUNTRY_CODES[languageCode] ?? fallback ?? languageCode.slice(0, 2).toUpperCase();
}

export function getNativeLanguageName(code: string, fallbackName?: string): string {
  const english = fallbackName ?? getSupportedTtsLanguage(code)?.name ?? code;
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
      const displayName = new Intl.DisplayNames([code], { type: 'language' }).of(code);
      if (displayName && displayName.trim()) {
        return displayName;
      }
    }
  } catch {
    // Fallback to English name when runtime Intl lacks DisplayNames locale data
  }
  return english;
}

export const MOBILE_LANGUAGE_CATALOG = LANGUAGE_OPTIONS.map(option => {
  const nativeName = getNativeLanguageName(option.code, option.englishName);
  return {
    code: option.code,
    englishName: option.englishName,
    name: nativeName,
    nativeName,
    flag: getFlagCountryCode(option.code, option.flag),
  };
});

export function LanguageFlag({
  countryCode,
  languageCode,
  code: codeProp,
  size = 'md',
}: {
  countryCode?: string;
  languageCode?: string;
  code?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const resolvedLanguage = languageCode || codeProp;
  const code = (countryCode || (resolvedLanguage ? getFlagCountryCode(resolvedLanguage) : '') || 'GL').toUpperCase();
  const colors = FLAG_COLORS[code] ?? { bg: 'rgba(255,255,255,0.08)', accent: 'rgba(255,255,255,0.2)', fg: '#D4D4D8' };
  const dimensions = size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, dimensions, { backgroundColor: colors.bg }]}
    >
      <View style={[styles.stripe, { backgroundColor: colors.accent }]} />
      <Text style={[styles.code, size === 'sm' && styles.codeSm, { color: colors.fg }]}>
        {code.slice(0, 2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  sm: { width: 18, height: 13 },
  md: { width: 22, height: 15 },
  lg: { width: 28, height: 20 },
  stripe: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    opacity: 0.85,
  },
  code: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  codeSm: {
    fontSize: 7.5,
  },
});
