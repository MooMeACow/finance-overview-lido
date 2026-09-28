import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useDb } from '../db/provider';
import { confirmAction, notify } from '../lib/dialogs';
import { readPickedFile } from '../lib/readPickedFile';

import { Button, Card, Chip, FieldLabel, IconButton, Page, ScreenHeader, SectionTitle, inputStyle } from '../components/ui';
import { useLayout } from '../layout';
import { space, useColors } from '../theme';
import { useAppState } from '../state';
import { type Table, toTable } from '../lib/csv';
import { DATE_FORMATS, dayLabel, shortDate } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { getCategory } from '../lib/categories';
import { type Setup, isSetupFile, parseSetupFile, planSetupImport } from '../lib/setupFile';
import { frequencyLabel } from '../lib/forecast';
import {
  type Mapping,
  type ParseResult,
  isIng,
  isRevolut,
  parseGeneric,
  parseIng,
  parseRevolut,
  suggestMapping,
} from '../lib/importers';
import {
  type ImportSummary,
  countExisting,
  deleteAllData,
  deleteImport,
  getImports,
  getDebts,
  getPlans,
  getRules,
  importTransactions,
  saveDebt,
  savePlan,
  setBudget,
} from '../db/database';

type Loaded = { fileName: string; table: Table; source: 'revolut' | 'ing' | 'csv' };

type LoadedSetup = { fileName: string; data: Setup; toAdd: ReturnType<typeof planSetupImport> };

const SOURCE_LABEL = { revolut: 'Revolut statement', ing: 'ING statement', csv: 'Bank CSV' };

