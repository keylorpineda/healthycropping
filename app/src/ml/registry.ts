import { SUPPORTED_CROPS, type SupportedCrop } from '@/version';
import bananaRegistryJson from './models/banana/registry.json';
import cacaoRegistryJson from './models/cacao/registry.json';
import coffeeRegistryJson from './models/coffee/registry.json';
import { type DiagnosisSeverity, type ModelRegistry } from './types';

export const COFFEE_REGISTRY: ModelRegistry = coffeeRegistryJson as unknown as ModelRegistry;
export const CACAO_REGISTRY: ModelRegistry = cacaoRegistryJson as unknown as ModelRegistry;
export const BANANA_REGISTRY: ModelRegistry = bananaRegistryJson as unknown as ModelRegistry;

/**
 * Registries of crops with an exported model. A crop without an entry is shown as
 * "coming soon" and cannot be selected in the app.
 */
export const MODEL_REGISTRIES: Partial<Record<SupportedCrop, ModelRegistry>> = {
  coffee: COFFEE_REGISTRY,
  cacao: CACAO_REGISTRY,
  banana: BANANA_REGISTRY,
};

export function isCropAvailable(crop: SupportedCrop): boolean {
  return MODEL_REGISTRIES[crop] !== undefined;
}

export const AVAILABLE_CROPS: readonly SupportedCrop[] = SUPPORTED_CROPS.filter(isCropAvailable);

export function getCropRegistry(crop: SupportedCrop): ModelRegistry {
  const registry = MODEL_REGISTRIES[crop];
  if (!registry) {
    throw new Error(`No model registry found for crop: ${crop}`);
  }
  return registry;
}

/**
 * Android raw resource name of the bundled model. Must match `toAndroidRawResourceName`
 * in `app/plugins/withTfliteModels.js`, which copies the model into `res/raw/` at prebuild.
 */
export function getModelResourceName(registry: ModelRegistry): string {
  const base = registry.model_file.replace(/\.tflite$/i, '');
  return base.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/** Model version persisted with each scan, e.g. `v0.1.0-cacao-float16`. */
export function getModelVersion(crop: SupportedCrop): string {
  const registry = getCropRegistry(crop);
  return `v${registry.version}-${registry.crop}-${registry.quantization}`;
}

export function getSeverityForClass(
  crop: SupportedCrop,
  predictedClass: string,
  isLowConfidence = false,
): DiagnosisSeverity {
  if (isLowConfidence) {
    return 'watch';
  }

  if (predictedClass === 'healthy') {
    return 'healthy';
  }

  switch (crop) {
    case 'coffee':
      if (
        predictedClass === 'leaf_rust' ||
        predictedClass === 'cercospora' ||
        predictedClass === 'brown_leaf_spot'
      ) {
        return 'actNow';
      }
      return 'watch'; // leaf_miner, red_spider_mite

    case 'cacao':
      if (predictedClass === 'black_pod') {
        return 'actNow';
      }
      return 'watch'; // monilia (early stages)

    case 'banana':
      if (predictedClass === 'black_sigatoka' || predictedClass === 'fusarium_wilt') {
        return 'actNow';
      }
      return 'watch';

    default:
      return 'watch';
  }
}
