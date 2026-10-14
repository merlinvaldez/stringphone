const { getDefaultConfig } = require('expo/metro-config');
const { createBoundaryResolver } = require('./scripts/server-boundary.cjs');

const config = getDefaultConfig(__dirname);
// Inspect final resolved paths too, so aliases/re-exports cannot hide server code.
config.resolver.resolveRequest = createBoundaryResolver(config.resolver.resolveRequest);
module.exports = config;
