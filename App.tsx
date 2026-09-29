import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DbProvider } from './src/db/provider';
import { AppStateProvider } from './src/state';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { MonthlyScreen } from './src/screens/MonthlyScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { ImportScreen } from './src/screens/ImportScreen';
import type { IconName } from './src/components/ui';
import { radius, space, useColors } from './src/theme';
import { useLayout } from './src/layout';
import { SyncBanner, SyncSheet, syncLabel } from './src/components/SyncControls';
import { useSyncState } from './src/sync/useSync';

type Tab = 'dashboard' | 'monthly' | 'transactions' | 'import';

const TABS: { key: Tab; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid-outline', iconActive: 'grid' },
  { key: 'monthly', label: 'Monthly', icon: 'calendar-outline', iconActive: 'calendar' },
  { key: 'transactions', label: 'Transactions', icon: 'list-outline', iconActive: 'list' },
  { key: 'import', label: 'Import', icon: 'cloud-upload-outline', iconActive: 'cloud-upload' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <DbProvider>
        <AppStateProvider>
          <Main />
        </AppStateProvider>
      </DbProvider>
    </SafeAreaProvider>
  );
}

function Main() {
  const c = useColors();
  const { isWide } = useLayout();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);

  const go = (t: Tab) => {
    if (t !== 'transactions') setCategoryFilter(null);
    setTab(t);
  };

  const screen = (
    <>
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
      <SyncSheet visible={syncOpen} onClose={() => setSyncOpen(false)} />
    </>
  );

  if (isWide) {
    // Desktop: sidebar on the left, page on the right
    return (
      <View style={[styles.root, styles.row, { backgroundColor: c.background }]}>
        <StatusBar style="auto" />
        <Sidebar active={tab} onChange={go} onOpenSync={() => setSyncOpen(true)} />
        <View style={{ flex: 1 }}>
          <SyncBanner onOpen={() => setSyncOpen(true)} />
          {screen}
        </View>
      </View>
    );
  }

  // Phones: page with bottom tab bar
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      <SyncBanner onOpen={() => setSyncOpen(true)} />
      <View style={{ flex: 1 }}>{screen}</View>
      <TabBar active={tab} onChange={go} />
    </SafeAreaView>
  );
}

function Sidebar({ active, onChange, onOpenSync }: { active: Tab; onChange: (t: Tab) => void; onOpenSync: () => void }) {
  const c = useColors();
  const sync = syncLabel(useSyncState());
  return (
    <View style={[styles.sidebar, { backgroundColor: c.card, borderRightColor: c.hairline }]}>
      <View style={styles.brand}>
        <View style={[styles.logo, { backgroundColor: c.hero }]}>
          <Ionicons name="wallet" size={18} color={c.heroText} />
        </View>
        <Text style={[styles.brandText, { color: c.text }]}>Finance</Text>
      </View>

      <View style={{ gap: 2 }}>
        {TABS.map((t) => {
          const selected = t.key === active;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={(state) => {
                // `hovered` is provided by React Native Web
                const hovered = (state as { hovered?: boolean }).hovered;
                return [
                  styles.navItem,
                  selected ? { backgroundColor: c.accentSoft } : hovered ? { backgroundColor: c.track } : null,
                ];
              }}
            >
              <Ionicons name={selected ? t.iconActive : t.icon} size={19} color={selected ? c.primary : c.textSecondary} />
              <Text style={[styles.navLabel, { color: selected ? c.primary : c.text, fontWeight: selected ? '600' : '500' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={onOpenSync}
        accessibilityRole="button"
        style={(state) => [
          styles.sidebarFooter,
          { borderTopColor: c.hairline },
          (state as { hovered?: boolean }).hovered && { backgroundColor: c.track },
        ]}
      >
        <Ionicons name={sync.icon} size={15} color={sync.attention ? c.primary : c.textMuted} />
        <Text style={{ color: sync.attention ? c.primary : c.textMuted, fontSize: 12, lineHeight: 17, flex: 1, fontWeight: sync.attention ? '600' : '400' }}>
          {sync.text}
        </Text>
      </Pressable>
    </View>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.tabBar,
        { backgroundColor: c.card, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, space.sm) },
      ]}
    >
      {TABS.map((t) => {
        const selected = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={styles.tab}
          >
            <Ionicons name={selected ? t.iconActive : t.icon} size={22} color={selected ? c.primary : c.textMuted} />
            <Text style={[styles.tabLabel, { color: selected ? c.primary : c.textMuted, fontWeight: selected ? '600' : '400' }]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row' },
  sidebar: {
    width: 240,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    paddingVertical: space.xl,
    gap: space.xl,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm },
  logo: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: 10,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  navLabel: { fontSize: 15 },
  sidebarFooter: {
    marginTop: 'auto',
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.lg,
    paddingBottom: space.sm,
    paddingHorizontal: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
  },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 11 },
});
