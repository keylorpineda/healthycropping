import { darkColors, lightColors, type ThemeColors } from './colors';
import { darkElevation, lightElevation, type ElevationTokens } from './elevation';
import { motion, type MotionTokens } from './motion';
import { radii } from './radii';
import { spacing } from './spacing';
import { typography, type TypographyTokens } from './typography';

export interface Theme {
  name: 'light' | 'dark';
  isDark: boolean;
  colors: ThemeColors;
  typography: TypographyTokens;
  spacing: typeof spacing;
  radii: typeof radii;
  elevation: ElevationTokens;
  motion: MotionTokens;
}

export const lightTheme: Theme = {
  name: 'light',
  isDark: false,
  colors: lightColors,
  typography,
  spacing,
  radii,
  elevation: lightElevation,
  motion,
};

export const darkTheme: Theme = {
  name: 'dark',
  isDark: true,
  colors: darkColors,
  typography,
  spacing,
  radii,
  elevation: darkElevation,
  motion,
};
