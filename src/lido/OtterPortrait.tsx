import React from 'react';
import { View } from 'react-native';

import { Icon } from './Icon';

/** Phone app: a still mark instead of the live otter. */
export function OtterPortrait({ size = 36, background = '#1F4FE0' }: { size?: number; seed?: number; background?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.34, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="water-outline" size={size * 0.5} color="#FFF8EC" weight="fill" />
    </View>
  );
}
