import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { useDb } from '../db/provider';
import { confirmAction, notify } from '../lib/dialogs';

import { Button, FieldLabel, Money, Sheet, inputStyle, Segmented, Text } from './ui';
import { CategoryPicker } from './CategoryPicker';
import { space, useColors } from '../theme';
import { dayLabel, todayString } from '../lib/dates';
import { parseAmount } from '../lib/money';
import {
  type Txn,
  addManualTransaction,
  applyCategoryToSimilar,
  deleteTransaction,
  updateTransaction,
} from '../db/database';
import { useAppState } from '../state';

/** Edit an existing transaction: category, note, exclude from totals, delete. */
export function EditTransactionSheet({ txn, onClose }: { txn: Txn | null; onClose: () => void }) {
  const db = useDb();
  const c = useColors();
  const { refresh } = useAppState();
  const [category, setCategory] = useState('other');
  const [note, setNote] = useState('');
  const [excluded, setExcluded] = useState(false);
  const [applyAll, setApplyAll] = useState(true);

  useEffect(() => {
    if (txn) {
      setCategory(txn.category);
      setNote(txn.note ?? '');
      setExcluded(txn.excluded === 1);
      setApplyAll(true);
    }
  }, [txn]);

  if (!txn) return null;

  const save = async () => {
    await updateTransaction(db, txn.id, { category, note: note.trim() || null, excluded });
    if (applyAll && category !== txn.category) {
      await applyCategoryToSimilar(db, txn.description, category);
    }
    refresh();
    onClose();
  };

  const remove = async () => {
    if (!(await confirmAction('Delete transaction?', 'This cannot be undone.', 'Delete'))) return;
    await deleteTransaction(db, txn.id);
    refresh();
    onClose();
  };

  return (
    <Sheet visible onClose={onClose} title="Transaction">
      <View style={styles.summary}>
        <Text style={[styles.desc, { color: c.text }]}>{txn.description}</Text>
        <Text style={{ color: c.textSecondary }}>{dayLabel(txn.date)}</Text>
        <Money cents={txn.amount_cents} currency={txn.currency} style={styles.bigAmount} />
      </View>

      <View>
        <FieldLabel>Category</FieldLabel>
        <CategoryPicker value={category} onChange={setCategory} />
        {category !== txn.category ? (
          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: c.text }]}>
              Use for all “{txn.description}” transactions, now and in future imports
            </Text>
            <Switch value={applyAll} onValueChange={setApplyAll} trackColor={{ false: c.baseline, true: c.primary }} thumbColor="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <View>
        <FieldLabel>Note</FieldLabel>
        <TextInput value={note} onChangeText={setNote} placeholder="Optional" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.switchLabel, { color: c.text }]}>Leave out of totals</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>
            For moving money between your own accounts, so it isn't counted twice.
          </Text>
        </View>
        <Switch value={excluded} onValueChange={setExcluded} trackColor={{ false: c.baseline, true: c.primary }} thumbColor="#FFFFFF" />
      </View>

      <Button label="Save" onPress={save} />
      <Button label="Delete transaction" variant="danger" icon="trash-outline" onPress={remove} />
    </Sheet>
  );
}

/** Add a transaction by hand, e.g. a cash payment. */
export function AddTransactionSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const db = useDb();
  const c = useColors();
  const { refresh, currency, setMonth } = useAppState();
  const [direction, setDirection] = useState<'out' | 'in'>('out');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayString());
  const [category, setCategory] = useState('other');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setDirection('out');
      setAmount('');
      setDescription('');
      setDate(todayString());
      setCategory('other');
      setNote('');
    }
  }, [visible]);

  const save = async () => {
    const cents = parseAmount(amount);
    if (cents === null || cents === 0) {
      notify('Enter an amount', 'For example 12.50');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      notify('Check the date', 'Use the format YYYY-MM-DD, for example 2026-09-28');
      return;
    }
    const signed = direction === 'out' ? -Math.abs(cents) : Math.abs(cents);
    await addManualTransaction(db, {
      date: `${date.trim()} 12:00:00`,
      description: description.trim() || (direction === 'out' ? 'Expense' : 'Income'),
      amountCents: signed,
      currency,
      category,
      note: note.trim() || undefined,
    });
    setMonth(date.trim().slice(0, 7));
    refresh();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add transaction">
      <Segmented
        options={[
          { key: 'out' as const, label: 'Money out' },
          { key: 'in' as const, label: 'Money in' },
        ]}
        value={direction}
        onChange={(d) => {
          setDirection(d);
          if (d === 'in' && category === 'other') setCategory('income');
          if (d === 'out' && category === 'income') setCategory('other');
        }}
      />
      <View>
        <FieldLabel>Amount</FieldLabel>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={c.textMuted}
          style={[inputStyle(c), { fontSize: 26, fontFamily: 'BricolageGrotesque_600SemiBold' }]}
        />
      </View>
      <View>
        <FieldLabel>Description</FieldLabel>
        <TextInput value={description} onChangeText={setDescription} placeholder="e.g. Market" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>
      <View>
        <FieldLabel>Date (YYYY-MM-DD)</FieldLabel>
        <TextInput value={date} onChangeText={setDate} autoCapitalize="none" style={inputStyle(c)} />
      </View>
      <View>
        <FieldLabel>Category</FieldLabel>
        <CategoryPicker value={category} onChange={setCategory} />
      </View>
      <View>
        <FieldLabel>Note</FieldLabel>
        <TextInput value={note} onChangeText={setNote} placeholder="Optional" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>
      <Button label="Add" onPress={save} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 4 },
  desc: { fontSize: 20, lineHeight: 26, fontFamily: 'BricolageGrotesque_600SemiBold' },
  bigAmount: { fontSize: 34, lineHeight: 40, fontFamily: 'BricolageGrotesque_700Bold', letterSpacing: -0.8, marginTop: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  switchLabel: { flex: 1, fontSize: 15, fontFamily: 'Geist_500Medium' },
  segment: { flexDirection: 'row', gap: space.sm },
});
