import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, motion, radius, shadow, useColors } from '../theme';
import { useLayout } from '../layout';
import { setToastHost, type ToastRequest } from '../lib/toast';
import { Text } from './Text';
import { Icon } from './Icon';
import { web } from './web';

const SHOW_MS = 2400;

/**
 * One small pill that rises from the bottom after something is saved or removed, then drifts
 * away. A new note replaces the current one. It pauses while the tab is hidden.
 */
export function ToastHost() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const [current, setCurrent] = useState<ToastRequest | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () =>
      setToastHost((t) => {
        timers.current.forEach(clearTimeout);
        setLeaving(false);
        setCurrent(t);
        timers.current = [
          setTimeout(() => setLeaving(true), SHOW_MS),
          setTimeout(() => setCurrent((x) => (x?.id === t.id ? null : x)), SHOW_MS + 220),
        ];
      }),
    [],
  );
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!current) return null;
  const removed = current.kind === 'removed';
  return (
    <View style={[{ pointerEvents: 'none' }, styles.wrap, { bottom: isWide ? 28 : insets.bottom + 96 }]}>
      <View
        key={current.id}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.toast,
          { backgroundColor: 'rgba(6,17,46,0.9)' },
          shadow(c, 2),
          web({
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            animationKeyframes: { '0%': { opacity: 0, transform: 'translateY(14px) scale(0.97)' }, '100%': { opacity: 1, transform: 'translateY(0px) scale(1)' } },
            animationDuration: '280ms',
            animationTimingFunction: motion.easeOut,
            animationFillMode: 'both',
            transitionProperty: 'opacity, transform',
            transitionDuration: '200ms',
          }),
          leaving && { opacity: 0, transform: [{ translateY: 8 }] },
        ]}
      >
        <View style={[styles.badge, { backgroundColor: removed ? 'rgba(255,135,102,0.22)' : 'rgba(63,212,245,0.22)' }]}>
          <Icon name={removed ? 'trash-outline' : 'checkmark'} size={14} color={removed ? '#FFB39E' : '#8DEBFF'} weight="bold" />
        </View>
        <Text style={{ fontFamily: fonts.ui[500], fontSize: 14, color: '#FFF8EC' }}>{current.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, paddingRight: 18, height: 44, borderRadius: radius.pill },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
