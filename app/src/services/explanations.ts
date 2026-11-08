import { QueryClient, useQuery, type UseQueryResult } from '@tanstack/react-query';

import {
  explanationId,
  explanationsRepository,
  type DiagnosisSeverity,
  type ExplanationKey,
  type ExplanationsRepository,
} from '@/db';
import { useAuthStore } from '@/stores/auth';

import { apiClient, ApiError, type ApiClient } from './api';

/**
 * AI explanations of an on-device diagnosis (`POST /explanations`).
 *
 * The request carries only `(crop, disease_class, severity, language)`. Answers are
 * kept in SQLite under that key and read from there first, so a farmer can re-read
 * them in the field without signal and repeated diagnoses do not spend the API's
 * hourly quota. Refusals that a later request may answer (`not_covered`) are not kept.
 */

export interface ExplanationCitation {
  source_title: string;
  publisher: string;
  year: number;
  section: string;
  first_page: number;
  last_page: number;
  url: string;
}

export type ExplanationDeclineReason = 'healthy' | 'no_sources' | 'not_covered';

export interface Explanation {
  crop: string;
  disease_class: string;
  severity: DiagnosisSeverity;
  language: 'es' | 'en';
  covered: boolean;
  summary: string | null;
  next_steps: string[];
  citations: ExplanationCitation[];
  declined_reason: ExplanationDeclineReason | null;
}

export interface ExplanationResult {
  explanation: Explanation;
  source: 'network' | 'cache';
  fetchedAt: string;
}

export type ExplanationFailure =
  'notConfigured' | 'signedOut' | 'offline' | 'rateLimited' | 'unavailable';

export class ExplanationError extends Error {
  readonly reason: ExplanationFailure;

  constructor(reason: ExplanationFailure) {
    super(reason);
    this.name = 'ExplanationError';
    this.reason = reason;
  }
}

export interface DiagnosisForExplanation {
  crop: string;
  predictedClass: string;
  severity: DiagnosisSeverity;
  isLowConfidence: boolean;
}

/** Key to explain, or null when there is nothing to explain (healthy or uncertain). */
export function explanationKeyFor(
  diagnosis: DiagnosisForExplanation,
  language: 'es' | 'en',
): ExplanationKey | null {
  if (diagnosis.isLowConfidence || diagnosis.severity === 'healthy') {
    return null;
  }
  return {
    crop: diagnosis.crop,
    disease_class: diagnosis.predictedClass,
    severity: diagnosis.severity,
    language,
  };
}

const DECLINE_REASONS: readonly string[] = ['healthy', 'no_sources', 'not_covered'];

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function parseCitation(value: unknown): ExplanationCitation | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const c = value as Record<string, unknown>;
  if (
    !isString(c.source_title) ||
    !isString(c.publisher) ||
    typeof c.year !== 'number' ||
    !isString(c.section) ||
    typeof c.first_page !== 'number' ||
    typeof c.last_page !== 'number' ||
    !isString(c.url)
  ) {
    return null;
  }
  return {
    source_title: c.source_title,
    publisher: c.publisher,
    year: c.year,
    section: c.section,
    first_page: c.first_page,
    last_page: c.last_page,
    url: c.url,
  };
}

/** Validates an API or SQLite payload; returns null for anything malformed. */
export function parseExplanation(value: unknown, key: ExplanationKey): Explanation | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const e = value as Record<string, unknown>;
  if (typeof e.covered !== 'boolean' || !Array.isArray(e.next_steps)) {
    return null;
  }
  if (!Array.isArray(e.citations)) {
    return null;
  }
  const citations = e.citations.map(parseCitation);
  if (citations.some((citation) => citation === null)) {
    return null;
  }
  const reason = e.declined_reason;
  const declined =
    isString(reason) && DECLINE_REASONS.includes(reason)
      ? (reason as ExplanationDeclineReason)
      : null;
  const summary = isString(e.summary) && e.summary.trim() ? e.summary.trim() : null;
  if (e.covered && (summary === null || citations.length === 0)) {
    // The API never sends an uncited answer; treat one as malformed.
    return null;
  }
  return {
    crop: key.crop,
    disease_class: key.disease_class,
    severity: key.severity,
    language: key.language,
    covered: e.covered,
    summary: e.covered ? summary : null,
    next_steps: e.covered ? e.next_steps.filter(isString) : [],
    citations: citations as ExplanationCitation[],
    declined_reason: e.covered ? null : (declined ?? 'not_covered'),
  };
}

