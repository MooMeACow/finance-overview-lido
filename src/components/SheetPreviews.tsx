import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fonts, radius, type as T } from '../theme';
import { useLayout } from '../layout';
import { Text, type IconName } from './ui';
import { Icon } from '../lido/Icon';
import { Water } from '../lido/Water';
import { OtterRaft, type OtterSpec } from '../lido/OtterRaft';
import { OtterPortrait } from '../lido/OtterPortrait';
import { BeadRope } from '../lido/BeadRope';
import { useReducedMotion } from '../lido/motionPrefs';
import { isWeb, web } from '../lido/web';
import { formatMoney, parseAmount } from '../lib/money';
import { getCategory } from '../lib/categories';
import { dayLabel, isValidDay, todayString } from '../lib/dates';
import { frequencyLabel, monthlyEquivalent, occurrences } from '../lib/forecast';
import type { Plan, PlanFrequency } from '../db/types';

/*
 * Live pictures of whatever is being edited, shown on a small pool at the side of the card
 * (or across the top of it on phones). Everything here follows the form as you type.
 */

const CREAM = '#FFF8EC';
const CREAM_SOFT = 'rgba(255,248,236,0.78)';

/** The pool behind every preview, with a scrim that keeps the words readable. */
function PreviewPool({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.pool}>
      <Water radius={0} />
      <View
        style={[
          { pointerEvents: 'none' },
          StyleSheet.absoluteFill,
          web({ backgroundImage: 'linear-gradient(180deg, rgba(3,16,60,0.62) 0%, rgba(3,16,60,0.18) 46%, rgba(3,16,60,0.05) 100%)' }),
          !isWeb && { backgroundColor: 'rgba(3,16,60,0.3)' },
        ]}
      />
      {children}
    </View>
  );
}

/** Slow bobbing for things floating on the water (still with reduced motion). */
function bob(delaySec: number, reduced: boolean, rotate = 0) {
  if (reduced) return rotate ? { transform: [{ rotate: `${rotate}deg` }] } : undefined;
  return web({
    animationKeyframes: {
      '0%': { transform: `translateY(0px) rotate(${rotate}deg)` },
      '50%': { transform: `translateY(-5px) rotate(${rotate + 0.6}deg)` },
      '100%': { transform: `translateY(0px) rotate(${rotate}deg)` },
    },
    animationDuration: '3.4s',
    animationTimingFunction: 'cubic-bezier(0.45, 0, 0.55, 1)',
    animationIterationCount: 'infinite',
    animationDelay: `${-delaySec}s`,
  });
}

function Heading({ kicker, title, compact }: { kicker: string; title: string; compact: boolean }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={[T.label, { color: CREAM_SOFT }]}>{kicker}</Text>
      <Text style={[T.title, { color: CREAM, fontSize: compact ? 19 : 24, lineHeight: compact ? 24 : 30 }]} numberOfLines={2}>
        {title}
      </Text>
    </View>
  );
}

function BigMoney({ cents, currency, sign, compact }: { cents: number; currency: string; sign?: 'always'; compact: boolean }) {
  const text = formatMoney(cents, currency, sign ?? 'auto');
  const dot = text.lastIndexOf('.');
  return (
    <Text
      style={{ fontFamily: fonts.display[700], fontSize: compact ? 34 : 46, lineHeight: compact ? 38 : 50, letterSpacing: -1.4, color: CREAM, fontVariant: ['tabular-nums'] }}
      numberOfLines={1}
      adjustsFontSizeToFit
    >
      {dot < 0 ? text : text.slice(0, dot)}
      {dot < 0 ? null : <Text style={{ fontSize: compact ? 20 : 26, color: CREAM_SOFT }}>{text.slice(dot)}</Text>}
    </Text>
  );
}

// ---------- Account ----------

const RAFT_WIDE = { x0: 0.18, x1: 0.82, waterline: 0.86, maxR: 70 };
const RAFT_PHONE = { x0: 0.58, x1: 0.96, waterline: 0.9, maxR: 42 };

/**
 * The account's own otter rises out of the water. Its pebble grows and shrinks with the
 * balance you type, and turns from sand stone into sea glass when you mark it as savings.
 */
