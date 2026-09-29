import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CATEGORIES, type CategoryKey } from '../lib/categories';
import { radius, type as T, useColors } from '../theme';
import { Press, Text, type IconName } from './ui';
import { Icon } from '../lido/Icon';

/** Categories as a grid of icon tiles; the chosen one fills with the accent. */
export function CategoryPicker({ value, onChange, exclude }: { value: string; onChange: (k: CategoryKey) => void; exclude?: CategoryKey[] }) {
  const c = useColors();
  const list = exclude ? CATEGORIES.filter((cat) => !exclude.includes(cat.key)) : CATEGORIES;
  return (
    <View style={styles.grid} accessibilityRole="radiogroup">
      {list.map((cat) => {
        const on = value === cat.key;
        return (
          <Press
            key={cat.key}
            feedback="press"
            onPress={() => onChange(cat.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={cat.label}
            style={({ hovered }) => [
              styles.tile,
              { backgroundColor: on ? c.primary : hovered ? c.hover : c.cardSunk },
              on && ({ boxShadow: '0 8px 18px -10px rgba(31,79,224,0.8)' } as object),
            ]}
          >
            <Icon name={cat.icon as IconName} size={20} color={on ? c.onPrimary : c.primary} weight={on ? 'fill' : 'duotone'} duotoneColor={c.primary} />
            <Text style={[T.small, { fontSize: 11.5, lineHeight: 14, textAlign: 'center', color: on ? c.onPrimary : c.textSecondary, fontFamily: on ? 'Geist_600SemiBold' : 'Geist_500Medium' }]} numberOfLines={2}>
              {cat.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexBasis: '22%',
    flexGrow: 1,
    maxWidth: '25%',
    minHeight: 68,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
});
