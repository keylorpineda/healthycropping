import { type SupportedCrop } from '@/version';

export interface ModelInputConfig {
  width: number;
  height: number;
  channels: number;
  color_order: 'RGB' | 'BGR';
  dtype: 'float32';
  layout: 'NHWC';
}

export interface ModelNormalizationConfig {
  mean: [number, number, number];
  std: [number, number, number];
}

export interface ModelRegistry {
  schema_version: number;
  crop: string;
  version: string;
  model_file: string;
  model_sha256: string;
  model_size_bytes: number;
  quantization: string;
  labels: string[];
  input: ModelInputConfig;
  normalization: ModelNormalizationConfig;
  confidence_threshold: number;
  metrics?: Record<string, unknown>;
}

export type DiagnosisSeverity = 'healthy' | 'watch' | 'actNow';

export interface InferencePrediction {
  crop: SupportedCrop;
  predictedClass: string;
  confidence: number;
  threshold: number;
  isLowConfidence: boolean;
  severity: DiagnosisSeverity;
  probabilities: Record<string, number>;
  rawProbabilities: number[];
  inferenceTimeMs: number;
}
