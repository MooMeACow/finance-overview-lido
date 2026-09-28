import { useWindowDimensions } from 'react-native';

/** Breakpoints for the responsive layout. */
export const SIDEBAR_BREAKPOINT = 960; // sidebar + multi-column grids
export const TWO_COLUMN_BREAKPOINT = 720; // side-by-side cards inside a page

export function useLayout() {
  const { width } = useWindowDimensions();
  return {
    width,
    /** Desktop-style: left sidebar, grids, tables, side panels */
    isWide: width >= SIDEBAR_BREAKPOINT,
    /** Enough room for two cards next to each other */
    isMedium: width >= TWO_COLUMN_BREAKPOINT,
  };
}
