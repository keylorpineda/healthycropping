import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { CitationBadge } from '@/components/explanations';
import i18n from '@/i18n';
import { type ExplanationCitation } from '@/services/explanations';
import { ThemeProvider } from '@/theme';

const CITATION: ExplanationCitation = {
  source_title: 'Guia tecnica',
  publisher: 'ICAFE',
  year: 2020,
  section: 'Roya',
  first_page: 40,
  last_page: 42,
  url: 'https://example.org/icafe.pdf',
};

describe('CitationBadge', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await i18n.changeLanguage('es');
  });

  it('toggles details on press, exposes accessibility attributes, and opens the source URL', () => {
    const openSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    render(
      <ThemeProvider>
        <CitationBadge citation={CITATION} testID="badge" />
      </ThemeProvider>,
    );

    const badge = screen.getByTestId('badge');
    expect(badge.props.accessibilityRole).toBe('button');
    expect(badge.props.accessibilityLabel).toContain('Guia tecnica');
    expect(screen.queryByTestId('badge-details')).toBeNull();

    fireEvent.press(badge);
    expect(screen.getByTestId('badge-details')).toHaveTextContent(/pág\. 40-42/);

    fireEvent.press(screen.getByTestId('badge-open-btn'));
    expect(openSpy).toHaveBeenCalledWith('https://example.org/icafe.pdf');

    fireEvent.press(badge);
    expect(screen.queryByTestId('badge-details')).toBeNull();

    openSpy.mockRestore();
  });

  it('formats a single-page citation without a range', () => {
    render(
      <ThemeProvider>
        <CitationBadge citation={{ ...CITATION, first_page: 7, last_page: 7 }} testID="badge" />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('badge'));
    expect(screen.getByTestId('badge-details')).toHaveTextContent(/pág\. 7\)/);
  });
});
