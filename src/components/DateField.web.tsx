import React from 'react';

import { fonts, radius, space, useColors, useIsDark } from '../theme';

/** Web: the browser's own date picker, styled like the other fields. Value is "YYYY-MM-DD". */
export function DateField({ value, onChange, label, optional }: { value: string; onChange: (v: string) => void; label: string; optional?: boolean }) {
  const c = useColors();
  const dark = useIsDark();
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      required={!optional}
      onChange={(e) => onChange(e.currentTarget.value)}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        height: 50,
        padding: `0 ${space.lg}px`,
        borderRadius: radius.md,
        border: `1px solid ${c.hairline}`,
        background: c.cardSunk,
        color: value ? c.text : c.textMuted,
        fontFamily: fonts.ui[500],
        fontSize: 16,
        colorScheme: dark ? 'dark' : 'light',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
    />
  );
}
