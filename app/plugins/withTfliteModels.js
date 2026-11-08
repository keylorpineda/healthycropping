/**
 * Expo config plugin that bundles the on-device TFLite models into the Android build.
 *
 * Model weights are never committed (`*.tflite` is git-ignored), so during `expo prebuild`
 * this plugin copies every model listed in `src/ml/models/<crop>/registry.json` from
 * `../ml/models/<crop>/` into `android/app/src/main/res/raw/`, verifying its SHA-256.
 * `react-native-fast-tflite` loads bundled models by raw resource name (see
 * `getModelResourceName` in `src/ml/registry.ts`).
 *
 * Missing models only warn by default so contributors without weights can still build;
 * set `HEALTHYCROPPING_REQUIRE_MODELS=1` (release builds) to fail instead.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const TFLITE_EXTENSION = '.tflite';

/** Converts a model filename into a valid Android raw resource name (`[a-z0-9_]`). */
function toAndroidRawResourceName(modelFile) {
  const base = modelFile.toLowerCase().endsWith(TFLITE_EXTENSION)
    ? modelFile.slice(0, -TFLITE_EXTENSION.length)
    : modelFile;
  return base.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** Reads every `registry.json` under `registriesDir/<crop>/`. */
function readRegistries(registriesDir) {
  if (!fs.existsSync(registriesDir)) return [];
  return fs
    .readdirSync(registriesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(registriesDir, entry.name, 'registry.json'))
    .filter((registryPath) => fs.existsSync(registryPath))
    .map((registryPath) => JSON.parse(fs.readFileSync(registryPath, 'utf8')));
}

/**
 * Copies registered models from `modelsRoot/<crop>/<model_file>` into `destDir`.
 * Returns the list of copied resource names and missing model files.
 */
function syncModels({ registriesDir, modelsRoot, destDir, strict = false, log = console }) {
  const copied = [];
  const missing = [];

  for (const registry of readRegistries(registriesDir)) {
    const source = path.join(modelsRoot, registry.crop, registry.model_file);
    if (!fs.existsSync(source)) {
      missing.push(source);
      continue;
    }

    const actualSha = sha256File(source);
    if (actualSha !== registry.model_sha256) {
      throw new Error(
        `[withTfliteModels] SHA-256 mismatch for ${source}: expected ${registry.model_sha256}, got ${actualSha}`,
      );
    }

    const resourceName = toAndroidRawResourceName(registry.model_file);
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(source, path.join(destDir, `${resourceName}${TFLITE_EXTENSION}`));
    copied.push(resourceName);
  }

  if (missing.length > 0) {
    const message = `[withTfliteModels] Missing TFLite models (diagnosis will fail for these crops): ${missing.join(', ')}`;
    if (strict) {
      throw new Error(message);
    }
    log.warn(message);
  }

  return { copied, missing };
}

function withTfliteModels(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const appRoot = modConfig.modRequest.projectRoot;
      syncModels({
        registriesDir: path.join(appRoot, 'src', 'ml', 'models'),
        modelsRoot: path.resolve(appRoot, '..', 'ml', 'models'),
        destDir: path.join(
          modConfig.modRequest.platformProjectRoot,
          'app',
          'src',
          'main',
          'res',
          'raw',
        ),
        strict: process.env.HEALTHYCROPPING_REQUIRE_MODELS === '1',
      });
      return modConfig;
    },
  ]);
}

module.exports = withTfliteModels;
module.exports.toAndroidRawResourceName = toAndroidRawResourceName;
module.exports.syncModels = syncModels;
