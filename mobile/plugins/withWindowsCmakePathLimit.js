const { withAppBuildGradle } = require('@expo/config-plugins');

// React Native codegen adds long absolute node_modules paths to object targets.
// Keep CMake's native staging tree short on Windows so Ninja stays under MAX_PATH.
const CMAKE_OBJECT_PATH_MAX = 220;
const CMAKE_ARGUMENT = `-DCMAKE_OBJECT_PATH_MAX=${CMAKE_OBJECT_PATH_MAX}`;
const CMAKE_BUILD_STAGING_DIRECTORY = 'C:/sp';
const CMAKE_STAGING_SETTING = `buildStagingDirectory "${CMAKE_BUILD_STAGING_DIRECTORY}"`;
const CMAKE_STAGING_SETTING_PATTERN = /^[\t ]*buildStagingDirectory[\t ]+["'][^\r\n]*["'][\t ]*\r?\n/gm;

module.exports = function withWindowsCmakePathLimit(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const { contents } = modConfig.modResults;

    if (!modConfig.modResults.contents.includes(CMAKE_ARGUMENT)) {
      const defaultConfig = /(\n\s*defaultConfig\s*\{\s*\n)/;
      if (!defaultConfig.test(modConfig.modResults.contents)) {
        throw new Error('Could not add the Windows CMake object path limit to app/build.gradle.');
      }

      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        defaultConfig,
        `$1        externalNativeBuild {\n            cmake {\n                arguments "${CMAKE_ARGUMENT}"\n            }\n        }\n`,
      );
    }

    modConfig.modResults.contents = modConfig.modResults.contents.replace(CMAKE_STAGING_SETTING_PATTERN, '');
    const androidBlock = /(\nandroid\s*\{\s*\n)/;
    if (!androidBlock.test(modConfig.modResults.contents)) {
      throw new Error('Could not add the short Windows CMake output directory to app/build.gradle.');
    }

    modConfig.modResults.contents = modConfig.modResults.contents.replace(
      androidBlock,
      `$1    externalNativeBuild {\n        cmake {\n            ${CMAKE_STAGING_SETTING}\n        }\n    }\n`,
    );

    return modConfig;
  });
};