export function AccountPreview({
  id,
  name,
  type,
  balance,
  currency,
  largestCents,
}: {
  id: number | null;
  name: string;
  type: 'current' | 'savings';
  balance: string;
  currency: string;
  /** The largest balance among the other accounts, so the pebble is sized like in the pool */
  largestCents: number;
}) {
  const { isWide } = useLayout();
  const compact = !isWide;
  const cents = parseAmount(balance) ?? 0;
  const share = Math.sqrt(Math.max(0, cents) / Math.max(1, largestCents, cents));
  const title = name.trim() || 'New account';
  const otters: OtterSpec[] = useMemo(
    () => [{ id: id ?? -99, label: title, sub: formatMoney(cents, currency), share, kind: type }],
    [id, title, cents, currency, share, type],
  );
  return (
    <PreviewPool>
      <OtterRaft otters={otters} mood="good" layout={compact ? RAFT_PHONE : RAFT_WIDE} intro />
      <View style={[styles.textBlock, compact && styles.textBlockPhone]}>
        <Heading kicker={type === 'savings' ? 'Savings & investments' : 'Current account'} title={title} compact={compact} />
        <BigMoney cents={cents} currency={currency} compact={compact} />
      </View>
    </PreviewPool>
  );
}

// ---------- Plan ----------

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** The next dates float by as buoys, with what the plan costs (or brings) a month. */
export function PlanPreview({
  kind,
  description,
  amount,
  frequency,
  startDate,
  endDate,
  currency,
}: {
  kind: 'income' | 'expense';
  description: string;
  amount: string;
  frequency: PlanFrequency;
  startDate: string;
  endDate: string;
  currency: string;
}) {
  const { isWide } = useLayout();
  const compact = !isWide;
  const reduced = useReducedMotion();
  const cents = Math.abs(parseAmount(amount) ?? 0);
  const valid = isValidDay(startDate);
  const plan: Plan = {
    id: 0,
    kind,
    description,
    amount_cents: cents,
    category: 'other',
    frequency,
    start_date: valid ? startDate : todayString(),
    end_date: frequency !== 'once' && isValidDay(endDate) ? endDate : null,
  };
  const today = todayString();
  const next = valid ? occurrences(plan, today, addDays(today, 540)).slice(0, compact ? 3 : 4) : [];
  const perMonth = monthlyEquivalent(plan);
  const income = kind === 'income';

  return (
    <PreviewPool>
      <View style={[styles.textBlock, compact && styles.textBlockPhone, { right: compact ? 16 : 28 }]}>
        <Heading kicker={income ? 'Expected income' : 'Planned expense'} title={description.trim() || (income ? 'New income' : 'New expense')} compact={compact} />
        <BigMoney cents={income ? cents : -cents} currency={currency} sign="always" compact={compact} />
        <Text style={[T.label, { color: CREAM_SOFT }]}>
          {valid ? frequencyLabel(plan) : 'Pick a date'}
          {perMonth && frequency === 'yearly' ? `, about ${formatMoney(perMonth, currency)} a month` : ''}
        </Text>
      </View>
      <View style={[styles.buoys, compact ? styles.buoysPhone : styles.buoysWide]}>
        {next.length === 0 ? (
          <Text style={[T.label, { color: CREAM_SOFT }]}>{valid ? 'No dates coming up' : ''}</Text>
        ) : (
          next.map((d, i) => (
            <View key={d} style={[styles.buoy, glassStyle(), bob(i * 0.8, reduced, i % 2 === 0 ? -1.5 : 1.5)]}>
              <View style={[styles.buoyDot, { backgroundColor: income ? '#8DEBFF' : '#FFC95C' }]} />
              <Text style={{ fontFamily: fonts.ui[600], fontSize: compact ? 13 : 15, color: CREAM }}>{dayLabel(d)}</Text>
              {i === 0 ? <Text style={[T.small, { color: CREAM_SOFT }]}>next</Text> : null}
            </View>
          ))
        )}
      </View>
    </PreviewPool>
  );
}

// ---------- Budget ----------

/** A big lane rope on the water that fills as you change the limit. */
export function BudgetPreview({ category, limit, spentCents, currency }: { category: string; limit: string; spentCents: number; currency: string }) {
  const { isWide } = useLayout();
  const compact = !isWide;
  const info = getCategory(category);
  const cents = parseAmount(limit) ?? 0;
  const value = cents > 0 ? spentCents / cents : spentCents > 0 ? 2 : 0;
  const over = cents > 0 && spentCents > cents;
  return (
    <PreviewPool>
      <View style={[styles.textBlock, compact && styles.textBlockPhone, { right: compact ? 16 : 28 }]}>
        <View style={[styles.catTile, glassStyle()]}>
          <Icon name={info.icon as IconName} size={compact ? 22 : 28} color={CREAM} weight="duotone" duotoneColor={CREAM} />
        </View>
        <Heading kicker="Monthly budget" title={info.label} compact={compact} />
        <BigMoney cents={cents} currency={currency} compact={compact} />
      </View>
      <View style={[styles.ropeBlock, compact && styles.ropeBlockPhone]}>
        <BeadRope value={value} beads={compact ? 18 : 16} tone="water" height={compact ? 12 : 16} />
        <Text style={[T.label, { color: over ? '#FFC3B0' : CREAM }]}>
          {cents <= 0
            ? `${formatMoney(spentCents, currency)} spent this month`
            : over
              ? `Over by ${formatMoney(spentCents - cents, currency)} this month`
              : `${formatMoney(spentCents, currency)} spent, ${formatMoney(cents - spentCents, currency)} left this month`}
        </Text>
      </View>
    </PreviewPool>
  );
}

