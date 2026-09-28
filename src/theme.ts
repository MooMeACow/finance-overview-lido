import { useColorScheme } from 'react-native';

/**
 * Blue theme. Surfaces are cool, lightly blue-tinted neutrals; the primary
 * color and the dashboard's hero card are deep blues. Chart colors (money in =
 * blue, money out = orange) are validated to stay distinguishable for
 * colorblind users in light and dark mode.
 */
const light = {
  background: '#f3f6fb',
  card: '#ffffff',
  cardBorder: 'rgba(13,54,107,0.08)',
  text: '#0d1b2e',
  textSecondary: '#4a5a70',
  textMuted: '#7d8a9c',
  hairline: '#e2e8f0',
  baseline: '#c5cfdc',
  positive: '#006300', // text color for money in
  seriesIn: '#2a78d6',
  seriesOut: '#eb6834',
  track: '#eaf0f7',
  primary: '#1c5cab',
  onPrimary: '#ffffff',
  accentSoft: '#e3edfa',
  hero: '#184f95',
  heroText: '#ffffff',
  heroMuted: 'rgba(255,255,255,0.78)',
  heroPill: 'rgba(255,255,255,0.14)',
  danger: '#d03b3b',
  backdrop: 'rgba(8,20,40,0.4)',
};

const dark: typeof light = {
  background: '#0a1220',
  card: '#111c2e',
  cardBorder: 'rgba(255,255,255,0.07)',
  text: '#f2f6fb',
  textSecondary: '#b7c3d3',
  textMuted: '#7d8a9c',
  hairline: '#1e2a3d',
  baseline: '#2c3a50',
  positive: '#0ca30c',
  seriesIn: '#3987e5',
  seriesOut: '#d95926',
  track: '#18253a',
  primary: '#256abf',
  onPrimary: '#ffffff',
  accentSoft: '#152a47',
  hero: '#1c5cab',
  heroText: '#ffffff',
  heroMuted: 'rgba(255,255,255,0.78)',
  heroPill: 'rgba(255,255,255,0.14)',
  danger: '#e66767',
  backdrop: 'rgba(0,0,0,0.6)',
};

export type Colors = typeof light;

export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
