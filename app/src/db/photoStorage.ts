import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';

export const SCAN_PHOTOS_DIRECTORY = 'scans/';

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

function getPhotoExtension(uri: string): string {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(uri);
  const extension = match?.[1]?.toLowerCase();
  return extension && SUPPORTED_EXTENSIONS.includes(extension) ? extension : 'jpg';
}

/**
 * Copies a captured or picked photo out of the volatile camera/picker cache into the app's
 * document directory, so History and Scan Detail keep their photos after Android clears
 * the cache. Returns the persistent file URI.
 */
export async function persistScanPhoto(sourceUri: string): Promise<string> {
  const { documentDirectory } = FileSystem;
  if (!documentDirectory) {
    throw new Error('Document directory is not available on this platform');
  }

  const directory = `${documentDirectory}${SCAN_PHOTOS_DIRECTORY}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const destination = `${directory}${Crypto.randomUUID()}.${getPhotoExtension(sourceUri)}`;
  await FileSystem.copyAsync({ from: sourceUri, to: destination });
  return destination;
}
