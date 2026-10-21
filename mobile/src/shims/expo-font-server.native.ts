// Expo Font only calls this helper during web static rendering. Its native
// entrypoint imports it unconditionally, which otherwise brings node:async_hooks
// into the Android/iOS bundle. Native font loading continues through ExpoFontLoader.
export function registerStaticFont(): never {
  throw new Error('Static Expo Font registration is only available during web server rendering.');
}
