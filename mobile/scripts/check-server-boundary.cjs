const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { assertModuleName, assertResolvedFile, createBoundaryResolver, inside, packageName, mobileRoot, sharedRoot } = require('./server-boundary.cjs');
const packageJson = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
const declaredPackages = new Set(Object.keys(packageJson.dependencies));

function checkImport(specifier, file) {
  assertModuleName(specifier);
  if (specifier.startsWith('.')) {
    const target = path.resolve(path.dirname(file), specifier);
    // Check before resolution as well, so missing forbidden paths still fail.
    assertResolvedFile(target, file);
    const withoutJs = target.replace(/\.js$/, '');
    const candidates = [target, ...['.ts', '.tsx', '.js', '.jsx', '.json'].map(ext => withoutJs + ext),
      ...['index.ts', 'index.tsx', 'index.js'].map(name => path.join(target, name))];
    const resolved = candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!resolved) throw new Error(`Unresolved import ${specifier} in ${file}`);
    assertResolvedFile(resolved, file);
  } else {
    if (inside(sharedRoot, file)) throw new Error(`Shared source imports package ${specifier}`);
    if (!declaredPackages.has(packageName(specifier))) throw new Error(`Undeclared mobile dependency ${specifier} in ${file}`);
  }
}
function checkSource(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      checkImport(node.moduleSpecifier.text, file);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      checkImport(node.moduleReference.expression.text, file);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      checkImport(node.argument.literal.text, file);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
      (ts.isPropertyAccessExpression(node.expression) && node.expression.getText(ast) === 'require.resolve'))) {
      if (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0])) {
        throw new Error(`Computed module import is not allowed in ${file}`);
      }
      checkImport(node.arguments[0].text, file);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
function scan(directory) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) count += scan(file);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      checkSource(fs.readFileSync(file, 'utf8'), file); count++;
    }
  }
  return count;
}
for (const dependency of declaredPackages) assertModuleName(dependency);
const count = scan(path.join(mobileRoot, 'src')) + scan(sharedRoot);

// Negative fixtures prove the checker rejects imports before they are shipped.
const screen = path.join(mobileRoot, 'src', 'boundary-fixture.ts');
for (const source of [
  'import { runTextChatMessage } from "../../src/lib/runTextChatMessage";',
  'export * from "../../src/services/translateText";',
  'const provider = require("openai");',
  'const db = import("pg");',
  'import fs from "node:fs";',
  'import path from "path";',
  'type Voice = import("../../src/lib/runVoiceChatMessage").RunVoiceChatMessageInput;',
  'const module = import(destination);',
]) assert.throws(() => checkSource(source, screen));
assert.throws(() => checkSource('export * from "../src/lib/languages";', path.join(sharedRoot, 'fixture.ts')));
checkSource('export * from "../../shared/languages";', screen);
checkSource('import { useAudioPlayer } from "expo-audio";', screen);
const guarded = createBoundaryResolver((_context, _name, _platform) => ({ type: 'sourceFile', filePath: path.resolve(mobileRoot, '../src/lib/runOutputTextToSpeech.ts') }));
assert.throws(() => guarded({ originModulePath: screen }, '@innocent/alias', 'android'), /Mobile server boundary/);
assert.throws(() => assertResolvedFile(path.join(mobileRoot, 'node_modules/openai/index.js'), screen), /provider/);
assert.throws(() => assertResolvedFile(path.join(mobileRoot, 'scripts/server-boundary.cjs'), screen), /outside/);
assert.doesNotThrow(() => assertResolvedFile(path.join(mobileRoot, '\0polyfill:assets-registry'), screen));
assert.throws(() => assertResolvedFile(path.join(mobileRoot, '\0polyfill:server-code'), screen), /outside/);
const allowed = createBoundaryResolver(() => ({ type: 'sourceFile', filePath: path.join(sharedRoot, 'languages.ts') }));
assert.equal(allowed({ originModulePath: screen }, '../../shared/languages', 'ios').type, 'sourceFile');
console.log(`Server boundary passed: ${count} mobile/shared source files and negative import/resolver fixtures.`);
