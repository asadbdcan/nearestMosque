// metro.config.js
//
// Workaround for a Windows-specific Metro bug:
//   "ENOENT: no such file or directory, mkdir
//    'D:\\…\\.expo\\metro\\externals\\node:sea'"
//
// Some transitive dependency imports Node built-ins via the `node:` protocol
// (e.g. `require('node:sea')`, `require('node:fs')`). Metro tries to cache
// the resolution under a folder literally named `node:sea`, but Windows
// disallows colons in path components, so mkdir fails.
//
// React Native / Expo can't run Node built-ins anyway, so the right fix is
// to short-circuit any `node:*` import to an empty module. We do that with
// a custom resolveRequest hook.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (typeof moduleName === 'string' && moduleName.startsWith('node:')) {
    // Return an empty module — Metro will treat the import as a stub.
    return { type: 'empty' };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
