const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { createBoundaryResolver, sharedRoot } = require('./scripts/server-boundary.cjs');

const config = getDefaultConfig(__dirname);
// This is a sibling app, not an npm workspace: include the pure shared source
// explicitly now that native language controls import it at runtime.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), sharedRoot])];
// expo-sqlite's web worker loads its WASM implementation as a bundled asset.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');
// Expo Font's native API imports a server-only helper from the shared entrypoint.
// Keep its SSR-only registration call out of Android/iOS bundles, where it pulls
// node:async_hooks into Metro even though that branch cannot run on native.
const expoFontNativeServerStub = path.join(__dirname, 'src/shims/expo-font-server.native.ts');
const defaultResolver = config.resolver.resolveRequest;
const resolveMobileModule = (context, moduleName, platform) => {
  const origin = context.originModulePath.replaceAll('\\', '/').toLowerCase();
  if (platform !== 'web' && moduleName === './server' && origin.endsWith('/node_modules/expo-font/build/font.js')) {
    return { type: 'sourceFile', filePath: expoFontNativeServerStub };
  }
  // Node ESM needs the emitted .js extension. Metro bundles the TypeScript source.
  const resolvedName = moduleName === './languages.js' &&
    context.originModulePath === path.join(sharedRoot, 'validation.ts')
    ? './languages.ts'
    : moduleName;
  return defaultResolver
    ? defaultResolver(context, resolvedName, platform)
    : context.resolveRequest(context, resolvedName, platform);
};
// Inspect final resolved paths too, so aliases/re-exports cannot hide server code.
config.resolver.resolveRequest = createBoundaryResolver(resolveMobileModule);
module.exports = config;
