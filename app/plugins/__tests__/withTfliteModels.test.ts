import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { getModelResourceName } from '@/ml/registry';
import { type ModelRegistry } from '@/ml/types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const plugin = require('../withTfliteModels');

const MODEL_BYTES = Buffer.from('fake-tflite-weights');
const MODEL_SHA = crypto.createHash('sha256').update(MODEL_BYTES).digest('hex');

function writeRegistry(root: string, crop: string, modelFile: string, sha: string): void {
  const dir = path.join(root, 'registries', crop);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'registry.json'),
    JSON.stringify({ crop, model_file: modelFile, model_sha256: sha }),
  );
}

function writeModel(root: string, crop: string, modelFile: string): void {
  const dir = path.join(root, 'models', crop);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, modelFile), MODEL_BYTES);
}

describe('withTfliteModels config plugin', () => {
  let root: string;
  const log = { warn: jest.fn() };

  const sync = (strict = false) =>
    plugin.syncModels({
      registriesDir: path.join(root, 'registries'),
      modelsRoot: path.join(root, 'models'),
      destDir: path.join(root, 'raw'),
      strict,
      log,
    });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'hc-models-'));
    log.warn.mockClear();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('converts model filenames into valid Android raw resource names', () => {
    expect(plugin.toAndroidRawResourceName('coffee_v0.1.0_fp16.tflite')).toBe('coffee_v0_1_0_fp16');
    expect(plugin.toAndroidRawResourceName('Banana-V1.TFLITE')).toBe('banana_v1');
  });

  it('uses the same resource name the app loads at runtime', () => {
    const registry = { model_file: 'cacao_v0.1.0_fp16.tflite' } as ModelRegistry;
    expect(plugin.toAndroidRawResourceName(registry.model_file)).toBe(
      getModelResourceName(registry),
    );
  });

  it('copies verified models into the raw resources directory', () => {
    writeRegistry(root, 'coffee', 'coffee_v0.1.0_fp16.tflite', MODEL_SHA);
    writeModel(root, 'coffee', 'coffee_v0.1.0_fp16.tflite');

    const result = sync();

    expect(result).toEqual({ copied: ['coffee_v0_1_0_fp16'], missing: [] });
    expect(fs.readFileSync(path.join(root, 'raw', 'coffee_v0_1_0_fp16.tflite'))).toEqual(
      MODEL_BYTES,
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('throws when a model checksum does not match its registry', () => {
    writeRegistry(root, 'coffee', 'coffee_v0.1.0_fp16.tflite', 'deadbeef');
    writeModel(root, 'coffee', 'coffee_v0.1.0_fp16.tflite');

    expect(() => sync()).toThrow(/SHA-256 mismatch/);
  });

  it('warns about missing models by default and throws in strict mode', () => {
    writeRegistry(root, 'cacao', 'cacao_v0.1.0_fp16.tflite', MODEL_SHA);

    expect(sync().missing).toHaveLength(1);
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/Missing TFLite models/));
    expect(() => sync(true)).toThrow(/Missing TFLite models/);
  });
});
