interface ReleaseSigningPlugin {
  (config: Record<string, unknown>): Record<string, unknown>;
  applyReleaseSigning: (gradle: string, versionCode?: number) => string;
  versionCodeFor: (version: string) => number;
  MARKER: string;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withReleaseSigning') as ReleaseSigningPlugin;
const { applyReleaseSigning, versionCodeFor, MARKER } = plugin;

const FIXTURE = `    defaultConfig {
        applicationId 'com.keylorpineda.healthycropping'
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "0.5.0"
    }
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            shrinkResources (findProperty('android.enableShrinkResourcesInReleaseBuilds')?.toBoolean() ?: false)
        }
    }
`;

describe('withReleaseSigning config plugin', () => {
  it('exports the config plugin as the default function', () => {
    expect(typeof plugin).toBe('function');
  });

  describe('versionCodeFor', () => {
    it('derives versionCode from semantic versions', () => {
      expect(versionCodeFor('0.5.0')).toBe(500);
      expect(versionCodeFor('1.0.0')).toBe(10000);
      expect(versionCodeFor('1.2.3')).toBe(10203);
    });

    it('throws for non-semver or out-of-range versions', () => {
      expect(() => versionCodeFor('1.0')).toThrow(/expected a semantic version/);
      expect(() => versionCodeFor('1.0.0-beta')).toThrow(/expected a semantic version/);
      expect(() => versionCodeFor('0.100.0')).toThrow(/minor and patch must be <= 99/);
      expect(() => versionCodeFor('0.1.100')).toThrow(/minor and patch must be <= 99/);
    });
  });

  describe('applyReleaseSigning', () => {
    it('injects environment-driven release signing and updates versionCode', () => {
      const output = applyReleaseSigning(FIXTURE, 500);

      expect(output.split(MARKER)).toHaveLength(2);
      expect(output).toMatch(
        /signingConfigs \{\n {8}debug \{[\s\S]*?\n {8}\}\n {8}release \{\n {12}\/\/ healthycropping: release signing from environment[\s\S]*?\n {8}\}\n {4}\}/,
      );
      expect(output).toContain("System.getenv('HEALTHYCROPPING_KEYSTORE_PATH')");
      expect(output).toContain("System.getenv('HEALTHYCROPPING_KEYSTORE_PASSWORD')");
      expect(output).toContain("System.getenv('HEALTHYCROPPING_KEY_ALIAS')");
      expect(output).toContain("System.getenv('HEALTHYCROPPING_KEY_PASSWORD')");
      expect(output).toContain(
        "            signingConfig System.getenv('HEALTHYCROPPING_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug\n",
      );
      expect(output).toMatch(
        /buildTypes \{\n {8}debug \{\n {12}signingConfig signingConfigs\.debug\n {8}\}/,
      );
      expect(output).toContain('        versionCode 500\n');

      const passwordMatches = [...output.matchAll(/(?:storePassword|keyPassword)\s+([^\n]+)/g)].map(
        (m) => m[1].trim(),
      );
      expect(passwordMatches).toEqual([
        "'android'",
        "'android'",
        "System.getenv('HEALTHYCROPPING_KEYSTORE_PASSWORD')",
        "System.getenv('HEALTHYCROPPING_KEY_PASSWORD')",
      ]);
    });

    it('is idempotent and allows updating versionCode on subsequent runs', () => {
      const once = applyReleaseSigning(FIXTURE, 500);
      const twice = applyReleaseSigning(once, 500);
      expect(twice).toBe(once);

      const updated = applyReleaseSigning(once, 600);
      expect(updated.split(MARKER)).toHaveLength(2);
      expect(updated).toBe(once.replace('        versionCode 500\n', '        versionCode 600\n'));
    });

    it('leaves versionCode untouched when versionCode is undefined', () => {
      const output = applyReleaseSigning(FIXTURE, undefined);
      expect(output).toContain('        versionCode 1\n');
    });

    it('throws loudly when the Gradle template drifts', () => {
      const withoutDebugSigning = FIXTURE.replace(/ {8}debug \{[\s\S]*? {8}\}\n/, '');
      expect(() => applyReleaseSigning(withoutDebugSigning, 500)).toThrow(
        /no longer matches the Expo template/,
      );

      const withoutReleaseDebugSigning = FIXTURE.replace(
        / {8}release \{\n([\s\S]*?) {12}signingConfig signingConfigs\.debug\n/,
        '        release {\n$1',
      );
      expect(() => applyReleaseSigning(withoutReleaseDebugSigning, 500)).toThrow(
        /no longer matches the Expo template/,
      );

      const withoutVersionCode = FIXTURE.replace('        versionCode 1\n', '');
      expect(() => applyReleaseSigning(withoutVersionCode, 500)).toThrow(/versionCode not found/);
    });
  });
});
