import type { TextStyle } from 'react-native';

export const fontSizes = {
  display: 32,
  title1: 28,
  title2: 22,
  title3: 18,
  headline: 16,
  body: 15,
  callout: 14,
  subhead: 13,
  caption: 11,
} as const;

export const lineHeights = {
  display: 38,
  title1: 34,
  title2: 28,
  title3: 24,
  headline: 22,
  body: 22,
  callout: 20,
  subhead: 18,
  caption: 14,
} as const;

export const fontWeights = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
};

export interface TypographyTokens {
  display: TextStyle;
  title1: TextStyle;
  title2: TextStyle;
  title3: TextStyle;
  headline: TextStyle;
  body: TextStyle;
  bodyMedium: TextStyle;
  bodyBold: TextStyle;
  callout: TextStyle;
  subhead: TextStyle;
  subheadMedium: TextStyle;
  caption: TextStyle;
}

export const typography: TypographyTokens = {
  display: {
    fontSize: fontSizes.display,
    lineHeight: lineHeights.display,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.5,
  },
  title1: {
    fontSize: fontSizes.title1,
    lineHeight: lineHeights.title1,
    fontWeight: fontWeights.bold,
    letterSpacing: -0.4,
  },
  title2: {
    fontSize: fontSizes.title2,
    lineHeight: lineHeights.title2,
    fontWeight: fontWeights.semiBold,
    letterSpacing: -0.3,
  },
  title3: {
    fontSize: fontSizes.title3,
    lineHeight: lineHeights.title3,
    fontWeight: fontWeights.semiBold,
    letterSpacing: -0.2,
  },
  headline: {
    fontSize: fontSizes.headline,
    lineHeight: lineHeights.headline,
    fontWeight: fontWeights.semiBold,
  },
  body: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.regular,
  },
  bodyMedium: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.medium,
  },
  bodyBold: {
    fontSize: fontSizes.body,
    lineHeight: lineHeights.body,
    fontWeight: fontWeights.bold,
  },
  callout: {
    fontSize: fontSizes.callout,
    lineHeight: lineHeights.callout,
    fontWeight: fontWeights.regular,
  },
  subhead: {
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    fontWeight: fontWeights.regular,
  },
  subheadMedium: {
    fontSize: fontSizes.subhead,
    lineHeight: lineHeights.subhead,
    fontWeight: fontWeights.medium,
  },
  caption: {
    fontSize: fontSizes.caption,
    lineHeight: lineHeights.caption,
    fontWeight: fontWeights.medium,
    letterSpacing: 0.2,
  },
};
