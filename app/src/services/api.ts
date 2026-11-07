import { getIdToken } from './auth';

/**
 * HTTP client for the HealthyCropping FastAPI backend.
 *
 * When a user is signed in, every request carries `Authorization: Bearer <idToken>`.
 * When signed out, requests go out without the header; the app never calls the
 * API on offline-only flows (diagnosis, history, local farms), so those stay
 * unrestricted without an account.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  signal?: AbortSignal;
}

export type TokenProvider = (forceRefresh?: boolean) => Promise<string | null>;

export interface ApiClientOptions {
  baseUrl: string | null | undefined;
  getToken: TokenProvider;
  fetchImpl?: typeof fetch;
}

/** Error raised for non-2xx responses (`status` > 0) or transport failures (`status` 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiClient {
  readonly isConfigured: boolean;
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as ErrorEnvelope;
    const code = typeof payload.error?.code === 'string' ? payload.error.code : 'http_error';
    const message = typeof payload.error?.message === 'string' ? payload.error.message : undefined;
    return new ApiError(response.status, code, message);
  } catch {
    return new ApiError(response.status, 'http_error');
  }
}

export function createApiClient({
  baseUrl,
  getToken,
  fetchImpl = fetch,
}: ApiClientOptions): ApiClient {
  const root = baseUrl ? baseUrl.replace(/\/+$/, '') : null;

  async function send(
    path: string,
    options: RequestOptions,
    token: string | null,
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const init: RequestInit = { method: options.method ?? 'GET', headers };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }
    if (options.signal) {
      init.signal = options.signal;
    }
    try {
      return await fetchImpl(`${root}${path.startsWith('/') ? path : `/${path}`}`, init);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }
      throw new ApiError(0, 'network');
    }
  }

  return {
    isConfigured: root !== null,

    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      if (!root) {
        throw new ApiError(0, 'not-configured');
      }
      const token = await getToken();
      let response = await send(path, options, token);

      // An ID token can expire between the SDK refresh and the request; retry once.
      if (response.status === 401 && token) {
        const refreshed = await getToken(true);
        if (refreshed && refreshed !== token) {
          response = await send(path, options, refreshed);
        }
      }

      if (!response.ok) {
        throw await toApiError(response);
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    },
  };
}

/** Default client; `EXPO_PUBLIC_API_URL` must be read literally so Expo inlines it. */
export const apiClient: ApiClient = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  getToken: getIdToken,
});
