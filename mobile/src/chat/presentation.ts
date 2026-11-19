import { getSupportedTtsLanguage } from '../shared';

export const languageName = (code: string) => getSupportedTtsLanguage(code)?.name ?? code;
export const isRtlLanguage = (code: string) => ['arabic', 'hebrew'].includes(getSupportedTtsLanguage(code)?.writingSystem ?? '');
export const messageDirection = (code: string) => ({ textAlign: isRtlLanguage(code) ? 'right' as const : 'left' as const,
  writingDirection: isRtlLanguage(code) ? 'rtl' as const : 'ltr' as const });
