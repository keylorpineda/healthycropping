import { type SupportedCrop } from '@/version';
import coffeeRegistryJson from './models/coffee/registry.json';
import { type DiagnosisSeverity, type ModelRegistry } from './types';

export const COFFEE_REGISTRY: ModelRegistry = coffeeRegistryJson as unknown as ModelRegistry;

export const MODEL_REGISTRIES: Record<SupportedCrop, ModelRegistry> = {
  coffee: COFFEE_REGISTRY,
  // Cacao and Banana will be populated with their models in Phase 5
  cacao: {
    ...COFFEE_REGISTRY,
    crop: 'cacao',
    labels: ['healthy', 'monilia', 'black_pod'],
  },
  banana: {
    ...COFFEE_REGISTRY,
    crop: 'banana',
    labels: ['healthy', 'black_sigatoka', 'fusarium_wilt'],
  },
};

export function getCropRegistry(crop: SupportedCrop): ModelRegistry {
  const registry = MODEL_REGISTRIES[crop];
  if (!registry) {
    throw new Error(`No model registry found for crop: ${crop}`);
  }
  return registry;
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
