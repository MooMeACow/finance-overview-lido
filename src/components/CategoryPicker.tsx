import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CATEGORIES, type CategoryKey } from '../lib/categories';
import { space } from '../theme';
import { Chip, type IconName } from './ui';

export function CategoryPicker({ value, onChange }: { value: string; onChange: (k: CategoryKey) => void }) {
  return (
    <View style={styles.wrap}>
      {CATEGORIES.map((cat) => (
        <Chip
          key={cat.key}
          label={cat.label}
          icon={cat.icon as IconName}
          selected={value === cat.key}
          onPress={() => onChange(cat.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
