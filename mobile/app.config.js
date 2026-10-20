/**
 * Keep app.json as the source of shared Expo configuration and use a separate
 * Android identity for local development builds.
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
    android: {
      ...config.android,
      package: `${config.android.package}.debug`,
    },
  };
};
