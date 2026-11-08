import * as SQLite from 'expo-sqlite';

import {
  explanationId,
  explanationsRepository,
  initDatabase,
  parseExplanationId,
  type ExplanationKey,
} from '@/db';
import { ApiError, type ApiClient } from '@/services/api';
import {
  ExplanationError,
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

describe('scan explanations link and fallback', () => {
  beforeEach(() => {
    mockSQLite.__mockDb.reset();
    initDatabase(mockSQLite.__mockDb);
  });

  it('links a network answer and a cached answer to scanId, and does not link not_covered', async () => {
    const { client } = makeClient(jest.fn().mockResolvedValue(COVERED_EXPLANATION));

    await loadExplanation(KEY, {
      client,
      isSignedIn: () => true,
      scanId: 'scan-1',
    });

    const linked1 = explanationsRepository.getForScan('scan-1');
    expect(linked1).not.toBeNull();
    expect(linked1?.explanation_id).toBe('coffee:leaf_rust:actNow:es');

    const { client: cachedClient, request: cachedRequest } = makeClient();
    const cachedResult = await loadExplanation(KEY, {
      client: cachedClient,
      isSignedIn: () => true,
      scanId: 'scan-cached',
    });
    expect(cachedResult.source).toBe('cache');
    expect(cachedRequest).not.toHaveBeenCalled();
    expect(explanationsRepository.getForScan('scan-cached')?.explanation_id).toBe(
      'coffee:leaf_rust:actNow:es',
    );

    const notCoveredKey: ExplanationKey = { ...KEY, severity: 'watch' };
    const notCovered: Explanation = {
      ...COVERED_EXPLANATION,
      severity: 'watch',
      covered: false,
      summary: null,
      next_steps: [],
      citations: [],
      declined_reason: 'not_covered',
    };
    const { client: ncClient } = makeClient(jest.fn().mockResolvedValue(notCovered));
    await loadExplanation(notCoveredKey, {
      client: ncClient,
      isSignedIn: () => true,
      scanId: 'scan-nc',
    });
    expect(explanationsRepository.getForScan('scan-nc')).toBeNull();
  });

  it('falls back to the scan copy when offline in another language, and rejects without scanId or when corrupted', async () => {
    const { client: onlineClient } = makeClient(jest.fn().mockResolvedValue(COVERED_EXPLANATION));
    await loadExplanation(KEY, {
      client: onlineClient,
      isSignedIn: () => true,
      scanId: 'scan-1',
    });

    const { client: offlineClient } = makeClient(
      jest.fn().mockRejectedValue(new ApiError(0, 'network')),
    );
    const enKey: ExplanationKey = { ...KEY, language: 'en' };

    const fallback = await loadExplanation(enKey, {
      client: offlineClient,
      isSignedIn: () => true,
      scanId: 'scan-1',
    });
    expect(fallback.source).toBe('scan');
    expect(fallback.explanation.language).toBe('es');

    await expectFailure(
      loadExplanation(enKey, { client: offlineClient, isSignedIn: () => true }),
      'offline',
    );

    explanationsRepository.linkToScan('scan-2', KEY, '{bad');
    await expectFailure(
      loadExplanation(enKey, {
        client: offlineClient,
        isSignedIn: () => true,
        scanId: 'scan-2',
      }),
      'offline',
    );
  });

  it('parses valid explanation ids and returns null for invalid ones', () => {
    expect(parseExplanationId(explanationId(KEY))).toEqual(KEY);
    expect(parseExplanationId('a:b:c')).toBeNull();
    expect(parseExplanationId('coffee:leaf_rust:severe:es')).toBeNull();
    expect(parseExplanationId('coffee:leaf_rust:watch:fr')).toBeNull();
    expect(parseExplanationId('a:b:watch:es:extra')).toBeNull();
  });
});
