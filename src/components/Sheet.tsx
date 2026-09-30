import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, radius, shadow, space, type as T, useColors } from '../theme';
import { useLayout } from '../layout';
import { IconButton, Press, Text } from './ui';
import { Icon } from '../lido/Icon';
import { pointer } from '../lido/pointer';
import { useReducedMotion } from '../lido/motionPrefs';
import { isWeb, web } from '../lido/web';

const EXIT_MS = 170;

/** Keeps a closing element on screen long enough to animate out. */
function usePresence(visible: boolean) {
  const [shown, setShown] = useState(visible);
  useEffect(() => {
    if (visible) {
      setShown(true);
      return;
    }
    const t = setTimeout(() => setShown(false), EXIT_MS);
    return () => clearTimeout(t);
  }, [visible]);
  return { mounted: visible || shown, leaving: !visible && shown };
}

/**
 * The poolside card: editing happens on a card that grows out of the spot you clicked.
 * With a `preview`, the card is split in two on wide screens: a small pool on the left shows
 * what you're editing (live, as you type) and the form sits on the right with its actions
 * pinned at the bottom. On phones it's a bottom sheet with the preview across the top.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  preview,
  footer,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** A live picture of the thing being edited (use the previews in SheetPreviews) */
  preview?: React.ReactNode;
  /** Actions pinned to the bottom (Save, Hold to delete) */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isWide } = useLayout();
  const { width: vw, height: vh } = useWindowDimensions();
  const reduced = useReducedMotion();
  const { mounted, leaving } = usePresence(visible);

  // Where the click came from, captured when the card opens: it grows from that direction.
  // Kept while the card closes, so its entrance isn't rebuilt (and replayed) on the way out.
  const opened = useRef<{ x: number; y: number } | null>(null);
  if (!mounted) opened.current = null;
  else if (visible && !opened.current) {
    opened.current = pointer.x < 0 ? { x: 0, y: 0 } : { x: (pointer.x - vw / 2) * 0.22, y: (pointer.y - vh / 2) * 0.22 };
  }
  const from = opened.current ?? { x: 0, y: 0 };

  if (!mounted) return null;
  const split = isWide && !!preview;

  const backdrop = (
    <Pressable
      accessibilityLabel="Close"
      onPress={onClose}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: c.backdrop },
        web({
          backdropFilter: 'blur(8px) saturate(120%)',
          WebkitBackdropFilter: 'blur(8px) saturate(120%)',
          cursor: 'default',
          animationKeyframes: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
          animationDuration: '220ms',
          animationTimingFunction: motion.easeOut,
          transitionProperty: 'opacity',
          transitionDuration: `${EXIT_MS}ms`,
        }),
        leaving && { opacity: 0 },
      ]}
    />
  );

  const header = (
    <View style={[styles.header, split ? styles.headerSplit : null]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[T.title, { fontSize: isWide ? 26 : 22, lineHeight: isWide ? 32 : 28, color: c.text }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[T.label, { color: c.textMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <IconButton icon="close" label="Close" onPress={onClose} />
    </View>
  );

  const body = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={[{ flexGrow: 0, flexShrink: 1 }, web({ overscrollBehavior: 'contain' })]}
      contentContainerStyle={[styles.body, isWide ? styles.bodyWide : null]}
    >
      {children}
    </ScrollView>
  );

  const footerBar = footer ? (
    <View style={[styles.footer, { borderTopColor: c.hairline, paddingBottom: isWide ? space.xl : Math.max(insets.bottom, space.lg) }]}>{footer}</View>
  ) : null;

  if (isWide) {
    return (
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        <View style={styles.center}>
          {backdrop}
          <View
            accessibilityViewIsModal
            style={[
              styles.card,
              { width: split ? 900 : 540, backgroundColor: c.card },
              split && { height: Math.min(660, vh - 48) },
              shadow(c, 3),
              web({
                animationKeyframes: reduced
                  ? { '0%': { opacity: 0 }, '100%': { opacity: 1 } }
                  : {
                      '0%': { opacity: 0, transform: `translate(${from.x}px, ${from.y}px) scale(0.93)` },
                      '100%': { opacity: 1, transform: 'translate(0px, 0px) scale(1)' },
                    },
                animationDuration: reduced ? '160ms' : '440ms',
                animationTimingFunction: motion.easeDrawer,
                animationFillMode: 'backwards',
                transitionProperty: 'opacity, transform',
                transitionDuration: `${EXIT_MS}ms`,
                transitionTimingFunction: motion.easeOut,
              }),
              leaving && { opacity: 0, transform: [{ scale: 0.97 }] },
            ]}
          >
            {split ? <View style={styles.previewPane}>{preview}</View> : null}
            <View style={[styles.formPane, !split && { maxHeight: vh - 48 }]}>
              {header}
              {body}
              {footerBar}
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        {backdrop}
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: c.card, maxHeight: vh - insets.top - 24 },
            shadow(c, 3),
            web({
              animationKeyframes: reduced
                ? { '0%': { opacity: 0 }, '100%': { opacity: 1 } }
                : { '0%': { transform: 'translateY(100%)' }, '100%': { transform: 'translateY(0%)' } },
              animationDuration: reduced ? '160ms' : '380ms',
              animationTimingFunction: motion.easeDrawer,
              animationFillMode: 'backwards',
              transitionProperty: 'opacity, transform',
              transitionDuration: `${EXIT_MS}ms`,
            }),
            leaving && { opacity: 0, transform: [{ translateY: 40 }] },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: preview ? 'rgba(255,255,255,0.7)' : c.baseline }]} />
          {preview ? <View style={styles.phonePreview}>{preview}</View> : null}
          {header}
          {body}
          {footerBar ?? <View style={{ height: Math.max(insets.bottom, space.lg) }} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Pinned actions: an optional hold-to-delete on the left, the main action on the right. */
export function SheetFooter({ children }: { children: React.ReactNode }) {
  return <View style={styles.footerRow}>{children}</View>;
}

/**
 * Deleting takes a deliberate hold: a coral fill sweeps across the button while you press, and
 * letting go early snaps it back. A quick tap only says "Keep holding". Slow where you decide,
 * instant where the app answers (Emil Kowalski's hold-to-delete pattern).
 */
export function HoldButton({ label, onConfirm, duration = 1000 }: { label: string; onConfirm: () => void; duration?: number }) {
  const c = useColors();
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const start = () => {
    fired.current = false;
    setHint(false);
    setHolding(true);
    timer.current = setTimeout(() => {
      fired.current = true;
      setHolding(false);
      onConfirm();
    }, duration);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    if (!fired.current) setHolding(false);
  };

  const content = (color: string) => (
    <>
      <Icon name="trash-outline" size={16} color={color} weight="bold" />
      <Text style={[T.label, { fontSize: 14, color, fontFamily: 'Geist_600SemiBold' }]} numberOfLines={1}>
        {hint ? 'Keep holding' : label}
      </Text>
    </>
  );

  return (
    <Press
      feedback="soft"
      onPressIn={start}
      onPressOut={stop}
      onPress={() => {
        if (!fired.current) setHint(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold to confirm"
      style={({ hovered }) => [
        styles.hold,
        { backgroundColor: hovered ? `${c.danger}14` : 'transparent', boxShadow: `0 0 0 1px ${c.danger}66` } as object,
      ]}
    >
      <View style={styles.holdInner}>{content(c.danger)}</View>
      {/* the same label in white on coral, revealed left to right while holding */}
      <View
        style={[
          { pointerEvents: 'none' },
          StyleSheet.absoluteFill,
          styles.holdInner,
          { backgroundColor: c.danger },
          isWeb
            ? web({
                clipPath: holding ? 'inset(0 0% 0 0 round 999px)' : 'inset(0 100% 0 0 round 999px)',
                transitionProperty: 'clip-path',
                transitionDuration: holding ? `${duration}ms` : '220ms',
                transitionTimingFunction: holding ? 'linear' : motion.easeOut,
              })
            : { opacity: holding ? 1 : 0 },
        ]}
      >
        {content('#FFF8EC')}
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: { maxWidth: '100%', borderRadius: 32, overflow: 'hidden', flexDirection: 'row' },
  previewPane: { width: '42%', alignSelf: 'stretch' },
  formPane: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  headerSplit: { paddingHorizontal: space.xl, paddingTop: space.xl },
  body: { paddingHorizontal: space.lg, paddingBottom: space.xl, paddingTop: space.sm, gap: space.lg },
  bodyWide: { paddingHorizontal: space.xl },
  footer: { borderTopWidth: 1, paddingTop: space.lg, paddingHorizontal: space.xl },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden' },
  grabber: { position: 'absolute', top: 8, alignSelf: 'center', width: 40, height: 5, borderRadius: 3, zIndex: 3 },
  phonePreview: { height: 212 },
  hold: { height: 48, borderRadius: radius.pill, overflow: 'hidden', justifyContent: 'center' },
  holdInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, height: 48 },
});