function shouldStore(explanation: Explanation): boolean {
  return explanation.declined_reason !== 'not_covered';
}

function toFailure(error: unknown): ExplanationFailure {
  if (error instanceof ApiError) {
    if (error.code === 'not-configured') return 'notConfigured';
    if (error.status === 0) return 'offline';
    if (error.status === 401) return 'signedOut';
    if (error.status === 429) return 'rateLimited';
  }
  return 'unavailable';
}

export interface LoadExplanationDeps {
  client?: ApiClient;
  repository?: ExplanationsRepository;
  isSignedIn?: () => boolean;
  now?: () => Date;
}

function readCached(
  repository: ExplanationsRepository,
  key: ExplanationKey,
): ExplanationResult | null {
  const stored = repository.get(key);
  if (!stored) {
    return null;
  }
  try {
    const explanation = parseExplanation(JSON.parse(stored.response_json), key);
    return explanation ? { explanation, source: 'cache', fetchedAt: stored.fetched_at } : null;
  } catch {
    return null;
  }
}

/** Cached answer if there is one, otherwise ask the API and keep the answer. */
export async function loadExplanation(
  key: ExplanationKey,
  {
    client = apiClient,
    repository = explanationsRepository,
    isSignedIn = () => useAuthStore.getState().status === 'signedIn',
    now = () => new Date(),
  }: LoadExplanationDeps = {},
): Promise<ExplanationResult> {
  const cached = readCached(repository, key);
  if (cached) {
    return cached;
  }
  if (!client.isConfigured) {
    throw new ExplanationError('notConfigured');
  }
  if (!isSignedIn()) {
    throw new ExplanationError('signedOut');
  }

  let payload: unknown;
  try {
    payload = await client.request<unknown>('/explanations', {
      method: 'POST',
      body: {
        crop: key.crop,
        disease_class: key.disease_class,
        severity: key.severity,
        language: key.language,
      },
    });
  } catch (error) {
    throw new ExplanationError(toFailure(error));
  }

  const explanation = parseExplanation(payload, key);
  if (!explanation) {
    throw new ExplanationError('unavailable');
  }
  const fetchedAt = now().toISOString();
  if (shouldStore(explanation)) {
    try {
      repository.save(key, JSON.stringify(explanation), fetchedAt);
    } catch (error) {
      // The answer is still shown; it just will not be available offline.
      console.error('Failed to store explanation', error);
    }
  }
  return { explanation, source: 'network', fetchedAt };
}

export const explanationsQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Answers do not change for a key; failures are retried by the user, not in a loop.
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

export interface UseExplanationOptions {
  queryClient?: QueryClient;
  load?: (key: ExplanationKey) => Promise<ExplanationResult>;
}

export function useExplanation(
  key: ExplanationKey | null,
  {
    queryClient = explanationsQueryClient,
    load = (k) => loadExplanation(k),
  }: UseExplanationOptions = {},
): UseQueryResult<ExplanationResult, ExplanationError> {
  // Signing in changes the key so a "sign in to see this" state refetches by itself.
  const signedIn = useAuthStore((state) => state.status === 'signedIn');
  return useQuery<ExplanationResult, ExplanationError>(
    {
      queryKey: ['explanation', key ? explanationId(key) : null, signedIn],
      queryFn: async () => {
        if (!key) {
          throw new ExplanationError('unavailable');
        }
        try {
          return await load(key);
        } catch (error) {
          throw error instanceof ExplanationError ? error : new ExplanationError('unavailable');
        }
      },
      enabled: key !== null,
    },
    queryClient,
  );
}
