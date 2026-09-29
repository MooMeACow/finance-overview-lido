import './src/lido/setup';

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';

import { DbProvider } from './src/db/provider';
import { AppStateProvider } from './src/state';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { MonthlyScreen } from './src/screens/MonthlyScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { ImportScreen } from './src/screens/ImportScreen';
import { Press, Text, TOP_BAR, type IconName } from './src/components/ui';
import { motion, radius, shadow, space, type as T, useColors } from './src/theme';
import { useLayout } from './src/layout';
import { SyncBanner, SyncSheet, syncLabel } from './src/components/SyncControls';
import { useSyncState } from './src/sync/useSync';
import { Backdrop } from './src/lido/Backdrop';
import { DialogHost } from './src/lido/DialogHost';
import { Icon } from './src/lido/Icon';
import { OtterPortrait } from './src/lido/OtterPortrait';
import { isWeb, transition, web } from './src/lido/web';
import { useReducedMotion } from './src/lido/motionPrefs';
import { isDemo, useDemoData } from './src/lido/demo';

type Tab = 'dashboard' | 'monthly' | 'transactions' | 'import';

const TABS: { key: Tab; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', iconActive: 'grid' },
  { key: 'monthly', label: 'Monthly', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'transactions', label: 'Transactions', icon: 'list-outline', iconActive: 'list' },
  { key: 'import', label: 'Import', icon: 'cloud-upload-outline', iconActive: 'cloud-upload' },
];

export default function App() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
  });
  // Never let a slow font keep the app from showing
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);
  // The public demo fills storage with the mock year before anything reads it
  const demoReady = useDemoData();
  const ready = (loaded || !!error || waited) && demoReady;

  return (
    <SafeAreaProvider>
      {ready ? (
        <DbProvider>
          <AppStateProvider>
            <Main />
          </AppStateProvider>
        </DbProvider>
      ) : (
        <Splash />
      )}
    </SafeAreaProvider>
  );
}

function Splash() {
  const c = useColors();
  return <View style={{ flex: 1, backgroundColor: isWeb ? 'transparent' : c.background }} />;
}

