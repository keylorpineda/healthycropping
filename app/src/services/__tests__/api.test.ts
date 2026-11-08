import { ApiError, createApiClient, type TokenProvider } from '../api';

jest.mock('../auth', () => ({ getIdToken: jest.fn().mockResolvedValue(null) }));

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function setup(token: string | null, ...responses: Response[]) {
  const fetchImpl = jest.fn();
  for (const response of responses) {
    fetchImpl.mockResolvedValueOnce(response);
  }
  const getToken = jest.fn<ReturnType<TokenProvider>, Parameters<TokenProvider>>(() =>
    Promise.resolve(token),
  );
  const client = createApiClient({
    baseUrl: 'http://api.test/',
    getToken,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { client, fetchImpl, getToken };
}

function initOf(fetchImpl: jest.Mock, call = 0): RequestInit {
  const args = fetchImpl.mock.calls[call] as [string, RequestInit] | undefined;
  if (!args) {
    throw new Error(`fetch was not called ${call + 1} time(s)`);
  }
  return args[1];
}

function headersOf(fetchImpl: jest.Mock, call = 0): Record<string, string> {
  return initOf(fetchImpl, call).headers as Record<string, string>;
}

describe('api client', () => {
  it('attaches the bearer token when signed in', async () => {
    const { client, fetchImpl } = setup('id-token', jsonResponse(200, { uid: 'u1' }));

    await expect(client.request('/me')).resolves.toEqual({ uid: 'u1' });
    expect(fetchImpl).toHaveBeenCalledWith('http://api.test/me', expect.anything());
    expect(headersOf(fetchImpl).Authorization).toBe('Bearer id-token');
  });

  it('sends no Authorization header when signed out', async () => {
    const { client, fetchImpl } = setup(null, jsonResponse(200, { status: 'ok' }));

    await client.request('health');
    expect(fetchImpl).toHaveBeenCalledWith('http://api.test/health', expect.anything());
    expect(headersOf(fetchImpl).Authorization).toBeUndefined();
  });

  it('serializes JSON bodies', async () => {
    const { client, fetchImpl } = setup('id-token', jsonResponse(201, { id: 'f1' }));

    await client.request('/farms', { method: 'POST', body: { name: 'Finca' } });
    const init = initOf(fetchImpl);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"name":"Finca"}');
    expect(headersOf(fetchImpl)['Content-Type']).toBe('application/json');
  });

  it('retries once with a refreshed token after a 401', async () => {
    const { client, fetchImpl, getToken } = setup(
      'stale',
      jsonResponse(401, { error: { code: 'invalid_token', message: 'expired' } }),
      jsonResponse(200, { uid: 'u1' }),
    );
    getToken.mockResolvedValueOnce('stale').mockResolvedValueOnce('fresh');

    await expect(client.request('/me')).resolves.toEqual({ uid: 'u1' });
    expect(getToken).toHaveBeenLastCalledWith(true);
    expect(headersOf(fetchImpl, 1).Authorization).toBe('Bearer fresh');
  });

  it('maps the API error envelope to ApiError', async () => {
    const { client } = setup(
      'id-token',
      jsonResponse(404, { error: { code: 'not_found', message: 'Farm not found' } }),
    );

    await expect(client.request('/farms/x')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Farm not found',
    });
  });

  it('returns undefined for 204 responses', async () => {
    const { client } = setup('id-token', jsonResponse(204));
    await expect(client.request('/farms/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('reports transport failures as network errors', async () => {
    const { client, fetchImpl } = setup('id-token');
    fetchImpl.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(client.request('/me')).rejects.toEqual(new ApiError(0, 'network'));
  });

  it('refuses requests when no API URL is configured', async () => {
    const fetchImpl = jest.fn();
    const client = createApiClient({
      baseUrl: undefined,
      getToken: () => Promise.resolve('id-token'),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(client.isConfigured).toBe(false);
    await expect(client.request('/me')).rejects.toMatchObject({ code: 'not-configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
