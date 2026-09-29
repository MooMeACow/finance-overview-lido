import { useColorScheme } from 'react-native';

/**
 * "Golden-hour Lido". Light mode is the pool deck at golden hour (warm cream tiles,
 * cobalt water, low sun); dark mode is the same pool at night, lit from below.
 *
 * One accent (cobalt). Aqua, sun and coral are semantic: water and money in, the
 * warm light and the "nearly at the limit" zone, money out and over budget.
 * Neutrals are navy-tinted, so text, hairlines and shadows all lean toward the water.
 * Money in stays blue and money out stays warm in charts, which keeps the two series
 * apart for colorblind users in both modes.
 */
const light = {
  background: '#FBF3E4',
  backgroundDeep: '#F5E7CF',
  card: '#FFFDF8',
  cardSunk: '#F7EEDF',
  cardBorder: 'rgba(14,27,61,0.07)',
  text: '#0E1B3D',
  textSecondary: '#44527A',
  textMuted: '#6E7CA0',
  hairline: 'rgba(14,27,61,0.09)',
  baseline: 'rgba(14,27,61,0.18)',
  positive: '#0B7F60', // text color for money in
  seriesIn: '#1F4FE0',
  seriesOut: '#EE6A43',
  track: 'rgba(31,79,224,0.07)',
  hover: 'rgba(31,79,224,0.06)',
  primary: '#1F4FE0',
  primaryPressed: '#1841C2',
  onPrimary: '#FFFBF2',
  accentSoft: 'rgba(31,79,224,0.10)',
  aqua: '#22B5DD',
  sun: '#FFB938',
  sunSoft: '#FFE3A6',
  coral: '#EE6A43',
  hero: '#1847C9',
  heroText: '#FFF8EC',
  heroMuted: 'rgba(255,248,236,0.78)',
  heroPill: 'rgba(255,248,236,0.14)',
  danger: '#D9482A',
  backdrop: 'rgba(9,20,52,0.42)',
  glass: 'rgba(255,252,245,0.72)',
  glassBorder: 'rgba(255,255,255,0.7)',
  shadow: '#0E1B3D',
};

const dark: typeof light = {
  background: '#07122E',
  backgroundDeep: '#050D24',
  card: '#0D1C47',
  cardSunk: '#0A1739',
  cardBorder: 'rgba(255,255,255,0.08)',
  text: '#F4EFE4',
  textSecondary: '#B8C3DE',
  textMuted: '#8392B8',
  hairline: 'rgba(210,222,255,0.10)',
  baseline: 'rgba(210,222,255,0.22)',
  positive: '#45DDB0',
  seriesIn: '#5B85FF',
  seriesOut: '#FF8766',
  track: 'rgba(91,133,255,0.12)',
  hover: 'rgba(91,133,255,0.10)',
  primary: '#5B85FF',
  primaryPressed: '#4A72EC',
  onPrimary: '#06112E',
  accentSoft: 'rgba(91,133,255,0.16)',
  aqua: '#3FD4F5',
  sun: '#FFC95C',
  sunSoft: 'rgba(255,201,92,0.18)',
  coral: '#FF8766',
  hero: '#123AA8',
  heroText: '#FFF8EC',
  heroMuted: 'rgba(255,248,236,0.76)',
  heroPill: 'rgba(255,248,236,0.12)',
  danger: '#FF7A5C',
  backdrop: 'rgba(2,6,20,0.62)',
  glass: 'rgba(13,28,71,0.72)',
  glassBorder: 'rgba(255,255,255,0.10)',
  shadow: '#000814',
};

export type Colors = typeof light;

/**
 * Shape lock: tiles are 28, anything nested one level inside a tile's 12px padding
 * is 16 (28 = 16 + 12), the pool is 36, controls are full pills, inputs are 16.
 */
export const radius = { xs: 8, sm: 12, md: 16, lg: 28, pool: 36, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Font families. Custom fonts carry their weight in the family name; never add fontWeight on top. */
export const fonts = {
  display: {
    500: 'BricolageGrotesque_500Medium',
    600: 'BricolageGrotesque_600SemiBold',
    700: 'BricolageGrotesque_700Bold',
    800: 'BricolageGrotesque_800ExtraBold',
  },
  ui: {
    400: 'Geist_400Regular',
    500: 'Geist_500Medium',
    600: 'Geist_600SemiBold',
    700: 'Geist_700Bold',
  },
} as const;

/** Type scale. Display sizes use Bricolage Grotesque; everything else Geist. */
export const type = {
  hero: { fontFamily: fonts.display[700], fontSize: 84, lineHeight: 88, letterSpacing: -3.2 },
  heroPhone: { fontFamily: fonts.display[700], fontSize: 52, lineHeight: 56, letterSpacing: -1.8 },
  display: { fontFamily: fonts.display[700], fontSize: 44, lineHeight: 48, letterSpacing: -1.4 },
  displayPhone: { fontFamily: fonts.display[700], fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  title: { fontFamily: fonts.display[600], fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  number: { fontFamily: fonts.display[600], fontSize: 28, lineHeight: 32, letterSpacing: -0.6 },
  body: { fontFamily: fonts.ui[400], fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.ui[500], fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.ui[500], fontSize: 13, lineHeight: 18 },
  small: { fontFamily: fonts.ui[400], fontSize: 12, lineHeight: 17 },
} as const;

/** Motion values (Emil Kowalski / better-ui). Durations in ms. */
export const motion = {
  easeOut: 'cubic-bezier(0.23, 1, 0.32, 1)',
  easeInOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  easeDrawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
  easeIcon: 'cubic-bezier(0.2, 0, 0, 1)',
  press: 150,
  hover: 120,
  small: 200,
  panel: 300,
} as const;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

/** Navy-tinted, layered elevation (a hairline ring, a close lift, a soft ambient fall-off). */
export function shadow(c: Colors, level: 1 | 2 | 3 = 1): { boxShadow: string } {
  const isDark = c.background === dark.background;
  if (isDark) {
    const ring = 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(210,222,255,0.08)';
    const drop = level === 1 ? '0 10px 30px -18px rgba(0,4,16,0.9)' : level === 2 ? '0 18px 44px -20px rgba(0,4,16,0.95)' : '0 30px 80px -24px rgba(0,4,16,1)';
    return { boxShadow: `${ring}, ${drop}` };
  }
  const ring = 'inset 0 1px 0 rgba(255,255,255,0.9), 0 0 0 1px rgba(14,27,61,0.06)';
  const drop =
    level === 1
      ? '0 1px 2px -1px rgba(14,27,61,0.08), 0 12px 28px -18px rgba(14,27,61,0.28)'
      : level === 2
        ? '0 2px 4px -2px rgba(14,27,61,0.10), 0 22px 48px -24px rgba(14,27,61,0.40)'
        : '0 4px 10px -4px rgba(14,27,61,0.14), 0 40px 90px -30px rgba(14,27,61,0.55)';
  return { boxShadow: `${ring}, ${drop}` };
}