function Main() {
  const c = useColors();
  const { isWide } = useLayout();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  const go = (t: Tab) => {
    if (t !== 'transactions') setCategoryFilter(null);
    setTab(t);
  };

  return (
    <View style={[styles.root, { backgroundColor: isWeb ? 'transparent' : c.background }]}>
      <StatusBar style="auto" />
      <Backdrop />
      <View
        key={tab}
        style={[
          styles.screen,
          // tabs are peers: no slide, just a quick fade so the swap doesn't flash
          web({
            animationKeyframes: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
            animationDuration: reduced ? '1ms' : '160ms',
            animationTimingFunction: motion.easeOut,
          }),
        ]}
      >
        {tab === 'dashboard' ? <DashboardScreen onOpenMonthly={() => go('monthly')} /> : null}
        {tab === 'monthly' ? (
          <MonthlyScreen
            onImport={() => go('import')}
            onShowCategory={(cat) => {
              setCategoryFilter(cat);
              setTab('transactions');
            }}
          />
        ) : null}
        {tab === 'transactions' ? (
          <TransactionsScreen categoryFilter={categoryFilter} onClearCategory={() => setCategoryFilter(null)} />
        ) : null}
        {tab === 'import' ? <ImportScreen onDone={() => go('monthly')} onOpenSync={() => setSyncOpen(true)} /> : null}
      </View>

      {isWide ? <TopBar active={tab} onChange={go} onOpenSync={() => setSyncOpen(true)} /> : <PhoneHeader onOpenSync={() => setSyncOpen(true)} />}
      {isWide ? null : <Dock active={tab} onChange={go} />}
      <View style={[{ pointerEvents: 'box-none' }, styles.bannerWrap, { top: isWide ? TOP_BAR + 30 : 76 }]}>
        <SyncBanner onOpen={() => setSyncOpen(true)} />
      </View>
      <SyncSheet visible={syncOpen} onClose={() => setSyncOpen(false)} />
      <DialogHost />
    </View>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  const c = useColors();
  return (
    <View style={styles.brand}>
      <OtterPortrait size={compact ? 32 : 36} seed={5} background={c.primary} />
      <Text style={[T.title, { fontFamily: 'BricolageGrotesque_700Bold', fontSize: compact ? 17 : 18, color: c.text, letterSpacing: -0.4 }]} numberOfLines={1}>
        Finance Overview
      </Text>
      {isDemo ? (
        <View style={[styles.demoTag, { backgroundColor: c.sunSoft }]} accessibilityLabel="Demo with made-up data">
          <Text style={{ fontFamily: 'Geist_600SemiBold', fontSize: 11, color: c.text }}>Demo</Text>
        </View>
      ) : null}
    </View>
  );
}

function glass(c: ReturnType<typeof useColors>) {
  return [
    { backgroundColor: c.glass },
    web({ backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)' }),
    shadow(c, 2),
  ];
}

/** Desktop: a floating bar over the page (content scrolls underneath the frosted glass). */
function TopBar({ active, onChange, onOpenSync }: { active: Tab; onChange: (t: Tab) => void; onOpenSync: () => void }) {
  const c = useColors();
  const sync = syncLabel(useSyncState());
  const [spots, setSpots] = useState<Record<string, { x: number; w: number }>>({});
  const spot = spots[active];
  const measure = (key: Tab) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setSpots((s) => (s[key]?.x === x && s[key]?.w === width ? s : { ...s, [key]: { x, w: width } }));
  };

  return (
    <View style={[{ pointerEvents: 'box-none' }, styles.topWrap]}>
      <View style={[styles.topBar, ...glass(c)]} accessibilityRole="header">
        <Brand />
        <View style={[styles.tabs, { backgroundColor: c.track }]} accessibilityRole="tablist">
          {spot ? (
            <View
              style={[{ pointerEvents: 'none' },
                styles.tabIndicator,
                { backgroundColor: c.card, width: spot.w, transform: [{ translateX: spot.x }] },
                shadow(c, 1),
                transition(['transform', 'width'], 220, motion.easeOut),
              ]}
            />
          ) : null}
          {TABS.map((t) => {
            const selected = t.key === active;
            return (
              <Press
                key={t.key}
                feedback="soft"
                onLayout={measure(t.key)}
                onPress={() => onChange(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={({ hovered }) => [styles.tab, !selected && hovered && { backgroundColor: c.hover }]}
              >
                <Icon name={selected ? t.iconActive : t.icon} size={17} color={selected ? c.primary : c.textSecondary} />
                <Text style={[T.label, { fontSize: 14, color: selected ? c.text : c.textSecondary, fontFamily: selected ? 'Geist_600SemiBold' : 'Geist_500Medium' }]}>{t.label}</Text>
              </Press>
            );
          })}
        </View>
        <Press
          onPress={onOpenSync}
          accessibilityRole="button"
          feedback="soft"
          style={({ hovered }) => [styles.syncPill, hovered && { backgroundColor: c.hover }]}
        >
          <Icon name={sync.icon} size={16} color={sync.attention ? c.primary : c.textMuted} weight={sync.attention ? 'bold' : 'regular'} />
          <Text style={[T.label, { color: sync.attention ? c.primary : c.textSecondary }]} numberOfLines={1}>
            {sync.text}
          </Text>
        </Press>
      </View>
    </View>
  );
}

/** Phones: brand and sync status on a frosted strip at the top. */
function PhoneHeader({ onOpenSync }: { onOpenSync: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const sync = syncLabel(useSyncState());
  return (
    <View style={[{ pointerEvents: 'box-none' }, styles.phoneHeaderWrap, { paddingTop: insets.top + 8 }]}>
      <View style={[styles.phoneHeader, ...glass(c)]}>
        <Brand compact />
        <Press accessibilityRole="button" accessibilityLabel={sync.text} onPress={onOpenSync} style={({ hovered }) => [styles.headerIcon, hovered && { backgroundColor: c.hover }]}>
          <Icon name={sync.icon} size={19} color={sync.attention ? c.primary : c.textMuted} />
        </Press>
      </View>
    </View>
  );
}

/** Phones: a floating dock. Switching tabs is instant; the active tab gets a tinted pill. */
function Dock({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ pointerEvents: 'box-none' }, styles.dockWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={[styles.dock, ...glass(c)]} accessibilityRole="tablist">
        {TABS.map((t) => {
          const selected = t.key === active;
          return (
            <Press
              key={t.key}
              onPress={() => onChange(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t.label}
              style={() => [styles.dockItem, selected && { backgroundColor: c.accentSoft }]}
            >
              <Icon name={selected ? t.iconActive : t.icon} size={22} color={selected ? c.primary : c.textSecondary} />
              <Text style={[T.small, { fontSize: 11, color: selected ? c.primary : c.textSecondary, fontFamily: selected ? 'Geist_600SemiBold' : 'Geist_500Medium' }]}>{t.label}</Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1, zIndex: 1 },
  topWrap: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.xxl, zIndex: 20 },
  topBar: {
    width: '100%',
    maxWidth: 1240,
    height: TOP_BAR,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 10,
    gap: space.lg,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  demoTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  tabs: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, position: 'relative' },
  tabIndicator: { position: 'absolute', top: 4, bottom: 4, left: 0, borderRadius: radius.pill },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 14, paddingRight: 16, borderRadius: radius.pill },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 14, borderRadius: radius.pill, maxWidth: 260 },
  phoneHeaderWrap: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 12, zIndex: 20 },
  phoneHeader: { height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 10, paddingRight: 6 },
  headerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dockWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 12, zIndex: 20 },
  dock: { flexDirection: 'row', borderRadius: 30, padding: 6, gap: 4, width: '100%', maxWidth: 440 },
  dockItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, height: 54, borderRadius: 24 },
  bannerWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: space.lg, zIndex: 19 },
});
