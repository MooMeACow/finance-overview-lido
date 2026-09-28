import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DbProvider } from './src/db/provider';
import { AppStateProvider } from './src/state';
import { OverviewScreen } from './src/screens/OverviewScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { ImportScreen } from './src/screens/ImportScreen';
import type { IconName } from './src/components/ui';
import { space, useColors } from './src/theme';

type Tab = 'overview' | 'transactions' | 'import';

const TABS: { key: Tab; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: 'overview', label: 'Overview', icon: 'pie-chart-outline', iconActive: 'pie-chart' },
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
  const [tab, setTab] = useState<Tab>('overview');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'left', 'right']}>
      <StatusBar style="auto" />
      {/* On wide screens (desktop browsers) keep the app phone-width and centered */}
      <View style={styles.column}>
        <View style={{ flex: 1 }}>
          {tab === 'overview' ? (
            <OverviewScreen
              onImport={() => setTab('import')}
              onShowCategory={(cat) => {
                setCategoryFilter(cat);
                setTab('transactions');
              }}
            />
          ) : null}
          {tab === 'transactions' ? (
            <TransactionsScreen categoryFilter={categoryFilter} onClearCategory={() => setCategoryFilter(null)} />
          ) : null}
          {tab === 'import' ? <ImportScreen onDone={() => setTab('overview')} /> : null}
        </View>
        <TabBar
          active={tab}
          onChange={(t) => {
            if (t !== 'transactions') setCategoryFilter(null);
            setTab(t);
          }}
        />
      </View>
    </SafeAreaView>
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
            <Ionicons name={selected ? t.iconActive : t.icon} size={22} color={selected ? c.text : c.textMuted} />
            <Text style={[styles.tabLabel, { color: selected ? c.text : c.textMuted, fontWeight: selected ? '600' : '400' }]}>
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
  column: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.sm },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  tabLabel: { fontSize: 11 },
});
