import React from 'react';
import {
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion, radius, shadow, space, type as T, useColors, type Colors } from '../theme';
import { useLayout } from '../layout';
import { monthLabel, shiftMonth } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { Text } from '../lido/Text';
import { Icon, type IconName } from '../lido/Icon';
import { OtterPortrait } from '../lido/OtterPortrait';
import { isWeb, transition, web } from '../lido/web';

export type { IconName };
export { Text };

/** Height of the floating navigation, so pages can start below it. */
export const TOP_BAR = 64;

/** Space a page keeps clear for the floating top bar (desktop) or header and dock (phones). */
export function usePagePadding() {
  const { isWide } = useLayout();
  const insets = useSafeAreaInsets();
  return isWide
    ? { top: TOP_BAR + 40, bottom: space.xxl * 2 }
    : { top: insets.top + 68, bottom: insets.bottom + 112 };
}

// ---------- Pressables ----------

type PressState = { pressed: boolean; hovered?: boolean; focused?: boolean };

/**
 * A pressable with the house feedback: scale 0.96 on press (CSS `:active` on the web so it
 * responds the instant a finger lands, a pressed style on the phone app), hover colour
 * only for real pointers, and transitions on exactly the properties that change.
 */
export function Press({
  style,
  feedback = 'press',
  children,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  style?: (s: PressState) => StyleProp<ViewStyle>;
  feedback?: 'press' | 'soft' | 'none';
  children?: React.ReactNode | ((s: PressState) => React.ReactNode);
}) {
  const extra = isWeb && feedback !== 'none' ? { dataSet: { press: feedback === 'soft' ? 'soft' : '' } } : {};
  return (
    <Pressable
      {...rest}
      {...(extra as object)}
      style={(s) => {
        const st = s as PressState;
        return [
          transition(['scale', 'background-color', 'box-shadow', 'opacity', 'border-color'], motion.press),
          style?.(st),
          !isWeb && st.pressed && feedback !== 'none' ? { transform: [{ scale: feedback === 'soft' ? 0.985 : 0.96 }] } : null,
        ];
      }}
    >
      {children as React.ReactNode}
    </Pressable>
  );
}

