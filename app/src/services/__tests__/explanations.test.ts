import * as SQLite from 'expo-sqlite';

import { explanationsRepository, initDatabase, type ExplanationKey } from '@/db';
import { ApiError, type ApiClient } from '@/services/api';
import {
  ExplanationError,
  explanationKeyFor,
  loadExplanation,
  type Explanation,
  type ExplanationFailure,
} from '@/services/explanations';

interface MockSQLiteModule {
  __mockDb: SQLite.SQLiteDatabase & { reset: () => void };
}

const mockSQLite = SQLite as unknown as MockSQLiteModule;

const KEY: ExplanationKey = {
  crop: 'coffee',
  disease_class: 'leaf_rust',
  severity: 'actNow',
  language: 'es',
};

const COVERED_EXPLANATION: Explanation = {
  crop: KEY.crop,
  disease_class: KEY.disease_class,
  severity: KEY.severity,
  language: KEY.language,
  covered: true,
  summary: 'La roya avanza.',
  next_steps: ['Aplique fungicida.', 'Consulte a un agronomo.'],
  citations: [
    {
      source_title: 'Guia tecnica',
      publisher: 'ICAFE',
      year: 2020,
      section: 'Roya',
      first_page: 40,
      last_page: 42,
      url: 'https://example.org/icafe.pdf',
    },
  ],
  declined_reason: null,
};

function makeClient(
  requestImpl: jest.Mock = jest.fn(),
  isConfigured = true,
): { client: ApiClient; request: jest.Mock } {
  const client: ApiClient = {
    isConfigured,
    request: requestImpl as ApiClient['request'],
  };
  return { client, request: requestImpl };
}

async function expectFailure(promise: Promise<unknown>, reason: ExplanationFailure): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ExplanationError);
  expect((caught as ExplanationError).reason).toBe(reason);
}

describe('explanations service', () => {
  beforeEach(() => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
  });

  it('fetches an explanation online, sends only the 4 key fields, and caches it', async () => {
    const { client, request } = makeClient(jest.fn().mockResolvedValue(COVERED_EXPLANATION));

    const result = await loadExplanation(KEY, {
      client,
      isSignedIn: () => true,
      now: () => new Date('2026-01-15T10:00:00.000Z'),
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('/explanations', {
      method: 'POST',
      body: {
        crop: 'coffee',
        disease_class: 'leaf_rust',
        severity: 'actNow',
        language: 'es',
      },
    });
    const sentBody = (request.mock.calls[0] as [string, { body: Record<string, unknown> }])[1].body;
    expect(Object.keys(sentBody).sort()).toEqual(['crop', 'disease_class', 'language', 'severity']);
    expect(result.source).toBe('network');
    expect(result.explanation).toEqual(COVERED_EXPLANATION);
    expect(explanationsRepository.get(KEY)).not.toBeNull();
  });

  it('replays from SQLite cache without calling the API even when offline', async () => {
    const { client, request } = makeClient(jest.fn().mockResolvedValue(COVERED_EXPLANATION));
    await loadExplanation(KEY, { client, isSignedIn: () => true });

    request.mockRejectedValue(new ApiError(0, 'network'));
    const replay = await loadExplanation(KEY, { client, isSignedIn: () => true });

    expect(replay.source).toBe('cache');
    expect(replay.explanation).toEqual(COVERED_EXPLANATION);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('rejects with offline and stores nothing when offline with no cached copy', async () => {
    const { client } = makeClient(jest.fn().mockRejectedValue(new ApiError(0, 'network')));

    await expectFailure(loadExplanation(KEY, { client, isSignedIn: () => true }), 'offline');
    expect(explanationsRepository.get(KEY)).toBeNull();
  });

  it('maps API errors and preflight checks to ExplanationFailure reasons', async () => {
    const cases: Array<[ApiError, ExplanationFailure]> = [
      [new ApiError(429, 'rate_limited'), 'rateLimited'],
      [new ApiError(401, 'unauthorized'), 'signedOut'],
      [new ApiError(503, 'unavailable'), 'unavailable'],
      [new ApiError(0, 'not-configured'), 'notConfigured'],
    ];

    for (const [apiError, reason] of cases) {
      const { client } = makeClient(jest.fn().mockRejectedValue(apiError));
      await expectFailure(loadExplanation(KEY, { client, isSignedIn: () => true }), reason);
    }

    const unconfigured = makeClient(jest.fn(), false);
    await expectFailure(
      loadExplanation(KEY, { client: unconfigured.client, isSignedIn: () => true }),
      'notConfigured',
    );
    expect(unconfigured.request).not.toHaveBeenCalled();

    const signedOutClient = makeClient(jest.fn());
    await expectFailure(
      loadExplanation(KEY, { client: signedOutClient.client, isSignedIn: () => false }),
      'signedOut',
    );
    expect(signedOutClient.request).not.toHaveBeenCalled();
  });

  it('does not store not_covered responses, but stores no_sources responses', async () => {
    const notCovered: Explanation = {
      ...COVERED_EXPLANATION,
      covered: false,
      summary: null,
      next_steps: [],
      citations: [],
      declined_reason: 'not_covered',
    };
    const { client: client1 } = makeClient(jest.fn().mockResolvedValue(notCovered));
    const res1 = await loadExplanation(KEY, { client: client1, isSignedIn: () => true });
    expect(res1.explanation.declined_reason).toBe('not_covered');
    expect(explanationsRepository.get(KEY)).toBeNull();

    const noSources: Explanation = {
      ...notCovered,
      declined_reason: 'no_sources',
    };
    const { client: client2 } = makeClient(jest.fn().mockResolvedValue(noSources));
    const res2 = await loadExplanation(KEY, { client: client2, isSignedIn: () => true });
    expect(res2.explanation.declined_reason).toBe('no_sources');
    expect(explanationsRepository.get(KEY)).not.toBeNull();
  });

  it('rejects malformed payloads with unavailable', async () => {
    const uncited = { ...COVERED_EXPLANATION, citations: [] };
    const { client: client1 } = makeClient(jest.fn().mockResolvedValue(uncited));
    await expectFailure(
      loadExplanation(KEY, { client: client1, isSignedIn: () => true }),
      'unavailable',
    );

    const { client: client2 } = makeClient(jest.fn().mockResolvedValue('not an object'));
    await expectFailure(
      loadExplanation(KEY, { client: client2, isSignedIn: () => true }),
      'unavailable',
    );
  });

  it('ignores a corrupted cached row and fetches from the API', async () => {
    explanationsRepository.save(KEY, '{not json');
    const { client, request } = makeClient(jest.fn().mockResolvedValue(COVERED_EXPLANATION));

    const result = await loadExplanation(KEY, { client, isSignedIn: () => true });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('network');
    expect(result.explanation).toEqual(COVERED_EXPLANATION);
  });

  it('computes explanationKeyFor or returns null for healthy and low-confidence scans', () => {
    expect(
      explanationKeyFor(
        { crop: 'coffee', predictedClass: 'healthy', severity: 'healthy', isLowConfidence: false },
        'es',
      ),
    ).toBeNull();

    expect(
      explanationKeyFor(
        { crop: 'coffee', predictedClass: 'leaf_rust', severity: 'actNow', isLowConfidence: true },
        'es',
      ),
    ).toBeNull();

    expect(
      explanationKeyFor(
        { crop: 'coffee', predictedClass: 'leaf_rust', severity: 'actNow', isLowConfidence: false },
        'en',
      ),
    ).toEqual({
      crop: 'coffee',
      disease_class: 'leaf_rust',
      severity: 'actNow',
      language: 'en',
    });
  });
});
