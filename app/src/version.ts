export const APP_PACKAGE_ID = 'com.keylorpineda.healthycrop';
export const APP_VERSION = '0.2.0';
export const DEFAULT_LOCALE = 'es';
export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export const SUPPORTED_CROPS = ['coffee', 'cacao', 'banana'] as const;
export type SupportedCrop = (typeof SUPPORTED_CROPS)[number];
