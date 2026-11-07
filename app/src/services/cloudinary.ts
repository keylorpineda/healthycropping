import * as ImageManipulator from 'expo-image-manipulator';

import { type ApiClient, ApiError, apiClient } from './api';

/**
 * Direct device-to-Cloudinary upload of scan photos.
 *
 * The API signs the upload (`POST /uploads/scan-signature`), so the Cloudinary
 * secret never reaches the app. The photo is resized on the device so its longer
 * side is at most `MAX_UPLOAD_DIMENSION` before it leaves the phone; the signed
 * `c_limit` transformation enforces the same limit on Cloudinary's side.
 */

export const MAX_UPLOAD_DIMENSION = 1280;
const JPEG_QUALITY = 0.8;

/** Mirrors `ScanSignatureResponse` in `api/src/healthycropping_api/schemas.py`. */
export interface ScanSignature {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  public_id: string;
  transformation: string;
  upload_url: string;
}

/** Every field of `ScanSignature`; the record type makes the compiler flag a missing key. */
const SIGNATURE_FIELD_MAP: Record<keyof ScanSignature, true> = {
  cloud_name: true,
  api_key: true,
  timestamp: true,
  signature: true,
  folder: true,
  public_id: true,
  transformation: true,
  upload_url: true,
};
export const SCAN_SIGNATURE_FIELDS = Object.keys(SIGNATURE_FIELD_MAP) as (keyof ScanSignature)[];

export type UploadErrorCode = 'network' | 'unavailable' | 'rejected';

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'UploadError';
    this.code = code;
  }
}

export interface UploadDeps {
  api?: ApiClient;
  fetchImpl?: typeof fetch;
}

/** Return the target size so the longer side is at most `max`, or null if it already fits. */
export function limitDimensions(
  width: number,
  height: number,
  max = MAX_UPLOAD_DIMENSION,
): { width: number; height: number } | null {
  const longer = Math.max(width, height);
  if (longer <= max) {
    return null;
  }
  const scale = max / longer;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Re-encode the photo as JPEG with its longer side capped at 1280 px. */
export async function prepareUploadPhoto(localUri: string): Promise<string> {
  const original = await ImageManipulator.manipulateAsync(localUri, []);
  const target = limitDimensions(original.width, original.height);
  const result = await ImageManipulator.manipulateAsync(
    localUri,
    target ? [{ resize: target }] : [],
    { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

/** `POST /uploads/scan-signature` body; mirrors `ScanSignatureRequest`. */
export function toSignatureRequest(scanId: string): { scan_id: string } {
  return { scan_id: scanId };
}

async function requestSignature(api: ApiClient, scanId: string): Promise<ScanSignature> {
  try {
    return await api.request<ScanSignature>('/uploads/scan-signature', {
      method: 'POST',
      body: toSignatureRequest(scanId),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      throw new UploadError('network', error.code);
    }
    if (error instanceof ApiError && error.status === 503) {
      throw new UploadError('unavailable', error.code);
    }
    throw new UploadError('rejected', error instanceof Error ? error.message : undefined);
  }
}

/**
 * Upload a scan photo and return the Cloudinary `public_id`
 * (`users/{uid}/scans/{scanId}`), which the sync engine sends to the API.
 */
export async function uploadScanPhoto(
  scanId: string,
  localUri: string,
  { api = apiClient, fetchImpl = fetch }: UploadDeps = {},
): Promise<string> {
  const signature = await requestSignature(api, scanId);
  const fileUri = await prepareUploadPhoto(localUri);

  const form = new FormData();
  // React Native's FormData accepts `{ uri, name, type }` file parts.
  form.append('file', { uri: fileUri, name: `${scanId}.jpg`, type: 'image/jpeg' } as never);
  form.append('api_key', signature.api_key);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.public_id);
  form.append('transformation', signature.transformation);

  let response: Response;
  try {
    response = await fetchImpl(signature.upload_url, { method: 'POST', body: form });
  } catch {
    throw new UploadError('network');
  }
  if (!response.ok) {
    throw new UploadError('rejected', `cloudinary_${response.status}`);
  }
  const payload = (await response.json()) as { public_id?: unknown };
  if (typeof payload.public_id !== 'string' || payload.public_id.length === 0) {
    throw new UploadError('rejected', 'missing_public_id');
  }
  return payload.public_id;
}
