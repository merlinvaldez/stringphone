import assert from 'node:assert/strict';
import { getApiUrl, resolveApiConfig } from '../src/config/api.ts';

const settings = {
  environment: process.env.EXPO_PUBLIC_APP_ENV,
  developmentUrl: process.env.EXPO_PUBLIC_API_URL_DEVELOPMENT,
  previewUrl: process.env.EXPO_PUBLIC_API_URL_PREVIEW,
  productionUrl: process.env.EXPO_PUBLIC_API_URL_PRODUCTION,
};

if (process.argv.includes('--self-test')) {
  const urls = {
    developmentUrl: 'http://192.168.1.42:3001/',
    previewUrl: 'https://preview.stringphone.test/api/',
    productionUrl: 'https://stringphone.test/api',
  };
  for (const environment of ['development', 'preview', 'production']) {
    const result = resolveApiConfig({ ...urls, environment });
    assert.equal(result.environment, environment);
    assert.ok(!result.baseUrl.endsWith('/'));
  }
  assert.throws(() => resolveApiConfig(urls));
  process.env.EXPO_PUBLIC_APP_ENV = 'preview';
  process.env.EXPO_PUBLIC_API_URL_PREVIEW = urls.previewUrl;
  assert.equal(getApiUrl('/chat/messages/text'), 'https://preview.stringphone.test/api/chat/messages/text');
  for (const path of ['//other.test', '../chat', '/chat/../other', '/chat?token=secret']) {
    assert.throws(() => getApiUrl(path));
  }
  for (const invalid of [
    { environment: 'staging' },
    { environment: 'preview', previewUrl: '' },
    { developmentUrl: '/api' },
    { developmentUrl: 'http://localhost:3001' },
    { developmentUrl: 'http://127.0.0.1:3001' },
    { developmentUrl: 'http://[::1]:3001' },
    { environment: 'production', productionUrl: 'http://server.test' },
    { productionUrl: 'https://user:password@server.test', environment: 'production' },
    { developmentUrl: 'https://server.test?key=secret' },
    { developmentUrl: 'https://server.test#fragment' },
    { developmentUrl: 'ftp://server.test' },
    { developmentUrl: 'https://preview.example.com/api' },
  ]) assert.throws(() => resolveApiConfig({ ...urls, ...invalid }));
  console.log('API environment selection and validation checks passed.');
} else {
  const config = resolveApiConfig(settings);
  console.log(`Environment: ${config.environment}\nAPI base: ${config.baseUrl}`);
  console.log('Configuration is valid. This check does not contact the backend.');
}
