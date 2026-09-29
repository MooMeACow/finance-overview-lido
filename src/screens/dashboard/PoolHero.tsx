import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, radius, shadow, space, type as T, useColors } from '../../theme';
import { useLayout } from '../../layout';
import { formatMoney } from '../../lib/money';
import { monthLabel } from '../../lib/dates';
import type { LiveAccount } from '../../lib/balances';
import { Text } from '../../lido/Text';
import { Icon } from '../../lido/Icon';
import { Water } from '../../lido/Water';
import { CountUp } from '../../lido/CountUp';
import { OtterRaft, type Mood, type OtterSpec, type RaftLayout } from '../../lido/OtterRaft';
import { isWeb, web } from '../../lido/web';
import { Press } from '../../components/ui';

const WIDE_RAFT: RaftLayout = { x0: 0.5, x1: 0.97, waterline: 0.8, maxR: 50 };
const PHONE_RAFT: RaftLayout = { x0: 0.05, x1: 0.95, waterline: 0.92, maxR: 30 };

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The pool at the top of the dashboard: the overall total sits on the water, with current
 * money, savings and the outlook as glass chips. One otter per account floats on the right,
 * hugging a pebble sized by its balance.
 */
export function PoolHero({
  accounts,
  total,
  current,
  savings,
  expectedCents,
  expectedMonth,
  currency,
  mood,
  intro,
  onOpenAccount,
  onAddAccount,
}: {
  accounts: LiveAccount[];
  total: number;
  current: number;
  savings: number;
  expectedCents: number;
  expectedMonth: string;
  currency: string;
  mood: Mood;
  intro: boolean;
  onOpenAccount: (a: LiveAccount) => void;
  onAddAccount: () => void;
}) {
  const c = useColors();
  const { isWide } = useLayout();
  const empty = accounts.length === 0;

  const otters: OtterSpec[] = useMemo(() => {
    if (empty) return [{ id: -1, label: 'No accounts yet', sub: 'Click to add one', share: 0, kind: 'none' }];
    const ordered = [...accounts.filter((a) => a.type !== 'savings'), ...accounts.filter((a) => a.type === 'savings')].slice(0, 7);
    const max = Math.max(1, ...ordered.map((a) => a.balance_cents));
    return ordered.map((a) => ({
      id: a.id,
      label: a.name,
      sub: formatMoney(a.balance_cents, a.currency),
      share: Math.sqrt(Math.max(0, a.balance_cents) / max),
      kind: a.type === 'savings' ? 'savings' : 'current',
    }));
  }, [accounts, empty]);

  const openOtter = (id: number) => {
    if (id === -1) return onAddAccount();
    const a = accounts.find((x) => x.id === id);
    if (a) onOpenAccount(a);
  };

  const delta = expectedCents - total;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={[styles.pool, isWide ? styles.poolWide : styles.poolPhone, shadow(c, 3)]}>
      <Water radius={isWide ? radius.pool : 30} />
      {/* keeps the words readable over the moving light */}
      <View
        style={[{ pointerEvents: 'none' },
          StyleSheet.absoluteFill,
          web({
            backgroundImage: isWide
              ? 'linear-gradient(90deg, rgba(3,16,60,0.62) 0%, rgba(3,16,60,0.32) 36%, rgba(3,16,60,0) 58%)'
              : 'linear-gradient(180deg, rgba(3,16,60,0.6) 0%, rgba(3,16,60,0.28) 48%, rgba(3,16,60,0) 70%)',
          }),
          !isWeb && { backgroundColor: 'rgba(3,16,60,0.25)' },
        ]}
      />
      <OtterRaft otters={otters} mood={mood} layout={isWide ? WIDE_RAFT : PHONE_RAFT} intro={intro} onPress={openOtter} />

      <View style={[{ pointerEvents: 'box-none' }, styles.content, isWide ? styles.contentWide : styles.contentPhone]}>
        <View style={{ gap: 4 }}>
          <Text style={[T.title, { color: c.heroText, fontSize: isWide ? 22 : 19 }]}>{greeting()}</Text>
          <Text style={[T.label, { color: c.heroMuted }]}>{today}</Text>
        </View>

        {empty ? (
          <View style={{ gap: space.md, maxWidth: 420 }}>
            <Text style={[isWide ? T.display : T.displayPhone, { color: c.heroText }]}>No accounts yet</Text>
            <Text style={[T.body, { color: c.heroMuted }]}>Add each account with its balance and your total shows up here.</Text>
            <Press
              onPress={onAddAccount}
              accessibilityRole="button"
              style={({ hovered }) => [styles.glassButton, { backgroundColor: hovered ? 'rgba(255,248,236,0.26)' : 'rgba(255,248,236,0.18)' }]}
            >
              <Icon name="add" size={18} color={c.heroText} weight="bold" />
              <Text style={[T.bodyStrong, { color: c.heroText, fontFamily: fonts.ui[600] }]}>Add account</Text>
            </Press>
          </View>
        ) : (
          <View style={{ gap: isWide ? 18 : 14 }}>
            <View style={{ gap: 2 }}>
              <Text style={[T.label, { color: c.heroMuted, fontSize: 14 }]}>Overall total</Text>
              <CountUp
                cents={total}
                format={(v) => formatMoney(v, currency)}
                animate={intro}
                style={[isWide ? T.hero : T.heroPhone, { color: c.heroText, fontVariant: ['tabular-nums'] }]}
                centsStyle={{ fontSize: isWide ? 40 : 26, letterSpacing: -1, color: c.heroMuted }}
              />
              <Text style={[T.label, { color: c.heroMuted }]}>
                Across {accounts.length} account{accounts.length === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={styles.chips}>
              <GlassChip label="Current" value={formatMoney(current, currency)} />
              <GlassChip label="Savings & investments" value={formatMoney(savings, currency)} />
              <GlassChip
                label={`Expected by ${monthLabel(expectedMonth, true)} ${expectedMonth.slice(0, 4)}`}
                value={formatMoney(expectedCents, currency)}
                note={delta === 0 ? undefined : `${delta > 0 ? '+' : '-'}${formatMoney(Math.abs(delta), currency)}`}
                noteUp={delta >= 0}
              />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function GlassChip({ label, value, note, noteUp }: { label: string; value: string; note?: string; noteUp?: boolean }) {
  const c = useColors();
  return (
    <View
      style={[
        styles.chip,
        web({ backdropFilter: 'blur(10px) saturate(140%)', WebkitBackdropFilter: 'blur(10px) saturate(140%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 0 0 1px rgba(255,255,255,0.12)' }),
      ]}
    >
      <Text style={[T.small, { color: c.heroMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.chipValueRow}>
        <Text style={{ fontFamily: fonts.ui[600], fontSize: 16, lineHeight: 22, color: c.heroText, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {value}
        </Text>
        {note ? (
          <Text style={{ fontFamily: fonts.ui[600], fontSize: 12, color: noteUp ? '#A6F5DC' : '#FFC3B0', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pool: { borderRadius: radius.pool, overflow: 'hidden' },
  poolWide: { height: 460 },
  poolPhone: { height: 520, borderRadius: 30 },
  content: { position: 'absolute', justifyContent: 'space-between' },
  contentWide: { top: 36, left: 40, bottom: 36, width: '52%' },
  contentPhone: { top: 22, left: 20, right: 20, height: 330 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
    backgroundColor: 'rgba(255,248,236,0.12)',
    minWidth: 150,
  },
  chipValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  glassButton: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 46, paddingHorizontal: 18, borderRadius: radius.pill },
});
