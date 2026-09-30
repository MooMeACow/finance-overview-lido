import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { motion, shadow, space, type as T, useColors } from '../theme';
import { setDialogHost, type DialogRequest } from '../lib/dialogs';
import { Button } from '../components/ui';
import { Text } from './Text';
import { Icon } from './Icon';
import { web } from './web';

/**
 * The app's own confirm and notice dialogs on the web (instead of the browser's alert box).
 * Enter confirms, Escape cancels; the card rises in from 97%, and leaves with a quick fade.
 */
export function DialogHost() {
  const c = useColors();
  const [req, setReq] = useState<DialogRequest | null>(null);
  const [leaving, setLeaving] = useState(false);
  const current = useRef<DialogRequest | null>(null);
  current.current = req;

  useEffect(
    () =>
      setDialogHost((r) => {
        current.current?.resolve(false);
        setLeaving(false);
        setReq(r);
      }),
    [],
  );

  const close = (ok: boolean) => {
    const r = current.current;
    if (!r || leaving) return;
    r.resolve(ok);
    setLeaving(true);
    setTimeout(() => {
      setReq((x) => (x === r ? null : x));
      setLeaving(false);
    }, 140);
  };

  useEffect(() => {
    if (!req || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!req) return null;
  const isConfirm = !!req.confirmLabel;
  const danger = req.tone === 'danger';

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => close(false)}>
      <View
        style={[
          styles.wrap,
          web({
            animationKeyframes: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
            animationDuration: '180ms',
            animationTimingFunction: motion.easeOut,
            animationFillMode: 'backwards',
          }),
          leaving && { opacity: 0 },
          web({ transitionProperty: 'opacity', transitionDuration: '140ms' }),
        ]}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop }, web({ backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', cursor: 'default' })]}
          onPress={() => close(false)}
          accessibilityLabel="Close"
        />
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: c.card },
            shadow(c, 3),
            web({
              animationKeyframes: {
                '0%': { opacity: 0, transform: 'translateY(8px) scale(0.97)' },
                '100%': { opacity: 1, transform: 'translateY(0px) scale(1)' },
              },
              animationDuration: '220ms',
              animationTimingFunction: motion.easeOut,
              animationFillMode: 'backwards',
            }),
          ]}
        >
          <View style={[styles.badge, { backgroundColor: danger ? `${c.danger}1f` : c.accentSoft }]}>
            <Icon
              name={danger ? 'trash-outline' : isConfirm ? 'information-circle-outline' : 'checkmark'}
              size={22}
              color={danger ? c.danger : c.primary}
              weight="duotone"
              duotoneColor={danger ? c.danger : c.primary}
            />
          </View>
          <Text style={[T.title, { fontSize: 22, lineHeight: 28, color: c.text }]}>{req.title}</Text>
          <Text style={[T.body, { color: c.textSecondary }]}>{req.message}</Text>
          <View style={styles.actions}>
            {isConfirm ? (
              <>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="secondary" onPress={() => close(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label={req.confirmLabel!} variant={danger ? 'danger' : 'primary'} onPress={() => close(true)} />
                </View>
              </>
            ) : (
              <View style={{ flex: 1 }}>
                <Button label="OK" onPress={() => close(true)} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  card: { width: 440, maxWidth: '100%', borderRadius: 28, padding: space.xl, gap: space.md },
  badge: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  actions: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
});
