import { router } from 'expo-router';

export const MOBILE_SCREEN_ROUTES = {
  chat: '/', single: '/single', conversation: '/conversation', phrasebook: '/phrasebook',
} as const;
export type MobileScreen = keyof typeof MOBILE_SCREEN_ROUTES;

export function openNativeScreen(screen: MobileScreen) {
  const route = MOBILE_SCREEN_ROUTES[screen];
  if (!route) throw new Error('Unknown mobile screen.');
  router.navigate(route);
}
