import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { web } from './web';

/** Two wavelengths of a gentle wave, so sliding it by half its width loops seamlessly. */
const WAVE = 'M0 6 C 12.5 1, 37.5 1, 50 6 S 87.5 11, 100 6 S 137.5 1, 150 6 S 187.5 11, 200 6 L 200 12 L 0 12 Z';

/**
 * Water filling a rounded vessel from the bottom, with a wave on its surface that drifts
 * sideways (constant motion, so linear timing). The wave slides on the compositor via a
 * CSS transform; with reduced motion it stays still.
 */
export function Liquid({
  fraction,
  top,
  bottom,
  still,
  waveHeight = 8,
  speed = 7,
  delay = 0,
}: {
  /** 0..1 of the vessel's height */
  fraction: number;
  top: string;
  bottom: string;
  still?: boolean;
  waveHeight?: number;
  /** Seconds per loop */
  speed?: number;
  /** Seconds, to put neighbouring waves out of step */
  delay?: number;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  if (pct <= 0) return null;
  return (
    <View style={[{ pointerEvents: 'none' }, styles.fill, { height: `${pct}%` as `${number}%` }]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: bottom },
          web({ backgroundImage: `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)` }),
        ]}
      />
      <View style={[styles.waveClip, { height: waveHeight, top: -waveHeight + 1 }]}>
        <View
          style={[
            styles.waveTrack,
            !still &&
              web({
                animationKeyframes: { '0%': { transform: 'translateX(0%)' }, '100%': { transform: 'translateX(-50%)' } },
                animationDuration: `${speed}s`,
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite',
                animationDelay: `${-delay}s`,
              }),
          ]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 200 12" preserveAspectRatio="none">
            <Path d={WAVE} fill={top} />
          </Svg>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  waveClip: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  waveTrack: { width: '200%', height: '100%' },
});
