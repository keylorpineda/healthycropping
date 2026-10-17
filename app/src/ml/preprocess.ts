import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import { type ModelNormalizationConfig } from './types';

/**
 * Converts a base64-encoded string into a Uint8Array byte buffer.
 * Compatible with Node.js, Jest, and React Native runtimes.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  // Standard web/RN fallback
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Normalizes 3-channel RGB Uint8Array bytes into float32 range [-1.0, 1.0].
 * Formula: normalized = (rgb - mean) / std
 * Layout: NHWC [1, height, width, 3], without batch dimension in raw buffer.
 */
export function normalizeRgbTensor(
  rgbBytes: Uint8Array,
  width = 224,
  height = 224,
  normalization: ModelNormalizationConfig = {
    mean: [127.5, 127.5, 127.5],
    std: [127.5, 127.5, 127.5],
  },
): Float32Array {
  const expectedLength = width * height * 3;
  if (rgbBytes.length !== expectedLength) {
    throw new Error(
      `RGB buffer size mismatch: expected ${expectedLength} bytes for ${width}x${height}x3, got ${rgbBytes.length}`,
    );
  }

  const { mean, std } = normalization;
  const tensor = new Float32Array(expectedLength);

  for (let i = 0; i < expectedLength; i += 3) {
    const r = rgbBytes[i] ?? 0;
    const g = rgbBytes[i + 1] ?? 0;
    const b = rgbBytes[i + 2] ?? 0;
    tensor[i] = (r - mean[0]) / std[0]; // Red
    tensor[i + 1] = (g - mean[1]) / std[1]; // Green
    tensor[i + 2] = (b - mean[2]) / std[2]; // Blue
  }

  return tensor;
}

/**
 * Decodes compressed JPEG bytes into raw RGB Uint8Array.
 */
export function decodeJpegToRgb(jpegBytes: Uint8Array | ArrayBuffer): {
  width: number;
  height: number;
  rgb: Uint8Array;
} {
  const decoded = jpeg.decode(jpegBytes, {
    useTArray: true,
    formatAsRGBA: false,
  });

  return {
    width: decoded.width,
    height: decoded.height,
    rgb: decoded.data as Uint8Array,
  };
}

/**
 * High-level pipeline taking a photo file URI, resizing to target 224x224,
 * decoding JPEG bytes, and returning the exact normalized Float32Array tensor.
 */
export async function preprocessImageUri(
  imageUri: string,
  targetWidth = 224,
  targetHeight = 224,
  normalization: ModelNormalizationConfig = {
    mean: [127.5, 127.5, 127.5],
    std: [127.5, 127.5, 127.5],
  },
): Promise<Float32Array> {
  const manipulated = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: targetWidth, height: targetHeight } }],
    {
      format: ImageManipulator.SaveFormat.JPEG,
      compress: 0.95,
      base64: true,
    },
  );

  if (!manipulated.base64) {
    throw new Error('ImageManipulator did not return base64 payload');
  }

  const jpegBytes = base64ToUint8Array(manipulated.base64);
  const { rgb } = decodeJpegToRgb(jpegBytes);

  return normalizeRgbTensor(rgb, targetWidth, targetHeight, normalization);
}
