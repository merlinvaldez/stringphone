const { getDefaultConfig } = require('expo/metro-config');
const { createBoundaryResolver, sharedRoot } = require('./scripts/server-boundary.cjs');

const config = getDefaultConfig(__dirname);
// This is a sibling app, not an npm workspace: include the pure shared source
// explicitly now that native language controls import it at runtime.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), sharedRoot])];
// expo-sqlite's web worker loads its WASM implementation as a bundled asset.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');
// Inspect final resolved paths too, so aliases/re-exports cannot hide server code.
config.resolver.resolveRequest = createBoundaryResolver(config.resolver.resolveRequest);
module.exports = config;
