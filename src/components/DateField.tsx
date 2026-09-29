import React from 'react';
import { TextInput } from 'react-native';

import { useColors } from '../theme';
import { inputStyle } from './ui';

/** Phone app: a text field for "YYYY-MM-DD" (the web version uses the browser's date picker). */
export function DateField({ value, onChange, label, optional }: { value: string; onChange: (v: string) => void; label: string; optional?: boolean }) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      placeholder={optional ? 'YYYY-MM-DD (optional)' : 'YYYY-MM-DD'}
      placeholderTextColor={c.textMuted}
      accessibilityLabel={label}
      style={inputStyle(c)}
    />
  );
}
