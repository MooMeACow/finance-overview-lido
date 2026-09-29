import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useColors } from '../theme';
import { web } from './web';

/**
 * A budget as a pool lane rope: the floats fill up as you spend. Blue and aqua for the
 * first stretch, sun-yellow in the last fifth (like the floats that warn you the wall is
 * close), coral when you're over. The amount is always written next to it too, so colour
 * is never the only signal.
 */
export function BeadRope({
  value,
  beads = 20,
  animate = false,
  delay = 0,
  tone = 'default',
  height = 12,
}: {
  value: number;
  beads?: number;
  animate?: boolean;
  delay?: number;
  /** 'water' for use on the pool, where the floats are cream and aqua */
  tone?: 'default' | 'water';
  height?: number;
}) {
  const c = useColors();
  const over = value > 1;
  const filled = Math.round(Math.max(0, Math.min(1, value)) * beads);
  const warnFrom = Math.floor(beads * 0.8);
  const floats = tone === 'water' ? { off: 'rgba(255,248,236,0.2)', a: '#FFF8EC', b: '#8DEBFF' } : { off: c.track, a: c.primary, b: c.aqua };
  return (
    <View style={[styles.row, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: beads }, (_, i) => {
        const on = i < filled;
        const color = !on ? floats.off : over ? c.coral : i >= warnFrom ? c.sun : i % 2 === 0 ? floats.a : floats.b;
        return (
          <View
            key={i}
            style={[
              styles.bead,
              { backgroundColor: color, height, borderRadius: height / 2 },
              on &&
                animate &&
                web({
                  animationKeyframes: { '0%': { opacity: 0, transform: 'scaleY(0.4)' }, '100%': { opacity: 1, transform: 'scaleY(1)' } },
                  animationDuration: '260ms',
                  animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
                  animationDelay: `${delay + i * 14}ms`,
                  animationFillMode: 'both',
                }),
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, height: 12, alignItems: 'center' },
  bead: { flex: 1, height: 12, borderRadius: 6 },
});
