import { loadTensorflowModel } from 'react-native-fast-tflite';

import { type SupportedCrop } from '@/version';
import { preprocessImageUri } from './preprocess';
import { getCropRegistry, getSeverityForClass } from './registry';
import { type InferencePrediction } from './types';

export interface TfliteRunner {
  run: (inputTensor: Float32Array) => Promise<Float32Array | number[]>;
}

/**
 * Numerically stable softmax implementation for raw model logits.
 */
export function softmax(values: Float32Array | number[]): number[] {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val !== undefined && val > max) {
      max = val;
    }
  }

  let sum = 0;
  const exp = new Array<number>(values.length);
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const expVal = val !== undefined ? Math.exp(val - max) : 0;
    exp[i] = expVal;
    sum += expVal;
  }

  for (let i = 0; i < values.length; i++) {
    const expVal = exp[i] ?? 0;
    exp[i] = sum > 0 ? expVal / sum : 0;
  }

  return exp;
}

/**
 * Parses model output tensor, checks calibrated confidence threshold,
 * and formats the final InferencePrediction.
 */
export function evaluatePrediction(
  crop: SupportedCrop,
  rawOutputs: Float32Array | number[],
  inferenceTimeMs = 0,
): InferencePrediction {
  const registry = getCropRegistry(crop);
  const labels = registry.labels;

  if (rawOutputs.length !== labels.length) {
    throw new Error(
      `Model output dimension mismatch: expected ${labels.length} classes, got ${rawOutputs.length}`,
    );
  }

  // Determine if output is already probabilities or raw logits
  let sum = 0;
  let allNonNegative = true;
  for (let i = 0; i < rawOutputs.length; i++) {
    const out = rawOutputs[i] ?? 0;
    sum += out;
    if (out < 0) allNonNegative = false;
  }

  const isProbabilities = allNonNegative && Math.abs(sum - 1.0) < 0.05;
  const probabilities = isProbabilities ? Array.from(rawOutputs) : softmax(rawOutputs);

  // Identify top-1 prediction
  let maxIndex = 0;
  let maxConfidence = -1;
  const probabilityMap: Record<string, number> = {};

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const prob = probabilities[i] ?? 0;
    if (label) {
      probabilityMap[label] = Math.round(prob * 10000) / 10000;
    }
    if (prob > maxConfidence) {
      maxConfidence = prob;
      maxIndex = i;
    }
  }

  const predictedClass = labels[maxIndex] ?? 'healthy';
  const threshold = registry.confidence_threshold;
  const isLowConfidence = maxConfidence < threshold;
  const severity = getSeverityForClass(crop, predictedClass, isLowConfidence);

  return {
    crop,
    predictedClass,
    confidence: Math.round(maxConfidence * 10000) / 10000,
    threshold,
    isLowConfidence,
    severity,
    probabilities: probabilityMap,
    rawProbabilities: probabilities,
    inferenceTimeMs: Math.round(inferenceTimeMs),
  };
}

/**
 * Runs the complete on-device inference pipeline from image URI to structured prediction.
 */
export async function runInference(
  imageUri: string,
  crop: SupportedCrop,
  runner?: TfliteRunner,
): Promise<InferencePrediction> {
  const registry = getCropRegistry(crop);
  const startTime = Date.now();

  // 1. Preprocess image
  const inputTensor = await preprocessImageUri(
    imageUri,
    registry.input.width,
    registry.input.height,
    registry.normalization,
  );

  let rawOutput: Float32Array | number[];

  if (runner) {
    rawOutput = await runner.run(inputTensor);
  } else {
    const model = await loadTensorflowModel({
      url: `file:///android_asset/models/${registry.model_file}`,
    });

    const results = await model.run([inputTensor]);
    const firstOutput = results[0];
    if (!firstOutput) {
      throw new Error('TFLite model did not return any output tensors');
    }
    rawOutput = firstOutput as Float32Array;
  }

  const elapsedMs = Date.now() - startTime;
  return evaluatePrediction(crop, rawOutput, elapsedMs);
}
