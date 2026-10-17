/**
 * Agricultural Design Tokens - Colors
 *
 * Palettes inspired by Costa Rican agroecosystems:
 * - Deep leaf greens (Coffea, Theobroma, Musa)
 * - Volcanic and organic soil/coffee earth browns
 * - Ripening crop accents (coffee cherries, cacao pods, bananas)
 * - High-contrast accessible status colors complying with WCAG AA (>= 4.5:1).
 */

export const palette = {
  // Deep leaf greens
  green950: '#0E1F16',
  green900: '#142E21',
  green800: '#1B3B2B', // Brand primary (deep shade-tree green)
  green700: '#23523B',
  green600: '#2D7A4F', // Brand emerald / active accent
  green500: '#3D9E67',
  green400: '#5FBE86',
  green300: '#8FE0B0',
  green200: '#C2F3D6',
  green100: '#E6FAEE',
  green50: '#F2FCF6',

  // Soil & organic neutrals (warm earth)
  soil950: '#151311',
  soil900: '#211D19',
  soil800: '#332C26',
  soil700: '#4D423A',
  soil600: '#695B50',
  soil500: '#8A7A6E',
  soil400: '#AE9F93',
  soil300: '#D1C6BD',
  soil200: '#E8E2DC',
  soil100: '#F4F1EE',
  soil50: '#FAF8F6',

  // Crop Accents
  // Coffee: ripening drupe to dark roast
  coffeeBerry: '#C0392B',
  coffeeRoast: '#5A3825',
  coffeePulp: '#E74C3C',
  coffeeLight: '#FADBD8',

  // Cacao: rich criollo / trinitario pod amber
  cacaoAmber: '#D97706',
  cacaoPod: '#B45309',
  cacaoGold: '#F59E0B',
  cacaoLight: '#FEF3C7',

  // Banana: musa leaf & ripening peel
  bananaGreen: '#65A30D',
  bananaGold: '#EAB308',
  bananaLeaf: '#84CC16',
  bananaLight: '#FEF9C3',

  // Semantic Status Colors (WCAG AA calibrated)
  statusHealthyLight: '#15803D', // Emerald green
  statusHealthyDark: '#4ADE80',
  statusWatchLight: '#B45309', // Amber warning
  statusWatchDark: '#FBBF24',
  statusActNowLight: '#B91C1C', // Crimson danger
  statusActNowDark: '#F87171',
  statusLowConfLight: '#475569', // Slate neutral
  statusLowConfDark: '#94A3B8',

  // Absolute basics
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export interface ThemeColors {
  // Brand
  primary: string;
  primaryLight: string;
  primaryDark: string;
  onPrimary: string;

  // Surfaces & Backgrounds
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSubtle: string;

  // Content / Typography
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  // Borders & Dividers
  border: string;
  borderSubtle: string;
  borderStrong: string;

  // Semantic Status
  status: {
    healthy: {
      main: string;
      background: string;
      border: string;
      text: string;
    };
    watch: {
      main: string;
      background: string;
      border: string;
      text: string;
    };
    actNow: {
      main: string;
      background: string;
      border: string;
      text: string;
    };
    lowConfidence: {
      main: string;
      background: string;
      border: string;
      text: string;
    };
  };

  // Crop Accents
  crops: {
    coffee: {
      accent: string;
      accentSubtle: string;
      badgeText: string;
    };
    cacao: {
      accent: string;
      accentSubtle: string;
      badgeText: string;
    };
    banana: {
      accent: string;
      accentSubtle: string;
      badgeText: string;
    };
  };
}

export const lightColors: ThemeColors = {
  primary: palette.green800,
  primaryLight: palette.green600,
  primaryDark: palette.green950,
  onPrimary: palette.white,

  background: palette.soil50,
  surface: palette.white,
  surfaceRaised: palette.white,
  surfaceSubtle: palette.green50,

  textPrimary: palette.soil950,
  textSecondary: palette.soil700,
  textTertiary: palette.soil500,
  textInverse: palette.white,

  border: palette.soil200,
  borderSubtle: palette.soil100,
  borderStrong: palette.soil400,

  status: {
    healthy: {
      main: palette.statusHealthyLight,
      background: '#DCFCE7',
      border: '#86EFAC',
      text: '#14532D',
    },
    watch: {
      main: palette.statusWatchLight,
      background: '#FEF3C7',
      border: '#FDE68A',
      text: '#78350F',
    },
    actNow: {
      main: palette.statusActNowLight,
      background: '#FEE2E2',
      border: '#FECACA',
      text: '#7F1D1D',
    },
    lowConfidence: {
      main: palette.statusLowConfLight,
      background: '#F1F5F9',
      border: '#CBD5E1',
      text: '#1E293B',
    },
  },

  crops: {
    coffee: {
      accent: palette.coffeeBerry,
      accentSubtle: palette.coffeeLight,
      badgeText: '#78281F',
    },
    cacao: {
      accent: palette.cacaoPod,
      accentSubtle: palette.cacaoLight,
      badgeText: '#78350F',
    },
    banana: {
      accent: palette.bananaGreen,
      accentSubtle: palette.bananaLight,
      badgeText: '#3F6212',
    },
  },
};

export const darkColors: ThemeColors = {
  primary: palette.green400,
  primaryLight: palette.green300,
  primaryDark: palette.green600,
  onPrimary: palette.soil950,

  background: palette.soil950,
  surface: palette.soil900,
  surfaceRaised: palette.soil800,
  surfaceSubtle: palette.green950,

  textPrimary: palette.soil50,
  textSecondary: palette.soil300,
  textTertiary: palette.soil400,
  textInverse: palette.soil950,

  border: palette.soil700,
  borderSubtle: palette.soil800,
  borderStrong: palette.soil600,

  status: {
    healthy: {
      main: palette.statusHealthyDark,
      background: '#052E16',
      border: '#15803D',
      text: '#86EFAC',
    },
    watch: {
      main: palette.statusWatchDark,
      background: '#451A03',
      border: '#B45309',
      text: '#FDE68A',
    },
    actNow: {
      main: palette.statusActNowDark,
      background: '#450A0A',
      border: '#B91C1C',
      text: '#FECACA',
    },
    lowConfidence: {
      main: palette.statusLowConfDark,
      background: '#0F172A',
      border: '#475569',
      text: '#CBD5E1',
    },
  },

  crops: {
    coffee: {
      accent: '#E74C3C',
      accentSubtle: '#3A1412',
      badgeText: '#FADBD8',
    },
    cacao: {
      accent: '#F59E0B',
      accentSubtle: '#361E05',
      badgeText: '#FEF3C7',
    },
    banana: {
      accent: '#A3E635',
      accentSubtle: '#1E2C08',
      badgeText: '#FEF9C3',
    },
  },
};
