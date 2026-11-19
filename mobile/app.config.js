/**
 * Keep app.json as the source of shared Expo configuration and use a separate
 * Android and iOS identities for local development builds.
 */
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') {
    return config;
  }

  return {
    ...config,
    name: `${config.name} Debug`,
    slug: `${config.slug}-debug`,
    scheme: 'stringphone-debug',
    plugins: [
      ...(config.plugins ?? []),
      ...(process.platform === 'win32' ? ['./plugins/withWindowsCmakePathLimit'] : []),
    ],
    ios: {
      ...config.ios,
      bundleIdentifier: `${config.ios.bundleIdentifier}.debug`,
    },
    android: {
      ...config.android,
      package: `${config.android.package}.debug`,
    },
  };
};
