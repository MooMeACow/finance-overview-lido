import React from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, radius, space, useColors } from '../theme';
import { getCategory } from '../lib/categories';
import type { Txn } from '../db/database';
import { Money, Press, Text, type IconName } from './ui';
import { Icon } from '../lido/Icon';

export function TransactionRow({ txn, onPress }: { txn: Txn; onPress: () => void }) {
  const c = useColors();
  const cat = getCategory(txn.category);
  const excluded = txn.excluded === 1;
  const income = txn.amount_cents > 0 && !excluded;
  return (
    <Press
      feedback="soft"
      onPress={onPress}
      accessibilityRole="button"
      style={({ hovered, pressed }) => [styles.row, (hovered || pressed) && { backgroundColor: c.hover }]}
    >
      <View style={[styles.icon, { backgroundColor: income ? c.accentSoft : c.track }]}>
        <Icon name={cat.icon as IconName} size={19} color={c.primary} weight="duotone" duotoneColor={c.primary} />
      </View>
      <View style={styles.middle}>
        <Text style={[styles.desc, { color: c.text }]} numberOfLines={1}>
          {txn.description}
        </Text>
        <Text style={[styles.meta, { color: c.textMuted }]} numberOfLines={1}>
          {cat.label}
          {excluded ? ', not counted' : ''}
          {txn.note ? `, ${txn.note}` : ''}
        </Text>
      </View>
      <Money
        cents={txn.amount_cents}
        currency={txn.currency}
        style={{ ...styles.amount, ...(excluded ? { opacity: 0.45, textDecorationLine: 'line-through' as const } : null) }}
      />
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, paddingHorizontal: space.sm, borderRadius: radius.sm },
  icon: { width: 40, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  middle: { flex: 1, gap: 2, minWidth: 0 },
  desc: { fontFamily: fonts.ui[500], fontSize: 15 },
  meta: { fontFamily: fonts.ui[400], fontSize: 13 },
  amount: { fontFamily: fonts.ui[600], fontSize: 15 },
});
