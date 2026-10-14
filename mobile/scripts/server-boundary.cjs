// Node-only build tooling. Never import this file from mobile/src or shared/.
const path = require('node:path');
const fs = require('node:fs');
const { builtinModules } = require('node:module');
const mobileRoot = path.resolve(__dirname, '..');
const sharedRoot = path.resolve(mobileRoot, '../shared');
const builtinNames = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const serverPackages = new Set([
  'pg', 'pg-native', 'postgres', 'dotenv', 'express', 'multer',
  'openai', '@anthropic-ai/sdk', '@google/genai', '@google/generative-ai',
  '@clerk/express', '@vercel/node',
]);
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
function canonical(file) {
  return fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
}
function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
}
function fail(message) { throw new Error(`Mobile server boundary: ${message}`); }
function assertModuleName(name) {
  if (name.startsWith('node:') || builtinNames.has(name)) fail(`Node module "${name}" cannot enter the mobile bundle.`);
  if (serverPackages.has(packageName(name))) fail(`Server/provider package "${name}" cannot enter the mobile bundle.`);
}
function assertResolvedFile(file, origin) {
  const target = canonical(file);
  const source = canonical(origin);
  const segments = target.replaceAll('\\', '/').split('/');
  for (let index = 0; index < segments.length; index++) {
    if (segments[index] !== 'node_modules') continue;
    const dependency = segments[index + 1]?.startsWith('@')
      ? segments.slice(index + 1, index + 3).join('/') : segments[index + 1];
    if (serverPackages.has(dependency)) fail(`Resolved server/provider dependency: ${target}`);
  }
  if (inside(sharedRoot, source) && !inside(sharedRoot, target)) {
    fail(`Shared logic may only import shared logic: ${target}`);
  }
  // SDK 57 synthesizes these modules; they have a NUL-prefixed virtual path.
  const virtualName = path.relative(mobileRoot, target);
  if (['\0polyfill:assets-registry', '\0polyfill:environment-variables', '\0polyfill:external-require'].includes(virtualName)) return;
  if (segments.includes('node_modules')) return;
  // Only app source/assets and pure shared source may enter from this checkout.
  // mobile/scripts and config are Node build tooling, not app code.
  if (inside(path.join(mobileRoot, 'src'), target) ||
      inside(path.join(mobileRoot, 'assets'), target) || inside(sharedRoot, target)) return;
  fail(`Resolved file outside mobile source/assets and shared/: ${target}`);
}
function createBoundaryResolver(defaultResolver) {
  return (context, moduleName, platform) => {
    assertModuleName(moduleName);
    const result = (defaultResolver ?? context.resolveRequest)(context, moduleName, platform);
    const files = result.type === 'sourceFile' ? [result.filePath]
      : result.type === 'assetFiles' ? result.filePaths : [];
    for (const file of files) assertResolvedFile(file, context.originModulePath);
    return result;
  };
}
module.exports = { assertModuleName, assertResolvedFile, createBoundaryResolver, inside, packageName, mobileRoot, sharedRoot };
