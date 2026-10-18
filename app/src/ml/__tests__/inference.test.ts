import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import { loadTensorflowModel } from 'react-native-fast-tflite';

import mlCacaoRegistry from '../../../../ml/models/cacao/registry.json';
import mlCoffeeRegistry from '../../../../ml/models/coffee/registry.json';
import {
  AVAILABLE_CROPS,
  CACAO_REGISTRY,
  COFFEE_REGISTRY,
  decodeJpegToRgb,
  evaluatePrediction,
  getCropRegistry,
  getModelResourceName,
  getModelSource,
  getModelVersion,
  getSeverityForClass,
  isCropAvailable,
  runInference,
  softmax,
  type TfliteRunner,
} from '../index';

// Mock expo-image-manipulator
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
  },
}));

describe('Inference & Prediction Pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('softmax', () => {
    it('normalizes arbitrary logits into probabilities summing to 1.0', () => {
      const logits = new Float32Array([1.5, 3.2, 0.8, -1.0, 2.1, 0.0]);
      const probs = softmax(logits);

      expect(probs.length).toBe(6);
      const sum = probs.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);

      // Highest logit (index 1, 3.2) must produce highest probability
      expect(probs[1]).toBe(Math.max(...probs));
    });

    it('handles extreme values without NaN overflow', () => {
      const extremeLogits = [1000, 1001, 999];
      const probs = softmax(extremeLogits);

      expect(probs.some((p) => isNaN(p))).toBe(false);
      const sum = probs.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('getCropRegistry', () => {
    it('retrieves coffee registry with 6 classes and 0.79 threshold', () => {
      const reg = getCropRegistry('coffee');
      expect(reg.crop).toBe('coffee');
      expect(reg.confidence_threshold).toBe(0.79);
      expect(reg.labels).toEqual([
        'healthy',
        'leaf_rust',
        'leaf_miner',
        'cercospora',
        'brown_leaf_spot',
        'red_spider_mite',
      ]);
    });

    it('retrieves the cacao registry with its own model file and 3 classes', () => {
      const reg = getCropRegistry('cacao');
      expect(reg.crop).toBe('cacao');
      expect(reg.model_file).toBe('cacao_v0.1.0_fp16.tflite');
      expect(reg.model_file).not.toBe(COFFEE_REGISTRY.model_file);
      expect(reg.labels).toEqual(['healthy', 'monilia', 'black_pod']);
      expect(reg.confidence_threshold).toBe(0.51);
    });

    it('keeps app registries identical to the ml/ exported registries', () => {
      expect(COFFEE_REGISTRY).toEqual(mlCoffeeRegistry);
      expect(CACAO_REGISTRY).toEqual(mlCacaoRegistry);
    });

    it('marks banana as unavailable until its model is exported', () => {
      expect(isCropAvailable('coffee')).toBe(true);
      expect(isCropAvailable('cacao')).toBe(true);
      expect(isCropAvailable('banana')).toBe(false);
      expect(AVAILABLE_CROPS).toEqual(['coffee', 'cacao']);
      expect(() => getCropRegistry('banana')).toThrow(/No model registry found/);
    });

    it('derives the persisted model version from the crop registry', () => {
      expect(getModelVersion('coffee')).toBe('v0.1.0-coffee-float16');
      expect(getModelVersion('cacao')).toBe('v0.1.0-cacao-float16');
    });

    it('resolves bundled models by Android raw resource name', () => {
      expect(getModelResourceName(COFFEE_REGISTRY)).toBe('coffee_v0_1_0_fp16');
      expect(getModelResourceName(CACAO_REGISTRY)).toBe('cacao_v0_1_0_fp16');
      expect(getModelSource(CACAO_REGISTRY)).toEqual({ url: 'cacao_v0_1_0_fp16' });
    });

    it('throws error on unsupported crop', () => {
      // @ts-expect-error Testing invalid crop
      expect(() => getCropRegistry('mango')).toThrow(/No model registry found/);
    });
  });

  describe('getSeverityForClass', () => {
    it('maps coffee diseases to appropriate severity levels', () => {
      expect(getSeverityForClass('coffee', 'healthy')).toBe('healthy');
      expect(getSeverityForClass('coffee', 'leaf_rust')).toBe('actNow');
      expect(getSeverityForClass('coffee', 'cercospora')).toBe('actNow');
      expect(getSeverityForClass('coffee', 'brown_leaf_spot')).toBe('actNow');
      expect(getSeverityForClass('coffee', 'leaf_miner')).toBe('watch');
      expect(getSeverityForClass('coffee', 'red_spider_mite')).toBe('watch');
    });

    it('falls back to watch when isLowConfidence is true', () => {
      expect(getSeverityForClass('coffee', 'leaf_rust', true)).toBe('watch');
      expect(getSeverityForClass('coffee', 'healthy', true)).toBe('watch');
    });
  });

  describe('evaluatePrediction', () => {
    it('evaluates high-confidence accepted prediction above 0.79', () => {
      // Coffee classes: healthy, leaf_rust, leaf_miner, cercospora, brown_leaf_spot, red_spider_mite
      // Index 1 (leaf_rust) has 0.88 probability
      const rawProbs = [0.02, 0.88, 0.03, 0.03, 0.02, 0.02];
      const result = evaluatePrediction('coffee', rawProbs, 42);

      expect(result.crop).toBe('coffee');
      expect(result.predictedClass).toBe('leaf_rust');
      expect(result.confidence).toBe(0.88);
      expect(result.threshold).toBe(0.79);
      expect(result.isLowConfidence).toBe(false);
      expect(result.severity).toBe('actNow');
      expect(result.inferenceTimeMs).toBe(42);
      expect(result.probabilities['leaf_rust']).toBe(0.88);
    });

    it('flags low-confidence prediction below threshold', () => {
      // Top class has 0.65 (below 0.79 calibrated threshold)
      const rawProbs = [0.15, 0.65, 0.05, 0.05, 0.05, 0.05];
      const result = evaluatePrediction('coffee', rawProbs, 35);

      expect(result.predictedClass).toBe('leaf_rust');
      expect(result.confidence).toBe(0.65);
      expect(result.threshold).toBe(0.79);
      expect(result.isLowConfidence).toBe(true);
      expect(result.severity).toBe('watch');
    });

    it('applies softmax automatically if raw logits are passed', () => {
      // High logit for index 0 (healthy)
      const logits = [5.0, 1.0, 0.5, 0.2, -1.0, 0.0];
      const result = evaluatePrediction('coffee', logits, 28);

      expect(result.predictedClass).toBe('healthy');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.isLowConfidence).toBe(false);
      expect(result.severity).toBe('healthy');
    });

    it('throws error on mismatched output tensor dimensions', () => {
      const invalidOutputs = [0.5, 0.5]; // only 2 classes instead of 6
      expect(() => evaluatePrediction('coffee', invalidOutputs)).toThrow(
        /output dimension mismatch/i,
      );
    });
  });

  describe('decodeJpegToRgb', () => {
    it('decodes JPEG bytes to raw RGB Uint8Array', () => {
      // Encode a tiny 2x2 test JPEG image
      const rawData = new Uint8Array(2 * 2 * 4); // 4 bytes per pixel for encode input
      const encoded = jpeg.encode({ width: 2, height: 2, data: rawData }, 60);

      const decoded = decodeJpegToRgb(encoded.data);
      expect(decoded.width).toBe(2);
      expect(decoded.height).toBe(2);
      expect(decoded.rgb.length).toBe(2 * 2 * 3); // 3 channels
    });
  });

  describe('runInference with runner', () => {
    it('runs full pipeline through runner mock and returns structured prediction', async () => {
      // Create a mock JPEG base64 payload
      const mockRaw = new Uint8Array(224 * 224 * 4);
      const encoded = jpeg.encode({ width: 224, height: 224, data: mockRaw }, 50);
      const base64Jpeg = Buffer.from(encoded.data).toString('base64');

      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        base64: base64Jpeg,
      });

      const runnerMock: TfliteRunner = {
        run: jest.fn().mockResolvedValue([0.05, 0.92, 0.01, 0.01, 0.005, 0.005]),
      };

      const result = await runInference('file:///test/coffee_leaf.jpg', 'coffee', runnerMock);

      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file:///test/coffee_leaf.jpg',
        [{ resize: { width: 224, height: 224 } }],
        expect.objectContaining({ format: 'jpeg', base64: true }),
      );
      expect(runnerMock.run).toHaveBeenCalledTimes(1);
      expect(result.predictedClass).toBe('leaf_rust');
      expect(result.confidence).toBe(0.92);
      expect(result.isLowConfidence).toBe(false);
    });
  });

  describe('runInference with bundled model', () => {
    it('loads the cacao model resource and maps its 3 outputs to cacao labels', async () => {
      const mockRaw = new Uint8Array(224 * 224 * 4);
      const encoded = jpeg.encode({ width: 224, height: 224, data: mockRaw }, 50);
      (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValueOnce({
        base64: Buffer.from(encoded.data).toString('base64'),
      });
      (loadTensorflowModel as jest.Mock).mockResolvedValueOnce({
        run: jest.fn().mockResolvedValue([new Float32Array([0.05, 0.9, 0.05])]),
      });

      const result = await runInference('file:///test/cacao_pod.jpg', 'cacao');

      expect(loadTensorflowModel).toHaveBeenCalledWith({ url: 'cacao_v0_1_0_fp16' });
      expect(result.crop).toBe('cacao');
      expect(result.predictedClass).toBe('monilia');
      expect(result.isLowConfidence).toBe(false);
    });
  });
});