// ---------- Debt ----------

function seedFor(name: string): number {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) || 3;
}

/** You and them, with a pebble hopping over to whoever is owed. */
export function DebtPreview({ person, direction, amount, currency }: { person: string; direction: 'owed_to_me' | 'i_owe'; amount: string; currency: string }) {
  const { isWide } = useLayout();
  const compact = !isWide;
  const reduced = useReducedMotion();
  const cents = parseAmount(amount) ?? 0;
  const them = person.trim() || 'Them';
  const toMe = direction === 'owed_to_me';
  const size = compact ? 56 : 84;
  const hop = compact ? 110 : 150;
  // the pebble travels from whoever owes to whoever is owed
  const fromX = toMe ? hop / 2 : -hop / 2;
  const toX = -fromX;
  return (
    <PreviewPool>
      <View style={[styles.textBlock, compact && styles.textBlockPhone, { right: compact ? 16 : 28 }]}>
        <Heading kicker={toMe ? `${them} owes you` : `You owe ${them}`} title={toMe ? 'Money coming back' : 'Money to pay back'} compact={compact} />
        <BigMoney cents={cents} currency={currency} compact={compact} />
      </View>
      <View style={[styles.duo, compact && styles.duoPhone]}>
        <View style={styles.duoSide}>
          <OtterPortrait size={size} seed={5} background="#1F4FE0" />
          <Text style={[T.label, { color: CREAM }]}>You</Text>
        </View>
        <View style={{ width: hop, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={hop} height={size * 0.6} style={{ position: 'absolute', top: 0 }}>
            <Path d={`M 4 ${size * 0.55} Q ${hop / 2} ${-size * 0.3} ${hop - 4} ${size * 0.55}`} stroke="rgba(255,248,236,0.45)" strokeWidth={2} strokeDasharray="4 6" fill="none" />
          </Svg>
          <View
            key={direction}
            style={[
              styles.pebble,
              reduced
                ? { transform: [{ translateX: toX * 0.6 }] }
                : web({
                    animationKeyframes: {
                      '0%': { transform: `translate(${fromX}px, 6px)` },
                      '45%': { transform: `translate(0px, -${size * 0.42}px)` },
                      '80%': { transform: `translate(${toX}px, 6px)` },
                      '100%': { transform: `translate(${toX}px, 6px)` },
                    },
                    animationDuration: '2.2s',
                    animationTimingFunction: 'cubic-bezier(0.45, 0, 0.55, 1)',
                    animationIterationCount: 'infinite',
                  }),
            ]}
          />
        </View>
        <View style={styles.duoSide}>
          <OtterPortrait size={size} seed={seedFor(them)} background="#0E8F9E" />
          <Text style={[T.label, { color: CREAM }]} numberOfLines={1}>
            {them}
          </Text>
        </View>
      </View>
    </PreviewPool>
  );
}

// ---------- Transaction ----------

/** The transaction as a paper receipt floating on the water. */
export function ReceiptPreview({
  description,
  date,
  amountCents,
  currency,
  category,
  note,
  excluded,
}: {
  description: string;
  date: string;
  amountCents: number;
  currency: string;
  category: string;
  note?: string;
  excluded?: boolean;
}) {
  const { isWide } = useLayout();
  const compact = !isWide;
  const reduced = useReducedMotion();
  const info = getCategory(category);
  const income = amountCents > 0;
  return (
    <PreviewPool>
      <View style={[styles.receiptWrap, compact && styles.receiptWrapPhone]}>
        <View style={[styles.receipt, compact && styles.receiptPhone, bob(0, reduced, compact ? 0 : -2.5)]}>
          <View style={styles.receiptTop}>
            <View style={[styles.receiptIcon, { backgroundColor: 'rgba(31,79,224,0.1)' }]}>
              <Icon name={info.icon as IconName} size={compact ? 18 : 22} color="#1F4FE0" weight="duotone" duotoneColor="#1F4FE0" />
            </View>
            <Text style={[T.label, { color: '#44527A', flex: 1 }]} numberOfLines={1}>
              {info.label}
            </Text>
          </View>
          <Text style={[T.title, { color: '#0E1B3D', fontSize: compact ? 17 : 21, lineHeight: compact ? 22 : 26 }]} numberOfLines={2}>
            {description.trim() || 'New transaction'}
          </Text>
          {!compact ? <Text style={[T.small, { color: '#6E7CA0' }]}>{isValidDay(date.slice(0, 10)) ? dayLabel(date) : 'Pick a date'}</Text> : null}
          <View style={styles.dashed} />
          <Text
            style={[
              { fontFamily: fonts.display[700], fontSize: compact ? 26 : 34, lineHeight: compact ? 30 : 40, letterSpacing: -1, color: income ? '#0B7F60' : '#0E1B3D', fontVariant: ['tabular-nums'] },
              excluded && { textDecorationLine: 'line-through', opacity: 0.5 },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(amountCents, currency, 'always')}
          </Text>
          {excluded ? <Text style={[T.small, { color: '#6E7CA0' }]}>Not counted in totals</Text> : null}
          {note && !compact ? (
            <Text style={[T.small, { color: '#44527A', fontFamily: fonts.ui[500] }]} numberOfLines={2}>
              {note}
            </Text>
          ) : null}
          <Svg width="100%" height={10} viewBox="0 0 200 10" preserveAspectRatio="none" style={styles.zigzag}>
            <Path d="M0 0 L200 0 L200 2 L195 8 L190 2 L185 8 L180 2 L175 8 L170 2 L165 8 L160 2 L155 8 L150 2 L145 8 L140 2 L135 8 L130 2 L125 8 L120 2 L115 8 L110 2 L105 8 L100 2 L95 8 L90 2 L85 8 L80 2 L75 8 L70 2 L65 8 L60 2 L55 8 L50 2 L45 8 L40 2 L35 8 L30 2 L25 8 L20 2 L15 8 L10 2 L5 8 L0 2 Z" fill="#FFFDF8" />
          </Svg>
        </View>
      </View>
    </PreviewPool>
  );
}

function glassStyle() {
  return [
    { backgroundColor: 'rgba(255,248,236,0.14)' },
    web({
      backdropFilter: 'blur(10px) saturate(140%)',
      WebkitBackdropFilter: 'blur(10px) saturate(140%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24), 0 0 0 1px rgba(255,255,255,0.12)',
    }),
  ];
}

const styles = StyleSheet.create({
  pool: { flex: 1, overflow: 'hidden' },
  textBlock: { position: 'absolute', top: 28, left: 28, right: 28, gap: 10 },
  textBlockPhone: { top: 22, left: 18, right: '44%', gap: 6 },
  buoys: { position: 'absolute' },
  buoysWide: { left: 28, right: 28, bottom: 32, gap: 10, alignItems: 'flex-start' },
  buoysPhone: { right: 16, bottom: 18, gap: 6, alignItems: 'flex-end' },
  buoy: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill },
  buoyDot: { width: 9, height: 9, borderRadius: 5 },
  catTile: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  ropeBlock: { position: 'absolute', left: 28, right: 28, bottom: 36, gap: 12 },
  ropeBlockPhone: { left: 18, right: 18, bottom: 18, gap: 8 },
  duo: { position: 'absolute', left: 20, right: 20, bottom: 36, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  duoPhone: { left: '46%', right: 10, bottom: 22 },
  duoSide: { alignItems: 'center', gap: 6, width: 96 },
  pebble: { width: 22, height: 17, borderRadius: 9, backgroundColor: '#8DE3DA', boxShadow: 'inset -2px -3px 0 rgba(20,90,110,0.35), inset 2px 2px 0 rgba(255,255,255,0.6)' } as object,
  receiptWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 36 },
  receiptWrapPhone: { padding: 18, alignItems: 'flex-end' },
  receipt: { width: '100%', maxWidth: 290, backgroundColor: '#FFFDF8', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 26, gap: 8, boxShadow: '0 24px 50px -24px rgba(0,8,32,0.8)' } as object,
  receiptPhone: { maxWidth: 230, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 20, gap: 5 },
  receiptTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  receiptIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dashed: { height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(14,27,61,0.16)', marginVertical: 4 },
  zigzag: { position: 'absolute', left: 0, right: 0, bottom: -9 },
});
