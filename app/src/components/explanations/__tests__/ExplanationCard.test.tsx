import React from 'react';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ExplanationCard } from '@/components/explanations';
import { type ExplanationKey } from '@/db';
import i18n from '@/i18n';
import {
  ExplanationError,
  type Explanation,
  type ExplanationResult,
} from '@/services/explanations';
import { ThemeProvider } from '@/theme';

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

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderCard(
  explanationKey: ExplanationKey | null,
  load: (key: ExplanationKey, scanId?: string) => Promise<ExplanationResult>,
  queryClient = makeQueryClient(),
  scanId?: string,
) {
  return render(
    <ThemeProvider>
      <ExplanationCard
        explanationKey={explanationKey}
        load={load}
        queryClient={queryClient}
        {...(scanId ? { scanId } : {})}
      />
    </ThemeProvider>,
  );
}

describe('ExplanationCard', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('es');
  });

  it('renders nothing when explanationKey is null', () => {
    const load = jest.fn();
    renderCard(null, load);

    expect(screen.queryByTestId('explanation-card')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('renders loading skeleton while the explanation promise is pending', () => {
    const load = jest.fn(() => new Promise<ExplanationResult>(() => {}));
    renderCard(KEY, load);

    expect(screen.getByTestId('explanation-card-loading')).toBeTruthy();
  });

  it('renders covered answer with summary, numbered steps, citation, and disclaimer without offline note for network source', async () => {
    const load = jest.fn().mockResolvedValue({
      explanation: COVERED_EXPLANATION,
      source: 'network',
      fetchedAt: '2026-01-15T10:00:00.000Z',
    } satisfies ExplanationResult);

    renderCard(KEY, load);

    expect(await screen.findByTestId('explanation-card-content')).toBeTruthy();
    expect(screen.getByTestId('explanation-card-summary')).toHaveTextContent('La roya avanza.');
    expect(screen.getByTestId('explanation-card-step-0')).toHaveTextContent(
      '1. Aplique fungicida.',
    );
    expect(screen.getByTestId('explanation-card-step-1')).toHaveTextContent(
      '2. Consulte a un agronomo.',
    );
    expect(screen.getByTestId('explanation-card-citation-0')).toHaveTextContent('ICAFE · Roya');
    fireEvent.press(screen.getByTestId('explanation-card-citation-0'));
    expect(screen.getByTestId('explanation-card-citation-0-details')).toHaveTextContent(
      /Guia tecnica/,
    );
    expect(screen.getByTestId('explanation-card-citation-0-details')).toHaveTextContent(
      /pág\. 40-42/,
    );
    expect(screen.getByTestId('explanation-card-disclaimer')).toHaveTextContent(
      /manuales técnicos oficiales/i,
    );
    expect(screen.queryByTestId('explanation-card-offline-copy')).toBeNull();
  });

  it('shows the scan copy note when source is scan and language matches the key', async () => {
    const load = jest.fn().mockResolvedValue({
      explanation: COVERED_EXPLANATION,
      source: 'scan',
      fetchedAt: '2026-01-15T10:00:00.000Z',
    } satisfies ExplanationResult);

    renderCard(KEY, load);

    expect(await screen.findByTestId('explanation-card-scan-copy')).toHaveTextContent(
      /Guardada con este diagnóstico para leerla sin conexión/,
    );
  });

  it('shows the other-language scan copy note when source is scan and explanation language differs from key', async () => {
    const load = jest.fn().mockResolvedValue({
      explanation: { ...COVERED_EXPLANATION, language: 'en' },
      source: 'scan',
      fetchedAt: '2026-01-15T10:00:00.000Z',
    } satisfies ExplanationResult);

    renderCard(KEY, load);

    expect(await screen.findByTestId('explanation-card-scan-copy')).toHaveTextContent(/en inglés/);
  });

  it('passes scanId as the second argument to load', async () => {
    const load = jest.fn().mockResolvedValue({
      explanation: COVERED_EXPLANATION,
      source: 'network',
      fetchedAt: '2026-01-15T10:00:00.000Z',
    } satisfies ExplanationResult);

    renderCard(KEY, load, makeQueryClient(), 'scan-1');

    expect(await screen.findByTestId('explanation-card-content')).toBeTruthy();
    expect(load).toHaveBeenCalledWith(KEY, 'scan-1');
  });

  it('shows the offline copy note when source is cache', async () => {
    const load = jest.fn().mockResolvedValue({
      explanation: COVERED_EXPLANATION,
      source: 'cache',
      fetchedAt: '2026-01-15T10:00:00.000Z',
    } satisfies ExplanationResult);

    renderCard(KEY, load);

    expect(await screen.findByTestId('explanation-card-offline-copy')).toHaveTextContent(
      /guardada en el teléfono/i,
    );
  });

  it('shows declined message when answer is not_covered', async () => {
    const load = jest.fn().mockResolvedValue({
      explanation: {
        ...COVERED_EXPLANATION,
        covered: false,
        summary: null,
        next_steps: [],
        citations: [],
        declined_reason: 'not_covered',
      },
      source: 'network',
      fetchedAt: '2026-01-15T10:00:00.000Z',
    } satisfies ExplanationResult);

    renderCard(KEY, load);

    expect(await screen.findByTestId('explanation-card-declined')).toHaveTextContent(
      /no encontramos información suficiente/i,
    );
  });

  it('shows offline error and retries when the retry button is pressed', async () => {
    const load = jest
      .fn<Promise<ExplanationResult>, [ExplanationKey]>()
      .mockRejectedValueOnce(new ExplanationError('offline'))
      .mockResolvedValueOnce({
        explanation: COVERED_EXPLANATION,
        source: 'network',
        fetchedAt: '2026-01-15T10:00:00.000Z',
      });

    renderCard(KEY, load);

    expect(await screen.findByTestId('explanation-card-error-offline')).toBeTruthy();
    const retryBtn = screen.getByTestId('explanation-card-retry-btn');
    fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('explanation-card-summary')).toHaveTextContent(
      'La roya avanza.',
    );
  });

  it('shows signedOut error without a retry button', async () => {
    const load = jest.fn().mockRejectedValue(new ExplanationError('signedOut'));
    renderCard(KEY, load);

    expect(await screen.findByTestId('explanation-card-error-signedOut')).toBeTruthy();
    expect(screen.queryByTestId('explanation-card-retry-btn')).toBeNull();
  });
});
