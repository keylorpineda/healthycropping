import * as ImageManipulator from 'expo-image-manipulator';

import { ApiError, type ApiClient } from '../api';
import { limitDimensions, prepareUploadPhoto, uploadScanPhoto, UploadError } from '../cloudinary';

jest.mock('../auth', () => ({ getIdToken: jest.fn().mockResolvedValue(null) }));

const manipulate = ImageManipulator.manipulateAsync as jest.Mock;

const SIGNATURE = {
  cloud_name: 'demo',
  api_key: '1234',
  timestamp: 1_700_000_000,
  signature: 'abc',
  folder: 'users/u1/scans',
  public_id: 'scan-1',
  transformation: 'c_limit,w_1280,h_1280',
  upload_url: 'https://api.cloudinary.com/v1_1/demo/image/upload',
};

function fakeApi(request: jest.Mock): ApiClient {
  return { isConfigured: true, request: request as ApiClient['request'] };
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: () => Promise.resolve(body) } as Response;
}

describe('cloudinary uploader', () => {
  beforeEach(() => {
    manipulate.mockReset();
  });

  describe('limitDimensions', () => {
    it('keeps photos that already fit', () => {
      expect(limitDimensions(1280, 960)).toBeNull();
    });

    it('caps the longer side at 1280 px and keeps the aspect ratio', () => {
      expect(limitDimensions(3000, 4000)).toEqual({ width: 960, height: 1280 });
      expect(limitDimensions(4032, 3024)).toEqual({ width: 1280, height: 960 });
    });
  });

  it('resizes large photos before upload', async () => {
    manipulate
      .mockResolvedValueOnce({ uri: 'file:///orig.jpg', width: 4032, height: 3024 })
      .mockResolvedValueOnce({ uri: 'file:///small.jpg', width: 1280, height: 960 });

    await expect(prepareUploadPhoto('file:///orig.jpg')).resolves.toBe('file:///small.jpg');
    expect(manipulate).toHaveBeenLastCalledWith(
      'file:///orig.jpg',
      [{ resize: { width: 1280, height: 960 } }],
      { compress: 0.8, format: 'jpeg' },
    );
  });

  it('uploads with the signed parameters and returns the public id', async () => {
    manipulate.mockResolvedValue({ uri: 'file:///small.jpg', width: 800, height: 600 });
    const request = jest.fn().mockResolvedValue(SIGNATURE);
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(okResponse({ public_id: 'users/u1/scans/scan-1' }));

    const publicId = await uploadScanPhoto('scan-1', 'file:///photo.jpg', {
      api: fakeApi(request),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(publicId).toBe('users/u1/scans/scan-1');
    expect(request).toHaveBeenCalledWith('/uploads/scan-signature', {
      method: 'POST',
      body: { scan_id: 'scan-1' },
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SIGNATURE.upload_url);
    const form = init.body as FormData;
    expect(form.get('signature')).toBe('abc');
    expect(form.get('folder')).toBe('users/u1/scans');
    expect(form.get('transformation')).toBe('c_limit,w_1280,h_1280');
  });

  it.each([
    [new ApiError(0, 'network'), 'network'],
    [new ApiError(503, 'uploads_unavailable'), 'unavailable'],
    [new ApiError(401, 'invalid_token'), 'rejected'],
  ])('maps signature failure %p to %s', async (error, code) => {
    const request = jest.fn().mockRejectedValue(error);
    await expect(
      uploadScanPhoto('scan-1', 'file:///photo.jpg', { api: fakeApi(request) }),
    ).rejects.toMatchObject({ code });
  });

  it('reports a dropped connection during upload as a network error', async () => {
    manipulate.mockResolvedValue({ uri: 'file:///small.jpg', width: 800, height: 600 });
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      uploadScanPhoto('scan-1', 'file:///photo.jpg', {
        api: fakeApi(jest.fn().mockResolvedValue(SIGNATURE)),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toEqual(new UploadError('network'));
  });
});
