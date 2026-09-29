import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { useDb } from '../db/provider';
import { notify } from '../lib/dialogs';
import { toast } from '../lib/toast';

import { Button, FieldLabel, inputStyle, Segmented, Text } from './ui';
import { HoldButton, Sheet, SheetFooter } from './Sheet';
import { AmountField } from './fields';
import { DateField } from './DateField';
import { CategoryPicker } from './CategoryPicker';
import { ReceiptPreview } from './SheetPreviews';
import { space, useColors } from '../theme';
import { dayLabel, isValidDay, todayString } from '../lib/dates';
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
  // Keep showing the last transaction while the card animates out
  const last = useRef<Txn | null>(txn);
  if (txn) last.current = txn;
  const shown = txn ?? last.current;

  useEffect(() => {
    if (txn) {
      setCategory(txn.category);
      setNote(txn.note ?? '');
      setExcluded(txn.excluded === 1);
      setApplyAll(true);
    }
  }, [txn]);

  if (!shown) return null;

  const save = async () => {
    await updateTransaction(db, shown.id, { category, note: note.trim() || null, excluded });
    let similar = 0;
    if (applyAll && category !== shown.category) similar = await applyCategoryToSimilar(db, shown.description, category);
    refresh();
    onClose();
    toast(similar > 1 ? `Saved, and ${similar - 1} more like it` : 'Transaction saved');
  };

  const remove = async () => {
    await deleteTransaction(db, shown.id);
    refresh();
    onClose();
    toast('Transaction deleted', 'removed');
  };

  return (
    <Sheet
      visible={!!txn}
      onClose={onClose}
      title="Transaction"
      subtitle={dayLabel(shown.date)}
      preview={
        <ReceiptPreview
          description={shown.description}
          date={shown.date}
          amountCents={shown.amount_cents}
          currency={shown.currency}
          category={category}
          note={note}
          excluded={excluded}
        />
      }
      footer={
        <SheetFooter>
          <HoldButton label="Hold to delete" onConfirm={remove} />
          <View style={{ flex: 1 }} />
          <Button label="Save" icon="checkmark" onPress={save} />
        </SheetFooter>
      }
    >
      <View>
        <FieldLabel>Category</FieldLabel>
        <CategoryPicker value={category} onChange={setCategory} />
        {category !== shown.category ? (
          <View style={[styles.switchRow, { backgroundColor: c.cardSunk }]}>
            <Text style={[styles.switchLabel, { color: c.text }]}>Use for all “{shown.description}” transactions, now and in future imports</Text>
            <Switch value={applyAll} onValueChange={setApplyAll} trackColor={{ false: c.baseline, true: c.primary }} thumbColor="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <View>
        <FieldLabel>Note</FieldLabel>
        <TextInput value={note} onChangeText={setNote} placeholder="Optional" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>

      <View style={[styles.switchRow, { backgroundColor: c.cardSunk }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.switchLabel, { color: c.text }]}>Leave out of totals</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13, lineHeight: 18 }}>For moving money between your own accounts, so it isn't counted twice.</Text>
        </View>
        <Switch value={excluded} onValueChange={setExcluded} trackColor={{ false: c.baseline, true: c.primary }} thumbColor="#FFFFFF" />
      </View>
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

  const cents = Math.abs(parseAmount(amount) ?? 0);
  const signed = direction === 'out' ? -cents : cents;

  const save = async () => {
    if (cents === 0) {
      notify('Enter an amount', 'For example 12.50');
      return;
    }
    if (!isValidDay(date.trim())) {
      notify('Pick a date', 'Choose the day the money moved.');
      return;
    }
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
    toast('Transaction added');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add transaction"
      subtitle="For cash and anything not in a statement"
      preview={<ReceiptPreview description={description} date={date} amountCents={signed} currency={currency} category={category} note={note} />}
      footer={
        <SheetFooter>
          <View style={{ flex: 1 }} />
          <Button label="Add transaction" icon="add" onPress={save} />
        </SheetFooter>
      }
    >
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
        <AmountField label="Amount" value={amount} onChange={setAmount} currency={currency} />
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1.4, minWidth: 180 }}>
          <FieldLabel>Description</FieldLabel>
          <TextInput value={description} onChangeText={setDescription} placeholder="e.g. Market" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
        </View>
        <View style={{ flex: 1, minWidth: 160 }}>
          <FieldLabel>Date</FieldLabel>
          <DateField label="Date" value={date} onChange={setDate} />
        </View>
      </View>
      <View>
        <FieldLabel>Category</FieldLabel>
        <CategoryPicker value={category} onChange={setCategory} />
      </View>
      <View>
        <FieldLabel>Note</FieldLabel>
        <TextInput value={note} onChangeText={setNote} placeholder="Optional" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, padding: space.lg, borderRadius: 16 },
  switchLabel: { flex: 1, fontSize: 15, fontFamily: 'Geist_500Medium' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
});
