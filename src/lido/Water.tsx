import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useIsDark } from '../theme';

/** Phone app: the pool is a still gradient (the moving light is web-only for now). */
export function Water({ radius = 0 }: { radius?: number }) {
  const dark = useIsDark();
  return (
    <View
      style={[{ pointerEvents: 'none' },
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          overflow: 'hidden',
          backgroundColor: dark ? '#07226F' : '#1766E0',
          experimental_backgroundImage: dark
            ? 'linear-gradient(160deg, #0E5AAE 0%, #07226F 55%, #020A2A 100%)'
            : 'linear-gradient(160deg, #46C4F0 0%, #1766E0 50%, #0A3A9E 100%)',
        } as object,
      ]}
    />
  );
}
