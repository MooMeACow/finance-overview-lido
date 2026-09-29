import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { fonts, motion, radius, space, type as T, useColors } from '../theme';
import { currencySymbol } from '../lib/money';
import { Press, Text } from './ui';
import { transition, web } from '../lido/web';

/** A money amount in display type, with the currency sign sitting inside the field. */
export function AmountField({
  value,
  onChange,
  currency = 'EUR',
  placeholder = '0.00',
  allowNegative,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  currency?: string;
  placeholder?: string;
  allowNegative?: boolean;
  label: string;
}) {
  const c = useColors();
  return (
    <View style={[styles.amount, { backgroundColor: c.cardSunk, borderColor: c.hairline }]}>
      <Text style={[styles.sign, { color: c.textMuted }]}>{currencySymbol(currency).trim()}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={allowNegative ? 'numbers-and-punctuation' : 'decimal-pad'}
        inputMode="decimal"
        placeholder={placeholder}
        placeholderTextColor={c.textMuted}
        accessibilityLabel={label}
        style={[styles.amountInput, { color: c.text }, web({ outlineStyle: 'none', boxShadow: 'none', borderWidth: 0 })]}
      />
    </View>
  );
}

/** One choice from a short list, each option with a line of explanation. */
export function RadioList<K extends string | null>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; hint?: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.radioList, { backgroundColor: c.cardSunk }]} accessibilityRole="radiogroup">
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <Press
            key={String(o.key)}
            feedback="soft"
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={({ hovered }) => [
              styles.radioRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: c.hairline },
              hovered && { backgroundColor: c.hover },
            ]}
          >
            <View style={[styles.radio, { borderColor: on ? c.primary : c.baseline }, transition(['border-color'], motion.hover)]}>
              <View
                style={[
                  styles.radioDot,
                  { backgroundColor: c.primary, transform: [{ scale: on ? 1 : 0.25 }], opacity: on ? 1 : 0 },
                  transition(['transform', 'opacity'], 180),
                ]}
              />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[T.bodyStrong, { color: c.text, fontSize: 14 }]}>{o.label}</Text>
              {o.hint ? <Text style={[T.small, { color: c.textMuted }]}>{o.hint}</Text> : null}
            </View>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingLeft: space.lg, paddingRight: space.sm, height: 64 },
  sign: { fontFamily: fonts.display[600], fontSize: 26, marginRight: 8 },
  amountInput: { flex: 1, height: '100%', fontFamily: fonts.display[700], fontSize: 30, letterSpacing: -0.6, paddingVertical: 0 },
  radioList: { borderRadius: radius.md, overflow: 'hidden' },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12, paddingHorizontal: space.lg },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
