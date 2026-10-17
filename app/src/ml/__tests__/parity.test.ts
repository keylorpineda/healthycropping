import fixtureJson from '../fixtures/preprocessing_fixture_224.json';
import { base64ToUint8Array, normalizeRgbTensor } from '../preprocess';

interface FixtureProbe {
  row: number;
  col: number;
  rgb: [number, number, number];
  normalized: [number, number, number];
}

interface PreprocessingFixture {
  schema_version: number;
  width: number;
  height: number;
  channels: number;
  mean: [number, number, number];
  std: [number, number, number];
  rgb_base64: string;
  rgb_sha256: string;
  tensor_sha256_float32_le: string;
  tensor_stats: {
    min: number;
    max: number;
    sum: number;
  };
  probes: FixtureProbe[];
}

const fixture = fixtureJson as unknown as PreprocessingFixture;

describe('Cross-Platform Preprocessing Parity Test (Python -> React Native)', () => {
  it('loads the shared preprocessing fixture generated in Phase 2', () => {
    expect(fixture.schema_version).toBe(1);
    expect(fixture.width).toBe(224);
    expect(fixture.height).toBe(224);
    expect(fixture.channels).toBe(3);
    expect(fixture.probes.length).toBe(35);
  });

  it('decodes RGB base64 and normalizes into exact tensor parity', () => {
    const rawRgb = base64ToUint8Array(fixture.rgb_base64);
    expect(rawRgb.length).toBe(224 * 224 * 3);

    const tensor = normalizeRgbTensor(rawRgb, 224, 224, {
      mean: fixture.mean,
      std: fixture.std,
    });

    expect(tensor.length).toBe(224 * 224 * 3);

    // Compute min, max, and sum
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (let i = 0; i < tensor.length; i++) {
      const val = tensor[i];
      if (val !== undefined) {
        if (val < min) min = val;
        if (val > max) max = val;
        sum += val;
      }
    }

    expect(min).toBeCloseTo(fixture.tensor_stats.min, 5);
    expect(max).toBeCloseTo(fixture.tensor_stats.max, 5);
    expect(sum).toBeCloseTo(fixture.tensor_stats.sum, 2);

    // Verify all 35 coordinate probes across the image canvas
    fixture.probes.forEach((probe) => {
      const { row, col, rgb, normalized } = probe;
      const pixelOffset = (row * fixture.width + col) * 3;

      // Verify raw bytes at coordinate
      expect(rawRgb[pixelOffset]).toBe(rgb[0]);
      expect(rawRgb[pixelOffset + 1]).toBe(rgb[1]);
      expect(rawRgb[pixelOffset + 2]).toBe(rgb[2]);

      // Verify normalized tensor values within float32 tolerance (1e-5)
      expect(tensor[pixelOffset]).toBeCloseTo(normalized[0], 5);
      expect(tensor[pixelOffset + 1]).toBeCloseTo(normalized[1], 5);
      expect(tensor[pixelOffset + 2]).toBeCloseTo(normalized[2], 5);
    });
  });

  it('throws on mismatched RGB buffer size', () => {
    const invalidBuffer = new Uint8Array(100);
    expect(() => normalizeRgbTensor(invalidBuffer, 224, 224)).toThrow(/buffer size mismatch/i);
  });
});
