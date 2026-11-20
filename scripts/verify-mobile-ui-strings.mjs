import assert from 'node:assert/strict';
import { createUiStringLoader, ENGLISH_UI_STRINGS, interpolateTemplate } from '../shared/uiStrings.ts';

let calls = 0;
let offline = false;
const load = createUiStringLoader(async language => {
  calls++;
  if (offline) throw new Error('Offline');
  return language === 'es'
    ? { speak: ' Hablar ', listen: '', messageIn: 'Sin marcador', unknown: 'ignored' }
    : { speak: 'Parler' };
});

assert.equal(await load('en'), ENGLISH_UI_STRINGS);
assert.equal(calls, 0);
const [first, second] = await Promise.all([load('es'), load('es')]);
assert.equal(first, second);
assert.equal(first.speak, 'Hablar');
assert.equal(first.listen, ENGLISH_UI_STRINGS.listen);
assert.equal(first.messageIn, ENGLISH_UI_STRINGS.messageIn);
assert.equal(first.unknown, undefined);
assert.equal(await load('es'), first);
assert.equal(calls, 1);
offline = true;
assert.equal(await load('fr'), ENGLISH_UI_STRINGS);
offline = false;
assert.equal((await load('fr')).speak, 'Parler');
assert.equal(calls, 3);
assert.equal(interpolateTemplate(first.messageIn, { language: 'Español' }), 'Type message in Español');
console.log('UI string loader checks passed');
