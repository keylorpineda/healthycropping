/**
 * Expo config plugin: sign release APKs with the upload keystore from the environment.
 *
 * `expo prebuild` generates `android/app/build.gradle` with release builds signed by
 * the debug keystore. This plugin adds a `release` signing config whose values come
 * from environment variables at Gradle time, so no keystore or password is ever
 * written to the repository or to the generated project:
 *
 *   HEALTHYCROPPING_KEYSTORE_PATH      absolute path of the decoded .jks file
 *   HEALTHYCROPPING_KEYSTORE_PASSWORD  keystore password
 *   HEALTHYCROPPING_KEY_ALIAS          key alias
 *   HEALTHYCROPPING_KEY_PASSWORD       key password
 *
 * Without HEALTHYCROPPING_KEYSTORE_PATH the release build keeps the debug key (local
 * builds keep working; CI warns). It also derives `versionCode` from the semantic
 * version (major * 10000 + minor * 100 + patch) unless `android.versionCode` is set,
 * so every release can be installed over the previous one.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// healthycropping: release signing from environment';

const DEBUG_SIGNING_BLOCK = /( {4}signingConfigs \{\n {8}debug \{\n(?: {12}[^\n]*\n)+? {8}\}\n)/;
const RELEASE_DEBUG_SIGNING =
  /( {8}release \{\n(?: {12}\/\/[^\n]*\n)*) {12}signingConfig signingConfigs\.debug\n/;
const VERSION_CODE = / {8}versionCode \d+\n/;

const RELEASE_SIGNING_CONFIG = `        release {
            ${MARKER}
            def releaseStore = System.getenv('HEALTHYCROPPING_KEYSTORE_PATH')
            if (releaseStore) {
                storeFile file(releaseStore)
                storePassword System.getenv('HEALTHYCROPPING_KEYSTORE_PASSWORD')
                keyAlias System.getenv('HEALTHYCROPPING_KEY_ALIAS')
                keyPassword System.getenv('HEALTHYCROPPING_KEY_PASSWORD')
            }
        }
`;

const RELEASE_SIGNING_SELECTION =
  "            signingConfig System.getenv('HEALTHYCROPPING_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug\n";

/** `0.5.0` -> 500, `1.2.3` -> 10203. Throws for anything that is not plain semver. */
function versionCodeFor(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  if (!match) {
    throw new Error(`withReleaseSigning: expected a semantic version, got "${version}"`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) {
    throw new Error(`withReleaseSigning: minor and patch must be <= 99 (got ${version})`);
  }
  return major * 10000 + minor * 100 + patch;
}

/** Pure transform of the generated build.gradle; idempotent, fails loudly on template drift. */
function applyReleaseSigning(gradle, versionCode) {
  let result = gradle;
  if (!result.includes(MARKER)) {
    if (!DEBUG_SIGNING_BLOCK.test(result) || !RELEASE_DEBUG_SIGNING.test(result)) {
      throw new Error(
        'withReleaseSigning: build.gradle no longer matches the Expo template; update the plugin.',
      );
    }
    result = result.replace(DEBUG_SIGNING_BLOCK, `$1${RELEASE_SIGNING_CONFIG}`);
    result = result.replace(RELEASE_DEBUG_SIGNING, `$1${RELEASE_SIGNING_SELECTION}`);
  }
  if (versionCode !== undefined) {
    if (!VERSION_CODE.test(result)) {
      throw new Error('withReleaseSigning: versionCode not found in build.gradle.');
    }
    result = result.replace(VERSION_CODE, `        versionCode ${versionCode}\n`);
  }
  return result;
}

function withReleaseSigning(config) {
  const versionCode = config.android?.versionCode ?? versionCodeFor(config.version);
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: only Groovy build.gradle files are supported.');
    }
    modConfig.modResults.contents = applyReleaseSigning(modConfig.modResults.contents, versionCode);
    return modConfig;
  });
}

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
module.exports.versionCodeFor = versionCodeFor;
module.exports.MARKER = MARKER;