export function ImportScreen({ onDone }: { onDone: () => void }) {
  const db = useDb();
  const c = useColors();
  const { refresh, setMonth, version } = useAppState();
  const { isWide } = useLayout();

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [setup, setSetup] = useState<LoadedSetup | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [rules, setRules] = useState<Map<string, string>>(new Map());
  const [existing, setExisting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [imports, setImports] = useState<ImportSummary[]>([]);

  useEffect(() => {
    getImports(db).then(setImports);
  }, [db, version]);

  const result: ParseResult | null = useMemo(() => {
    if (!loaded) return null;
    if (loaded.source === 'revolut') return parseRevolut(loaded.table, rules);
    if (loaded.source === 'ing') return parseIng(loaded.table, rules);
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
      const text = await readPickedFile(asset);
      if (isSetupFile(text)) {
        // A plans file: plans, budgets and debts to add in one go
        const data = parseSetupFile(text);
        const [plans, debts] = await Promise.all([getPlans(db), getDebts(db)]);
        setSetup({ fileName: asset.name ?? 'plans.json', data, toAdd: planSetupImport({ plans, debts }, data) });
        return;
      }
      const table = toTable(text);
      if (table.headers.length < 2 || table.rows.length === 0) {
        notify('Could not read this file', 'Make sure it is a CSV export with a header row.');
        return;
      }
      const source = isRevolut(table.headers) ? 'revolut' : isIng(table.headers) ? 'ing' : 'csv';
      setRules(await getRules(db));
      setMapping(source === 'csv' ? suggestMapping(table) : null);
      setLoaded({ fileName: asset.name ?? 'statement.csv', table, source });
    } catch (e) {
      notify('Could not open file', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [db]);

  const importSetup = async () => {
    if (!setup) return;
    setBusy(true);
    try {
      const { plans, budgets, debts } = setup.toAdd;
      for (const p of plans) await savePlan(db, p);
      for (const b of budgets) await setBudget(db, b.category, b.limit_cents);
      for (const d of debts) await saveDebt(db, { person: d.person, direction: d.direction, amountCents: d.amount_cents, note: d.note });
      refresh();
      setSetup(null);
      notify(
        'Plans imported',
        `Added ${plans.length} plan${plans.length === 1 ? '' : 's'}, ${budgets.length} budget${budgets.length === 1 ? '' : 's'} and ${debts.length} debt${debts.length === 1 ? '' : 's'}. You'll find them on the Dashboard.`,
      );
    } catch (e) {
      notify('Import failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSetup(null);
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
      notify(
        added > 0 ? 'Import complete' : 'Nothing new',
        added > 0 ? `Added ${added} transaction${added === 1 ? '' : 's'}.` : 'All of these transactions were already imported.',
      );
      if (added > 0) onDone();
    } catch (e) {
      notify('Import failed', String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };

  const removeImport = async (imp: ImportSummary) => {
    const ok = await confirmAction(
      'Remove this import?',
      `Deletes the ${imp.txn_count} transactions that came from ${imp.file_name}. You can import the file again afterwards.`,
      'Remove',
    );
    if (!ok) return;
    await deleteImport(db, imp.id);
    refresh();
  };

  const wipe = async () => {
    const ok = await confirmAction(
      'Delete all data?',
      'Removes every transaction, import and category rule stored here.',
      'Delete everything',
    );
    if (!ok) return;
    await deleteAllData(db);
    refresh();
  };

  const newCount = result ? result.txns.length - existing : 0;
  const totals = useMemo(() => {
    const all = result?.txns ?? [];
    const txns = all.filter((t) => !t.excluded);
    return {
      ownTransfers: all.length - txns.length,
      in: txns.filter((t) => t.amountCents > 0).reduce((s, t) => s + t.amountCents, 0),
      out: txns.filter((t) => t.amountCents < 0).reduce((s, t) => s - t.amountCents, 0),
      currency: txns[0]?.currency ?? 'EUR',
    };
  }, [result]);

  return (
    <Page>
      <ScreenHeader title="Import" subtitle={isWide ? 'Add bank statements and manage your data' : undefined} />
      <View style={isWide ? styles.readable : undefined}>

      {setup ? (
        <SetupPreview setup={setup} busy={busy} onImport={importSetup} onCancel={reset} />
      ) : !loaded ? (
        <Card style={{ gap: space.md }}>
          <Text style={[styles.lead, { color: c.text }]}>Add a bank statement</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            Export your transactions as a CSV file from your bank's app or website, then choose it here. Revolut
            and ING statements are recognised automatically; for other banks you can tell the app which column is which.
            Importing the same file twice won't create duplicates. You can also choose a plans file (.json) to add
            plans, budgets and debts in one go.
          </Text>
          <Button label={busy ? 'Opening…' : 'Choose file'} icon="document-attach-outline" onPress={pickFile} disabled={busy} />
        </Card>
      ) : (
        <>
          <Card style={{ gap: space.xs }}>
            <View style={styles.fileRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.lead, { color: c.text }]} numberOfLines={1}>{loaded.fileName}</Text>
                <Text style={[styles.body, { color: c.textSecondary }]}>
                  {SOURCE_LABEL[loaded.source]} · {loaded.table.rows.length} rows
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
                {totals.ownTransfers > 0 ? (
                  <Text style={[styles.small, { color: c.textSecondary }]}>
                    {totals.ownTransfers} transfer{totals.ownTransfers === 1 ? '' : 's'} between your own accounts (savings,
                    round-ups, top-ups) {totals.ownTransfers === 1 ? "isn't" : "aren't"} counted as income or spending. You
                    can change this per transaction.
                  </Text>
                ) : null}
                <View style={[styles.hr, { backgroundColor: c.hairline }]} />
                {result.txns.slice(0, 8).map((t) => (
                  <View key={t.hash} style={styles.previewRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={1}>{t.description}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 12 }}>
                        {dayLabel(t.date)} · {getCategory(t.category).label}
                        {t.excluded ? ' · not counted' : ''}
                      </Text>
                    </View>
                    <Text
                      style={[
                        { color: t.amountCents > 0 ? c.positive : c.text, fontVariant: ['tabular-nums'], fontWeight: '600' },
                        t.excluded && { opacity: 0.45, textDecorationLine: 'line-through' },
                      ]}
                    >
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

      {!loaded && !setup ? (
        <>
          <SectionTitle>Imported statements</SectionTitle>
          <ImportedStatements imports={imports} onDelete={removeImport} />
        </>
      ) : null}

      {!loaded && !setup ? (
        <>
          <SectionTitle>Your data</SectionTitle>
          <Card style={{ gap: space.md }}>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              {Platform.OS === 'web'
                ? 'Everything is stored only in this browser on this device. Nothing is uploaded anywhere. Other browsers and devices have their own separate data.'
                : 'Everything is stored only on this device. Nothing is uploaded anywhere.'}
            </Text>
            <Button label="Delete all data" variant="danger" icon="trash-outline" onPress={wipe} />
          </Card>
        </>
      ) : null}
      </View>
    </Page>
  );
}

/** Preview of a plans file before adding it. */
function SetupPreview({
  setup,
  busy,
  onImport,
  onCancel,
}: {
  setup: LoadedSetup;
  busy: boolean;
  onImport: () => void;
  onCancel: () => void;
}) {
  const c = useColors();
  const { plans, budgets, debts, skipped } = setup.toAdd;
  const nothing = plans.length + budgets.length + debts.length === 0;
  const line = (left: string, sub: string, right: string, key: string, positive = false) => (
    <View key={key} style={styles.previewRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 14 }} numberOfLines={1}>{left}</Text>
        <Text style={{ color: c.textMuted, fontSize: 12 }} numberOfLines={1}>{sub}</Text>
      </View>
      <Text style={{ color: positive ? c.positive : c.text, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{right}</Text>
    </View>
  );
  return (
    <>
      <Card style={{ gap: space.xs }}>
        <View style={styles.fileRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.lead, { color: c.text }]} numberOfLines={1}>{setup.fileName}</Text>
            <Text style={[styles.body, { color: c.textSecondary }]}>
              Plans file · {plans.length} plans, {budgets.length} budgets, {debts.length} debts to add
            </Text>
          </View>
          <IconButton icon="close" label="Cancel" onPress={onCancel} />
        </View>
        {skipped > 0 ? (
          <Text style={[styles.small, { color: c.textSecondary }]}>{skipped} item{skipped === 1 ? ' is' : 's are'} already in the app and will be skipped.</Text>
        ) : null}
      </Card>

      {plans.length > 0 ? (
        <>
          <SectionTitle>Plans</SectionTitle>
          <Card style={{ gap: space.md }}>
            {plans.map((p, i) =>
              line(
                p.description,
                `${frequencyLabel({ ...p, id: 0 })}${p.kind === 'expense' ? ` · ${getCategory(p.category).label}` : ''}`,
                formatMoney(p.kind === 'income' ? p.amount_cents : -p.amount_cents, 'EUR', 'always'),
                `p${i}`,
                p.kind === 'income',
              ),
            )}
          </Card>
        </>
      ) : null}

      {budgets.length > 0 ? (
        <>
          <SectionTitle>Monthly budgets</SectionTitle>
          <Card style={{ gap: space.md }}>
            {budgets.map((b) => line(getCategory(b.category).label, 'Per month', formatMoney(b.limit_cents), b.category))}
          </Card>
        </>
      ) : null}

      {debts.length > 0 ? (
        <>
          <SectionTitle>Debts</SectionTitle>
          <Card style={{ gap: space.md }}>
            {debts.map((d, i) =>
              line(d.person, `${d.direction === 'owed_to_me' ? 'Owes you' : 'You owe'}${d.note ? ` · ${d.note}` : ''}`, formatMoney(d.amount_cents), `d${i}`),
            )}
          </Card>
        </>
      ) : null}

      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <Button label={nothing ? 'Nothing new to add' : 'Add to the app'} icon="checkmark" onPress={onImport} disabled={busy || nothing} />
        <Button label="Cancel" variant="secondary" onPress={onCancel} />
      </View>
    </>
  );
}

const SOURCE_SHORT: Record<string, string> = { revolut: 'Revolut', ing: 'ING', csv: 'CSV', manual: 'Manual' };

function period(imp: ImportSummary): string {
  if (!imp.first_date || !imp.last_date) return '—';
  const a = shortDate(imp.first_date);
  const b = shortDate(imp.last_date);
  return a === b ? a : `${a} – ${b}`;
}

/** All imported statements with their period and totals; delete removes their transactions. */
function ImportedStatements({ imports, onDelete }: { imports: ImportSummary[]; onDelete: (imp: ImportSummary) => void }) {
  const c = useColors();
  const { isMedium } = useLayout();

  if (imports.length === 0) {
    return (
      <Card>
        <Text style={[styles.body, { color: c.textSecondary }]}>No statements imported yet.</Text>
      </Card>
    );
  }

  const badge = (source: string) => (
    <View style={[styles.badge, { backgroundColor: c.accentSoft }]}>
      <Text style={{ color: c.primary, fontSize: 12, fontWeight: '700' }}>{SOURCE_SHORT[source] ?? source}</Text>
    </View>
  );

  return (
    <Card style={{ paddingHorizontal: 0, paddingVertical: space.xs }}>
      {isMedium ? (
        <View style={[styles.tr, { borderBottomColor: c.hairline, paddingVertical: space.sm }]}>
          {['Bank', 'File', 'Period', 'Transactions', 'Counted in / out', 'Imported', ''].map((h, i) => (
            <Text key={i} style={[styles.th, { color: c.textMuted, flex: IMPORT_COLS[i] }, i >= 3 && i <= 4 && { textAlign: 'right' }]}>
              {h}
            </Text>
          ))}
        </View>
      ) : null}
      {imports.map((imp, i) =>
        isMedium ? (
          <View key={imp.id} style={[styles.tr, { borderBottomColor: c.hairline }, i === imports.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flex: IMPORT_COLS[0] }}>{badge(imp.source)}</View>
            <Text style={[styles.td, { color: c.text, flex: IMPORT_COLS[1], fontWeight: '500' }]} numberOfLines={1}>{imp.file_name}</Text>
            <Text style={[styles.td, { color: c.textSecondary, flex: IMPORT_COLS[2] }]} numberOfLines={1}>{period(imp)}</Text>
            <Text style={[styles.td, styles.num, { color: c.text, flex: IMPORT_COLS[3] }]}>{imp.txn_count}</Text>
            <Text style={[styles.td, styles.num, { color: c.textSecondary, flex: IMPORT_COLS[4] }]} numberOfLines={1}>
              {formatMoney(imp.counted_in_cents)} / {formatMoney(imp.counted_out_cents)}
            </Text>
            <Text style={[styles.td, { color: c.textMuted, flex: IMPORT_COLS[5] }]} numberOfLines={1}>{imp.imported_at.slice(0, 16)}</Text>
            <View style={{ flex: IMPORT_COLS[6], alignItems: 'flex-end' }}>
              <IconButton icon="trash-outline" label={`Delete import ${imp.file_name}`} onPress={() => onDelete(imp)} color={c.danger} />
            </View>
          </View>
        ) : (
          <View key={imp.id} style={[styles.importRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline }]}>
            {badge(imp.source)}
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 15 }} numberOfLines={1}>{imp.file_name}</Text>
              <Text style={{ color: c.textMuted, fontSize: 13 }} numberOfLines={1}>
                {period(imp)} · {imp.txn_count} transactions
              </Text>
            </View>
            <IconButton icon="trash-outline" label={`Delete import ${imp.file_name}`} onPress={() => onDelete(imp)} color={c.danger} />
          </View>
        ),
      )}
      <Text style={[styles.small, { color: c.textMuted, paddingHorizontal: space.lg, paddingVertical: space.md }]}>
        Imported something twice, or before own-account transfers were recognised? Delete it here and import the file again.
      </Text>
    </Card>
  );
}

const IMPORT_COLS = [0.8, 2, 2, 1, 1.8, 1.4, 0.5];

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
  readable: { maxWidth: 1000 },
  lead: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  previewStats: { flexDirection: 'row' },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  hr: { height: StyleSheet.hairlineWidth },
  importRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.md },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  th: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  td: { fontSize: 14 },
  num: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chipScroll: { flexDirection: 'row', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
