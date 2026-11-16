import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { type WeatherAttribution } from '@/services/weatherRisk';
import { useTheme } from '@/theme';

export interface WeatherAttributionLinkProps {
  attribution: WeatherAttribution;
  testID?: string;
}

/** Open-Meteo's CC BY 4.0 credit, required wherever its data is shown. */
export function WeatherAttributionLink({
  attribution,
  testID = 'weather-attribution',
}: WeatherAttributionLinkProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();

  const open = () => {
    Linking.openURL(attribution.url).catch((error: unknown) => {
      console.error('Failed to open weather attribution', error);
    });
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityHint={t('weather.attributionHint')}
      style={styles.target}
      testID={testID}
    >
      <Text
        style={[
          theme.typography.caption,
          { color: theme.colors.textSecondary, textDecorationLine: 'underline' },
        ]}
      >
        {t('weather.attribution', { license: attribution.license })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    minHeight: 48,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
});
