import assert from 'node:assert/strict';
import { getSupportedTtsLanguage, requiresPhoneticGuide, SUPPORTED_TTS_LANGUAGE_OPTIONS } from '../shared/languages.ts';
import { LANGUAGE_OPTIONS } from '../shared/languageOptions.ts';
import { formatDuration, formatPronunciationGuide, formatTimestamp } from '../shared/formatting.ts';
import { validateTextChatMessage } from '../shared/validation.ts';
import { readFileSync, readdirSync } from 'node:fs';

assert.equal(SUPPORTED_TTS_LANGUAGE_OPTIONS.length, 43);
assert.deepEqual(LANGUAGE_OPTIONS.slice(0, 4).map(x => x.code), ['en', 'es', 'fr', 'de']);
assert.equal(new Set(LANGUAGE_OPTIONS.map(x => x.code)).size, 43);
assert.deepEqual(new Set(LANGUAGE_OPTIONS.map(x => x.code)), new Set(SUPPORTED_TTS_LANGUAGE_OPTIONS.map(x => x.code)));
for (const language of SUPPORTED_TTS_LANGUAGE_OPTIONS) {
  for (const key of [language.code, language.name, ...language.aliases]) {
    assert.equal(getSupportedTtsLanguage(` ${key.toUpperCase()} `), language);
  }
}
// Object-prototype property names are not supported languages.
for (const value of [null, {}, '', 'invalid', 'constructor', 'toString', '__proto__']) {
  assert.equal(getSupportedTtsLanguage(value), null);
}
assert.equal(requiresPhoneticGuide('en', 'es'), false);
assert.equal(requiresPhoneticGuide('en', 'ar'), true);
assert.equal(requiresPhoneticGuide('fa', 'ar'), false);
assert.equal(formatDuration(0), '0:00');
assert.equal(formatDuration(59.1), '1:00');
assert.equal(formatDuration(-1), '--:--');
assert.equal(formatDuration(NaN), '--:--');
assert.equal(formatPronunciationGuide(' Pronounce: (hola) '), 'hola');
assert.equal(formatPronunciationGuide(null), '');
assert.equal(formatTimestamp('invalid date'), '');
assert.equal(typeof formatTimestamp('2026-10-14T12:00:00Z'), 'string');
const pair = { sourceLanguage: 'en', targetLanguage: 'es' };
assert.equal(validateTextChatMessage({ ...pair, text: '  Hello  ' }).originalText, 'Hello');
assert.equal(validateTextChatMessage({ ...pair, text: 'a'.repeat(501) }).ok, true);
for (const [input, error] of [
  [{ text: ' ', sourceLanguage: 'invalid' }, 'text is required'],
  [{ ...pair, text: 'Hello', sourceLanguage: 'invalid' }, 'sourceLanguage is not supported'],
  [{ ...pair, text: 'Hello', targetLanguage: 'invalid' }, 'targetLanguage is not supported'],
]) {
  const result = validateTextChatMessage(input);
  assert.equal(result.status, 400);
  assert.equal(result.body.error, error);
}
// The shared directory must never acquire platform/provider dependencies.
for (const file of readdirSync(new URL('../shared/', import.meta.url)).filter(x => x.endsWith('.ts'))) {
  const source = readFileSync(new URL(`../shared/${file}`, import.meta.url), 'utf8');
  const imports = [...source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)].map(x => x[1]);
  assert.ok(imports.every(x => x.startsWith('./')), `${file} imports outside shared/`);
  assert.doesNotMatch(source, /\b(?:window|document|localStorage|Buffer|process)\b/);
}
console.log('Shared language, formatting, validation and platform-boundary checks passed.');
