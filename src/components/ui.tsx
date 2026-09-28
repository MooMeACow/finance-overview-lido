import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { radius, space, useColors } from '../theme';
import { monthLabel, shiftMonth } from '../lib/dates';
import { formatMoney } from '../lib/money';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardBorder }, style]}>{children}</View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>{children}</Text>
      {right}
    </View>
  );
}

export function ScreenHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.header}>
      <Text style={[styles.headerTitle, { color: c.text }]}>{title}</Text>
      {right}
    </View>
  );
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const c = useColors();
  return (
    <View style={[styles.monthSwitcher, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <IconButton icon="chevron-back" label="Previous month" onPress={() => onChange(shiftMonth(month, -1))} />
      <Text style={[styles.monthText, { color: c.text }]}>{monthLabel(month)}</Text>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={icon} size={size} color={color ?? c.text} />
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.card,
          borderColor: selected ? c.primary : c.cardBorder,
        },
      ]}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? c.onPrimary : c.textSecondary} /> : null}
      <Text style={[styles.chipText, { color: selected ? c.onPrimary : c.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.primary : 'transparent';
  const fg = variant === 'primary' ? c.onPrimary : variant === 'danger' ? c.danger : c.text;
  const border = variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : c.baseline;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
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
  return (
    <Text style={[{ color, fontVariant: ['tabular-nums'] }, style]}>
      {formatMoney(cents, currency, showPlus ? 'always' : 'auto')}
    </Text>
  );
}

export function EmptyState({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={36} color={c.textMuted} />
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.textSecondary }]}>{body}</Text>
    </View>
  );
}

/** Bottom sheet built on the standard Modal */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop }]} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: c.card, paddingBottom: insets.bottom + space.lg }]}>
          <View style={[styles.grabber, { backgroundColor: c.baseline }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: c.text }]}>{title}</Text>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.lg }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const c = useColors();
  return <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>{children}</Text>;
}

export const inputStyle = (c: ReturnType<typeof useColors>): TextStyle => ({
  borderWidth: 1,
  borderColor: c.hairline,
  borderRadius: radius.sm,
  paddingHorizontal: space.md,
  paddingVertical: space.md,
  fontSize: 16,
  color: c.text,
  backgroundColor: c.background,
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  headerTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  monthText: { fontSize: 16, fontWeight: '600' },
  iconButton: { padding: space.sm, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 14, fontWeight: '500' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.xl, gap: space.sm },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginTop: space.sm },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    maxHeight: '90%',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: space.sm },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
});
