import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the actual native adapter with SDK 57's asynchronous copy contract.
const files = new Map([['file:///recording.m4a', new Uint8Array([1, 2, 3])]]);
let completeCopy;
class Directory {
  constructor() { this.uri = 'file:///managed'; }
  create() {}
}
class File {
  constructor(parent, name) { this.uri = name ? `${parent.uri}/${name}` : parent; }
  get exists() { return files.has(this.uri); }
  get size() { return files.get(this.uri)?.length ?? 0; }
  async copy(destination) {
    await new Promise(resolve => { completeCopy = resolve; });
    files.set(destination.uri, files.get(this.uri).slice());
  }
  delete() { files.delete(this.uri); }
}
const source = readFileSync(new URL('../mobile/src/adapters/files.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
new Function('require', 'exports', compiled)(name => {
  if (name === 'expo-file-system') return { Directory, File, Paths: { document: 'file:///' } };
  if (name === '../storage/audio') return { isManagedAudioName: name => /^[\w-]+\.m4a$/.test(name) };
  throw Error(`Unexpected import ${name}`);
}, exports);
const adapter = exports.createNativeAudioFiles();
let settled = false;
const result = adapter.save('saved.m4a', { uri: 'file:///recording.m4a' }).finally(() => { settled = true; });
await Promise.resolve();
assert.equal(settled, false, 'Save must wait for native copy completion');
assert.equal(files.has('file:///managed/saved.m4a'), false);
completeCopy();
assert.equal(await result, 3);
assert.equal((await adapter.stat('saved.m4a')).size, 3);
assert.ok(files.has('file:///recording.m4a'), 'Source remains available');
console.log('PASS native file adapter waits for SDK 57 asynchronous copy before verification');
