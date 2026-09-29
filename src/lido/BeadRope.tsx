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
export function BeadRope({ value, beads = 20, animate = false, delay = 0 }: { value: number; beads?: number; animate?: boolean; delay?: number }) {
  const c = useColors();
  const over = value > 1;
  const filled = Math.round(Math.max(0, Math.min(1, value)) * beads);
  const warnFrom = Math.floor(beads * 0.8);
  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: beads }, (_, i) => {
        const on = i < filled;
        const color = !on ? c.track : over ? c.coral : i >= warnFrom ? c.sun : i % 2 === 0 ? c.primary : c.aqua;
        return (
          <View
            key={i}
            style={[
              styles.bead,
              { backgroundColor: color },
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
