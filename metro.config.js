const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Expo SQLite's web worker loads a WASM asset and uses SharedArrayBuffer; the 3D
// sanctuary bundles rigged marine models as .glb.
config.resolver.assetExts.push('wasm', 'glb');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

// three@0.186 resolves through its `require` export condition to build/three.cjs, a
// deprecated CommonJS shim that calls process.emitWarning — undefined under Hermes,
// so the whole module throws at import. Point every `three` import (ours and
// three/examples/jsm's) at the ES module build instead.
const threeModule = path.join(__dirname, 'node_modules/three/build/three.module.js');
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
