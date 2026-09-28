import { useColorScheme } from 'react-native';

/**
 * Colors: warm neutral surfaces, ink for text, and two validated chart colors
 * (money in = blue, money out = orange) that stay distinguishable for
 * colorblind users in both light and dark mode.
 */
const light = {
  background: '#f9f9f7',
  card: '#fcfcfb',
  cardBorder: 'rgba(11,11,11,0.08)',
  text: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  hairline: '#e1e0d9',
  baseline: '#c3c2b7',
  positive: '#006300', // text color for money in
  seriesIn: '#2a78d6',
  seriesOut: '#eb6834',
  track: '#f0efec',
  primary: '#0b0b0b',
  onPrimary: '#ffffff',
  danger: '#d03b3b',
  backdrop: 'rgba(0,0,0,0.35)',
};

const dark: typeof light = {
  background: '#0d0d0d',
  card: '#1a1a19',
  cardBorder: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  hairline: '#2c2c2a',
  baseline: '#383835',
  positive: '#0ca30c',
  seriesIn: '#3987e5',
  seriesOut: '#d95926',
  track: '#262624',
  primary: '#ffffff',
  onPrimary: '#0b0b0b',
  danger: '#e66767',
  backdrop: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof light;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
