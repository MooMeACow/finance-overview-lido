import React from 'react';
import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

import { fonts } from '../theme';

const BY_WEIGHT: Record<string, string> = {
  '100': fonts.ui[400],
  '200': fonts.ui[400],
  '300': fonts.ui[400],
  '400': fonts.ui[400],
  normal: fonts.ui[400],
  '500': fonts.ui[500],
  '600': fonts.ui[600],
  '700': fonts.ui[700],
  bold: fonts.ui[700],
  '800': fonts.ui[700],
  '900': fonts.ui[700],
};

/**
 * Drop-in replacement for React Native's Text that sets the UI font (Geist) for the
 * requested weight. Each weight is its own font file, so the weight moves into the
 * family name and `fontWeight` goes back to normal (otherwise browsers fake a bold
 * on top of the real one). Text that already names a family (display type) is left alone.
 */
export const Text = React.forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style) ?? {};
  if (flat.fontFamily) return <RNText ref={ref} {...rest} style={style} />;
  const family = BY_WEIGHT[String(flat.fontWeight ?? '400')] ?? fonts.ui[400];
  return <RNText ref={ref} {...rest} style={[style, { fontFamily: family, fontWeight: 'normal' }]} />;
});
