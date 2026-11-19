export type AppEnvironment = 'development' | 'preview' | 'production';

type ApiSettings = {
  environment?: string;
  developmentUrl?: string;
  previewUrl?: string;
  productionUrl?: string;
};

// Pure resolver also used by the terminal configuration check.
export function resolveApiConfig(settings: ApiSettings) {
  const environment = settings.environment;
  if (environment !== 'development' && environment !== 'preview' && environment !== 'production') {
    throw new Error('EXPO_PUBLIC_APP_ENV must be development, preview, or production.');
  }

  const value = {
    development: settings.developmentUrl,
    preview: settings.previewUrl,
    production: settings.productionUrl,
  }[environment]?.trim();
  if (!value) {
    throw new Error(`Set EXPO_PUBLIC_API_URL_${environment.toUpperCase()} in mobile/.env.local or the build environment.`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The API base must be an absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error('The API base must be HTTP(S), without credentials, query parameters, or fragments.');
  }
  if (/^(localhost|127(?:\.\d+){3}|\[?::1\]?|0\.0\.0\.0)$/i.test(url.hostname)) {
    throw new Error('Use your PC LAN address or a reachable HTTPS host; phone localhost is not your PC.');
  }
  if (environment !== 'development' && url.protocol !== 'https:') {
    throw new Error('Preview and production API URLs must use HTTPS.');
  }
  if (url.hostname.endsWith('.example.com') || url.hostname === 'example.com') {
    throw new Error('Replace the example API URL with your actual backend address.');
  }

  return { environment: environment as AppEnvironment, baseUrl: url.toString().replace(/\/+$/, '') };
}

export function getApiConfig() {
  // Expo only inlines public variables accessed with literal dot notation.
  return resolveApiConfig({
    environment: process.env.EXPO_PUBLIC_APP_ENV,
    developmentUrl: process.env.EXPO_PUBLIC_API_URL_DEVELOPMENT,
    previewUrl: process.env.EXPO_PUBLIC_API_URL_PREVIEW,
    productionUrl: process.env.EXPO_PUBLIC_API_URL_PRODUCTION,
  });
}

export function getApiUrl(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /[?#\\]/.test(path)) {
    throw new Error('Use an API endpoint path beginning with one slash, without traversal or query parameters.');
  }
  return `${getApiConfig().baseUrl}${path}`;
}