// ---------- Surfaces ----------

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.tile, { backgroundColor: c.card }, shadow(c, 1), style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[T.title, { color: c.text }]}>{children}</Text>
      {right}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  right,
  before,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Something shown in front of the title, like month arrows */
  before?: React.ReactNode;
}) {
  const c = useColors();
  const { isWide } = useLayout();
  return (
    <View style={[styles.header, !isWide && styles.headerPhone]}>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <View style={styles.inline}>
          {before}
          <Text style={[isWide ? T.display : T.displayPhone, { color: c.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {subtitle ? <Text style={[T.body, { color: c.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Scrollable page body: roomy and width-limited on desktop, compact on phones. */
export function Page({ children }: { children: React.ReactNode }) {
  const { isWide } = useLayout();
  const pad = usePagePadding();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={web({ overscrollBehavior: 'contain' })}
      contentContainerStyle={[styles.page, isWide && styles.pageWide, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
    >
      <View style={[styles.pageInner, isWide && styles.pageInnerWide]}>{children}</View>
    </ScrollView>
  );
}

/** A tile with its own title bar, like a dashboard widget. */
export function Panel({
  title,
  subtitle,
  right,
  children,
  style,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle | (ViewStyle | undefined | false)[];
  padded?: boolean;
}) {
  const c = useColors();
  const { isWide } = useLayout();
  return (
    <View
      style={[
        styles.tile,
        styles.panel,
        !isWide && styles.tilePhone,
        { backgroundColor: c.card },
        shadow(c, 1),
        !padded && { paddingHorizontal: 0 },
        style,
      ]}
    >
      {title ? (
        <View style={[styles.panelHeader, !padded && { paddingHorizontal: isWide ? 24 : 18 }]}>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={[T.title, { color: c.text }]} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <Text style={[T.label, { color: c.textMuted }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * Lays children out side by side on wide screens (with optional relative
 * widths) and stacked on narrow ones.
 */
export function Columns({
  children,
  weights,
  breakpoint = 'medium',
}: {
  children: React.ReactNode;
  weights?: number[];
  breakpoint?: 'medium' | 'wide';
}) {
  const { isWide, isMedium } = useLayout();
  const sideBySide = breakpoint === 'wide' ? isWide : isMedium;
  const items = React.Children.toArray(children).filter(Boolean);
  if (!sideBySide) return <View style={styles.stack}>{items}</View>;
  return (
    <View style={styles.columns}>
      {items.map((child, i) => (
        <View key={i} style={{ flex: weights?.[i] ?? 1, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/** A key number: small label, the number in display type, an optional hint. */
export function KpiCard({
  label,
  value,
  hint,
  icon,
  swatch,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: IconName;
  swatch?: string;
  tone?: 'default' | 'hero';
}) {
  const c = useColors();
  const hero = tone === 'hero';
  const fg = hero ? c.heroText : c.text;
  const muted = hero ? c.heroMuted : c.textMuted;
  return (
    <View
      style={[
        styles.tile,
        styles.kpi,
        hero ? { backgroundColor: c.hero } : { backgroundColor: c.card },
        hero ? web({ backgroundImage: 'radial-gradient(120% 140% at 90% 0%, #3AAEEA 0%, #1D5BE0 48%, #0E3597 100%)' }) : null,
        shadow(c, hero ? 2 : 1),
      ]}
    >
      <View style={styles.inline}>
        {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
        {icon ? <Icon name={icon} size={16} color={muted} weight="bold" /> : null}
        <Text style={[T.label, { color: muted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[T.number, { color: fg, fontVariant: ['tabular-nums'] }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? (
        <Text style={[T.small, { color: muted }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** Row of key numbers: across on desktop, two across on phones. */
export function KpiRow({ children }: { children: React.ReactNode }) {
  const { isMedium } = useLayout();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.kpiRow}>
      {items.map((child, i) => (
        <View key={i} style={{ flexBasis: isMedium ? 0 : '47%', flexGrow: 1, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

// ---------- Controls ----------

export function MonthSwitcher({ month, onChange, size = 'md' }: { month: string; onChange: (m: string) => void; size?: 'md' | 'lg' }) {
  const c = useColors();
  const lg = size === 'lg';
  return (
    <View style={[styles.monthSwitcher, { backgroundColor: c.card }, shadow(c, 1)]}>
      <IconButton icon="chevron-back" label="Previous month" onPress={() => onChange(shiftMonth(month, -1))} />
      <Text
        style={[lg ? T.title : { ...T.bodyStrong, fontSize: 16 }, { color: c.text, minWidth: lg ? 170 : 132, textAlign: 'center', fontVariant: ['tabular-nums'] }]}
        accessibilityLiveRegion="polite"
      >
        {monthLabel(month)}
      </Text>
      <IconButton icon="chevron-forward" label="Next month" onPress={() => onChange(shiftMonth(month, 1))} />
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 20,
  color,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
}) {
  const c = useColors();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ hovered }) => [styles.iconButton, hovered && { backgroundColor: c.hover }]}
    >
      <Icon name={icon} size={size} color={color ?? c.text} weight="bold" />
    </Press>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const c = useColors();
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ hovered }) => [
        styles.chip,
        selected ? { backgroundColor: c.primary } : { backgroundColor: hovered ? c.hover : c.card },
        !selected && ringStyle(c),
      ]}
    >
      {icon ? <Icon name={icon} size={15} color={selected ? c.onPrimary : c.textSecondary} weight={selected ? 'fill' : 'regular'} /> : null}
      <Text style={[T.label, { fontSize: 14, color: selected ? c.onPrimary : c.text }]}>{label}</Text>
    </Press>
  );
}

/** A small segmented control (All / Money in / Money out). */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.segment, { backgroundColor: c.track }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            feedback="soft"
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.key)}
            style={({ hovered }) => [styles.segmentItem, on ? [{ backgroundColor: c.card }, shadow(c, 1)] : hovered ? { backgroundColor: c.hover } : null]}
          >
            <Text style={[T.label, { fontSize: 14, color: on ? c.text : c.textSecondary }]}>{o.label}</Text>
          </Press>
        );
      })}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  size = 'md',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  size?: 'md' | 'sm';
}) {
  const c = useColors();
  const fg = variant === 'primary' ? c.onPrimary : variant === 'danger' ? c.danger : c.text;
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ hovered }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        variant === 'primary'
          ? [
              { backgroundColor: hovered ? c.primaryPressed : c.primary },
              web({ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 24px -12px rgba(31,79,224,0.75)' }),
            ]
          : [{ backgroundColor: hovered ? c.hover : c.card }, ringStyle(c, variant === 'danger' ? c.danger : undefined)],
        disabled && { opacity: 0.4 },
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} color={fg} weight="bold" /> : null}
      <Text style={[T.bodyStrong, { color: fg, fontSize: size === 'sm' ? 14 : 15 }, { fontFamily: 'Geist_600SemiBold' }]} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

/** Compact pill action for panel headers ("Add", "Income", ...). */
export function SmallAction({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const c = useColors();
  return (
    <Press
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered }) => [styles.smallAction, { backgroundColor: hovered ? c.accentSoft : c.track }]}
    >
      <Icon name={icon} size={15} color={c.primary} weight="bold" />
      <Text style={[T.label, { color: c.primary, fontFamily: 'Geist_600SemiBold' }]}>{label}</Text>
    </Press>
  );
}

export function Money({
  cents,
  currency,
  style,
  showPlus = true,
}: {
  cents: number;
  currency: string;
  style?: TextStyle;
  showPlus?: boolean;
}) {
  const c = useColors();
  const color = cents > 0 ? c.positive : c.text;
  return <Text style={[{ color, fontVariant: ['tabular-nums'] }, style]}>{formatMoney(cents, currency, showPlus ? 'always' : 'auto')}</Text>;
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      {isWeb ? <OtterPortrait size={72} seed={title.length * 31} background={c.primary} /> : <Icon name={icon} size={40} color={c.textMuted} weight="duotone" duotoneColor={c.primary} />}
      <Text style={[T.title, { color: c.text, marginTop: space.sm }]}>{title}</Text>
      <Text style={[T.body, { color: c.textSecondary, textAlign: 'center', maxWidth: 420 }]}>{body}</Text>
    </View>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const c = useColors();
  return <Text style={[T.label, { color: c.textSecondary, marginBottom: 8 }]}>{children}</Text>;
}

export const inputStyle = (c: Colors): TextStyle => ({
  borderWidth: 1,
  borderColor: c.hairline,
  borderRadius: radius.md,
  // longhands, so a caller can override one side (e.g. room for a search icon)
  paddingLeft: space.lg,
  paddingRight: space.lg,
  paddingTop: 13,
  paddingBottom: 13,
  fontSize: 16,
  fontFamily: 'Geist_400Regular',
  color: c.text,
  backgroundColor: c.cardSunk,
  ...(web({ transitionProperty: 'border-color, box-shadow', transitionDuration: '150ms' }) ?? {}),
});

/** A 1px ring drawn as a shadow (so it sits on any background) plus a soft lift. */
export function ringStyle(c: Colors, color?: string): ViewStyle {
  const isDarkRing = c.background === '#07122E';
  const ring = color ? `0 0 0 1px ${color}55` : isDarkRing ? '0 0 0 1px rgba(210,222,255,0.12)' : '0 0 0 1px rgba(14,27,61,0.10)';
  return { boxShadow: `${ring}, 0 1px 2px rgba(14,27,61,0.06)` } as ViewStyle;
}

export function useMonthLabel(month: string) {
  return monthLabel(month);
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.lg,
    padding: space.xl,
  },
  tilePhone: { padding: 18, borderRadius: 24 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.lg,
    paddingBottom: space.sm,
  },
  headerPhone: { alignItems: 'center', paddingBottom: 0 },
  page: { paddingHorizontal: space.lg },
  pageWide: { paddingHorizontal: space.xxl },
  pageInner: { width: '100%', gap: space.lg },
  pageInnerWide: { maxWidth: 1240, alignSelf: 'center', gap: space.xl },
  panel: { gap: space.lg },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, minHeight: 32 },
  columns: { flexDirection: 'row', gap: space.xl, alignItems: 'stretch' },
  stack: { gap: space.lg },
  kpi: { gap: 8, height: '100%', padding: 22 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
  },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
  },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, gap: 2 },
  segmentItem: { paddingHorizontal: 14, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    paddingLeft: 22,
    paddingRight: 22,
    borderRadius: radius.pill,
  },
  buttonSm: { height: 36, paddingLeft: 14, paddingRight: 16 },
  smallAction: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingLeft: 10, paddingRight: 12, borderRadius: radius.pill },
  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm },
});
