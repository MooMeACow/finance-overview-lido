import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useSQLiteContext } from 'expo-sqlite';

import { Button, Card, Chip, FieldLabel, IconButton, ScreenHeader, SectionTitle, inputStyle } from '../components/ui';
import { space, useColors } from '../theme';
import { useAppState } from '../state';
import { type Table, toTable } from '../lib/csv';
import { DATE_FORMATS, dayLabel } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { getCategory } from '../lib/categories';
import {
  type Mapping,
  type ParseResult,
  isRevolut,
  parseGeneric,
  parseRevolut,
  suggestMapping,
} from '../lib/importers';
import {
  type ImportRecord,
  countExisting,
  deleteAllData,
  deleteImport,
  getImports,
  getRules,
  importTransactions,
} from '../db/database';

type Loaded = { fileName: string; table: Table; source: 'revolut' | 'csv' };

export function ImportScreen({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();
  const c = useColors();
  const { refresh, setMonth, version } = useAppState();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [rules, setRules] = useState<Map<string, string>>(new Map());
  const [existing, setExisting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imports, setImports] = useState<ImportRecord[]>([]);

  useEffect(() => {
    getImports(db).then(setImports);
  }, [db, version]);

  const result: ParseResult | null = useMemo(() => {
    if (!loaded) return null;
    if (loaded.source === 'revolut') return parseRevolut(loaded.table, rules);
    return mapping ? parseGeneric(loaded.table, mapping, rules) : null;
  }, [loaded, mapping, rules]);

  // How many of these rows are already in the database
  useEffect(() => {
    if (!result) return;
    let alive = true;
    countExisting(db, result.txns.map((t) => t.hash)).then((n) => alive && setExisting(n));
    return () => {
      alive = false;
    };
  }, [db, result]);

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      setBusy(true);
      const text = await new File(asset.uri).text();
      const table = toTable(text);
      if (table.headers.length < 2 || table.rows.length === 0) {
        Alert.alert('Could not read this file', 'Make sure it is a CSV export with a header row.');
        return;
      }
      const revolut = isRevolut(table.headers);
      setRules(await getRules(db));
      setMapping(revolut ? null : suggestMapping(table));
      setLoaded({ fileName: asset.name ?? 'statement.csv', table, source: revolut ? 'revolut' : 'csv' });
    } catch (e) {
      Alert.alert('Could not open file', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [db]);

  const reset = () => {
    setLoaded(null);
    setMapping(null);
    setExisting(0);
  };

  const doImport = async () => {
    if (!loaded || !result) return;
    setBusy(true);
    try {
      const added = await importTransactions(db, loaded.fileName, loaded.source, result.txns);
      const latest = result.txns.reduce((m, t) => (t.date > m ? t.date : m), '');
      if (latest) setMonth(latest.slice(0, 7));
      refresh();
      reset();
      Alert.alert(
        added > 0 ? 'Import complete' : 'Nothing new',
        added > 0 ? `Added ${added} transaction${added === 1 ? '' : 's'}.` : 'All of these transactions were already imported.',
        [{ text: 'View overview', onPress: onDone }, { text: 'OK' }],
      );
    } catch (e) {
      Alert.alert('Import failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const removeImport = (imp: ImportRecord) => {
    Alert.alert('Remove this import?', `Deletes the ${imp.row_count} transactions added from ${imp.file_name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteImport(db, imp.id);
          refresh();
        },
      },
    ]);
  };

  const wipe = () => {
    Alert.alert('Delete all data?', 'Removes every transaction, import and category rule from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete everything',
        style: 'destructive',
        onPress: async () => {
          await deleteAllData(db);
          refresh();
        },
      },
    ]);
  };

  const newCount = result ? result.txns.length - existing : 0;
  const totals = useMemo(() => {
    const txns = result?.txns ?? [];
    return {
      in: txns.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0),
      out: txns.filter((t) => t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0),
      currency: txns[0]?.currency ?? 'EUR',
    };
  }, [result]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Import" />

      {!loaded ? (
        <Card style={{ gap: space.md }}>
          <Text style={[styles.lead, { color: c.text }]}>Add a bank statement</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Export your transactions as a CSV file from your bank's app or website, then choose it here. Revolut
            statements are recognised automatically; for other banks you can tell the app which column is which.
            Importing the same file twice won't create duplicates.
          </Text>
          <Button label={busy ? 'Opening…' : 'Choose CSV file'} icon="document-attach-outline" onPress={pickFile} disabled={busy} />
        </Card>
      ) : (
        <>
          <Card style={{ gap: space.xs }}>
            <View style={styles.fileRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lead, { color: c.text }]} numberOfLines={1}>{loaded.fileName}</Text>
                <Text style={[styles.body, { color: c.textSecondary }]}>
                  {loaded.source === 'revolut' ? 'Revolut statement' : 'Bank CSV'} · {loaded.table.rows.length} rows
                </Text>
              </View>
              <IconButton icon="close" label="Cancel import" onPress={reset} />
            </View>
          </Card>

          {loaded.source === 'csv' && mapping ? (
            <MappingEditor table={loaded.table} mapping={mapping} onChange={setMapping} />
          ) : null}

          {result ? (
            <>
              <SectionTitle>Preview</SectionTitle>
              <Card style={{ gap: space.md }}>
                <View style={styles.previewStats}>
                  <PreviewStat label="New" value={String(newCount)} />
                  <PreviewStat label="Already imported" value={String(existing)} />
                  <PreviewStat label="Skipped" value={String(result.skipped.reduce((s, x) => s + x.count, 0))} />
                </View>
                {result.skipped.map((s) => (
                  <Text key={s.reason} style={[styles.small, { color: c.textSecondary }]}>
                    {s.count} × {s.reason}
                  </Text>
                ))}
                <Text style={[styles.small, { color: c.textSecondary }]}>
                  In this file: {formatMoney(totals.in, totals.currency)} in · {formatMoney(totals.out, totals.currency)} out
                </Text>
                <View style={[styles.hr, { backgroundColor: c.hairline }]} />
                {result.txns.slice(0, 8).map((t) => (
                  <View key={t.hash} style={styles.previewRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={1}>{t.description}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 12 }}>
                        {dayLabel(t.date)} · {getCategory(t.category).label}
                      </Text>
                    </View>
                    <Text style={{ color: t.amountCents > 0 ? c.positive : c.text, fontVariant: ['tabular-nums'], fontWeight: '600' }}>
                      {formatMoney(t.amountCents, t.currency, 'always')}
                    </Text>
                  </View>
                ))}
                {result.txns.length > 8 ? (
                  <Text style={[styles.small, { color: c.textMuted }]}>…and {result.txns.length - 8} more</Text>
                ) : null}
              </Card>
              <View style={{ marginTop: space.lg, gap: space.sm }}>
                <Button
                  label={newCount > 0 ? `Import ${newCount} transaction${newCount === 1 ? '' : 's'}` : 'Nothing new to import'}
                  icon="checkmark"
                  onPress={doImport}
                  disabled={busy || newCount <= 0}
                />
                <Button label="Cancel" variant="secondary" onPress={reset} />
              </View>
            </>
          ) : null}
        </>
      )}

      {imports.length > 0 && !loaded ? (
        <>
          <SectionTitle>Recent imports</SectionTitle>
          <Card style={{ paddingVertical: space.xs }}>
            {imports.map((imp, i) => (
              <View key={imp.id} style={[styles.importRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 15 }} numberOfLines={1}>{imp.file_name}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>
                    {imp.row_count} transactions · {imp.imported_at.slice(0, 16)}
                  </Text>
                </View>
                <IconButton icon="trash-outline" label={`Remove import ${imp.file_name}`} onPress={() => removeImport(imp)} color={c.textSecondary} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {!loaded ? (
        <>
          <SectionTitle>Your data</SectionTitle>
          <Card style={{ gap: space.md }}>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              Everything is stored only on this device. Nothing is uploaded anywhere.
            </Text>
            <Button label="Delete all data" variant="danger" icon="trash-outline" onPress={wipe} />
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '700' }}>{value}</Text>
      <Text style={{ color: c.textSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

/** Lets the user say which column is the date, description and amount. */
function MappingEditor({ table, mapping, onChange }: { table: Table; mapping: Mapping; onChange: (m: Mapping) => void }) {
  const c = useColors();
  const set = (patch: Partial<Mapping>) => onChange({ ...mapping, ...patch });
  const directionValues = useMemo(() => {
    if (mapping.direction === null) return [];
    return [...new Set(table.rows.map((r) => (r[mapping.direction!] ?? '').trim()))].filter(Boolean).slice(0, 6);
  }, [table, mapping.direction]);

  const columnPicker = (label: string, value: number, onPick: (i: number) => void) => (
    <View>
      <FieldLabel>{label}</FieldLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {table.headers.map((h, i) => (
          <Chip key={`${h}-${i}`} label={h || `Column ${i + 1}`} selected={value === i} onPress={() => onPick(i)} />
        ))}
      </ScrollView>
      <Text style={[styles.small, { color: c.textMuted, marginTop: 4 }]} numberOfLines={1}>
        e.g. {table.rows[0]?.[value] ?? '—'}
      </Text>
    </View>
  );

  return (
    <>
      <SectionTitle>Match the columns</SectionTitle>
      <Card style={{ gap: space.lg }}>
        {columnPicker('Date', mapping.date, (i) => set({ date: i }))}
        <View>
          <FieldLabel>Date format</FieldLabel>
          <View style={styles.chipRow}>
            {DATE_FORMATS.map((f) => (
              <Chip key={f.key} label={f.label} selected={mapping.dateFormat === f.key} onPress={() => set({ dateFormat: f.key })} />
            ))}
          </View>
        </View>
        {columnPicker('Description', mapping.description, (i) => set({ description: i }))}
        {columnPicker('Amount', mapping.amount, (i) => set({ amount: i }))}

        <View style={styles.switchRow}>
          <Text style={{ flex: 1, color: c.text, fontSize: 15 }}>Amounts are always positive; another column says in or out</Text>
          <Switch
            value={mapping.direction !== null}
            onValueChange={(on) => set({ direction: on ? 0 : null, outValue: '' })}
          />
        </View>
        {mapping.direction !== null ? (
          <>
            {columnPicker('In / out column', mapping.direction, (i) => set({ direction: i, outValue: '' }))}
            <View>
              <FieldLabel>Which value means money out?</FieldLabel>
              <View style={styles.chipRow}>
                {directionValues.map((v) => (
                  <Chip key={v} label={v} selected={mapping.outValue === v} onPress={() => set({ outValue: v })} />
                ))}
              </View>
            </View>
          </>
        ) : null}

        <View>
          <FieldLabel>Currency</FieldLabel>
          <TextInput
            value={mapping.currency}
            onChangeText={(t) => set({ currency: t.toUpperCase().slice(0, 3) })}
            autoCapitalize="characters"
            style={inputStyle(c)}
          />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: 120 },
  lead: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  previewStats: { flexDirection: 'row' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hr: { height: StyleSheet.hairlineWidth },
  importRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, gap: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chipScroll: { flexDirection: 'row', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
