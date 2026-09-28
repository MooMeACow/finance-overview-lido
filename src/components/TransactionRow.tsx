import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { space, useColors } from '../theme';
import { getCategory } from '../lib/categories';
import type { Txn } from '../db/database';
import { Money, type IconName } from './ui';

export function TransactionRow({ txn, onPress }: { txn: Txn; onPress: () => void }) {
  const c = useColors();
  const cat = getCategory(txn.category);
  const excluded = txn.excluded === 1;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.track }]}
    >
      <View style={[styles.icon, { backgroundColor: c.track }]}>
        <Ionicons name={cat.icon as IconName} size={18} color={c.textSecondary} />
      </View>
      <View style={styles.middle}>
        <Text style={[styles.desc, { color: c.text }]} numberOfLines={1}>
          {txn.description}
        </Text>
        <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
          {cat.label}
          {excluded ? ' · not counted' : ''}
          {txn.note ? ` · ${txn.note}` : ''}
        </Text>
      </View>
      <Money
        cents={txn.amount_cents}
        currency={txn.currency}
        style={{ ...styles.amount, ...(excluded ? { opacity: 0.45, textDecorationLine: 'line-through' as const } : null) }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderRadius: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, gap: 2 },
  desc: { fontSize: 15, fontWeight: '500' },
  meta: { fontSize: 13 },
  amount: { fontSize: 15, fontWeight: '600' },
});
