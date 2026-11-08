import * as FileSystem from 'expo-file-system';

import { persistScanPhoto } from '../photoStorage';

describe('persistScanPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('copies a cached camera photo into the document scans directory', async () => {
    const uri = await persistScanPhoto('file:///data/cache/Camera/photo-123.jpg');

    expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///mock/documents/scans/', {
      intermediates: true,
    });
    expect(uri).toMatch(/^file:\/\/\/mock\/documents\/scans\/[0-9a-f-]{36}\.jpg$/);
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///data/cache/Camera/photo-123.jpg',
      to: uri,
    });
  });

  it('keeps supported extensions and falls back to jpg for unknown ones', async () => {
    await expect(persistScanPhoto('file:///cache/picked.PNG')).resolves.toMatch(/\.png$/);
    await expect(persistScanPhoto('content://media/external/images/42')).resolves.toMatch(/\.jpg$/);
  });

  it('propagates copy failures so the caller can fall back', async () => {
    (FileSystem.copyAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(persistScanPhoto('file:///cache/photo.jpg')).rejects.toThrow('disk full');
  });
});
