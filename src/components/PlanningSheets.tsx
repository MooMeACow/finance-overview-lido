import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Chip, FieldLabel, Sheet, inputStyle } from './ui';
import { CategoryPicker } from './CategoryPicker';
import { space, useColors } from '../theme';
import { useDb } from '../db/provider';
import { useAppState } from '../state';
import { confirmAction, notify } from '../lib/dialogs';
import { parseAmount, formatMoney } from '../lib/money';
import { isValidDay, todayString } from '../lib/dates';
import { getCategory } from '../lib/categories';
import {
  type Account,
  type Debt,
  type DebtDirection,
  type AccountType,
  type Plan,
  type PlanFrequency,
  deleteAccount,
  deleteDebt,
  deletePlan,
  saveAccount,
  saveDebt,
  savePlan,
  setBudget,
} from '../db/database';

const centsToInput = (cents: number) => (cents / 100).toFixed(2);

// ---------- Account ----------

/** Add or edit an account and its current balance. `account` null = new. */
export function AccountSheet({ visible, account, onClose }: { visible: boolean; account: Account | null; onClose: () => void }) {
  const db = useDb();
  const c = useColors();
  const { refresh, currency } = useAppState();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('current');
  const [balance, setBalance] = useState('');

  useEffect(() => {
    if (visible) {
      setName(account?.name ?? '');
      setType(account?.type ?? 'current');
      setBalance(account ? centsToInput(account.balance_cents) : '');
    }
  }, [visible, account]);

  const save = async () => {
    const cents = parseAmount(balance);
    if (!name.trim()) return notify('Name the account', 'For example Revolut, ING or Cash.');
    if (cents === null) return notify('Enter the balance', 'For example 1250.00 (use a minus sign if it is negative).');
    await saveAccount(db, { id: account?.id, name: name.trim(), type, balanceCents: cents, currency: account?.currency ?? currency });
    refresh();
    onClose();
  };

  const remove = async () => {
    if (!account) return;
    if (!(await confirmAction('Delete account?', `${account.name} will be removed from your total.`, 'Delete'))) return;
    await deleteAccount(db, account.id);
    refresh();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={account ? 'Edit account' : 'Add account'}>
      <View>
        <FieldLabel>Name</FieldLabel>
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Revolut" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>
      <View>
        <FieldLabel>Type</FieldLabel>
        <View style={styles.chips}>
          <Chip label="Current" icon="card-outline" selected={type === 'current'} onPress={() => setType('current')} />
          <Chip label="Savings & investments" icon="trending-up-outline" selected={type === 'savings'} onPress={() => setType('savings')} />
        </View>
      </View>
      <View>
        <FieldLabel>Current balance</FieldLabel>
        <TextInput
          value={balance}
          onChangeText={setBalance}
          keyboardType="numbers-and-punctuation"
          placeholder="0.00"
          placeholderTextColor={c.textMuted}
          style={[inputStyle(c), styles.bigInput]}
        />
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Check your bank app and type what's there now. Update it whenever you like.
        </Text>
      </View>
      <Button label="Save" onPress={save} />
      {account ? <Button label="Delete account" variant="danger" icon="trash-outline" onPress={remove} /> : null}
    </Sheet>
  );
}

// ---------- Plan ----------

const FREQUENCIES: { key: PlanFrequency; label: string }[] = [
  { key: 'monthly', label: 'Every month' },
  { key: 'yearly', label: 'Every year' },
  { key: 'once', label: 'Once' },
];

/** Add or edit a planned expense or income. `plan` null = new, with `defaultKind`. */
export function PlanSheet({
  visible,
  plan,
  defaultKind = 'expense',
  onClose,
}: {
  visible: boolean;
  plan: Plan | null;
  defaultKind?: 'expense' | 'income';
  onClose: () => void;
}) {
  const db = useDb();
  const c = useColors();
  const { refresh } = useAppState();
  const [kind, setKind] = useState<'expense' | 'income'>(defaultKind);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<PlanFrequency>('monthly');
  const [startDate, setStartDate] = useState(todayString());
  const [endDate, setEndDate] = useState('');
  const [category, setCategory] = useState('other');

  useEffect(() => {
    if (!visible) return;
    const k = plan?.kind ?? defaultKind;
    setKind(k);
    setDescription(plan?.description ?? '');
    setAmount(plan ? centsToInput(plan.amount_cents) : '');
    setFrequency(plan?.frequency ?? 'monthly');
    setStartDate(plan?.start_date ?? todayString());
    setEndDate(plan?.end_date ?? '');
    setCategory(plan?.category ?? (k === 'income' ? 'income' : 'other'));
  }, [visible, plan, defaultKind]);

  const save = async () => {
    const cents = parseAmount(amount);
    if (!description.trim()) return notify('Add a description', 'For example Rent, Salary or Trip to Lisbon.');
    if (cents === null || cents === 0) return notify('Enter an amount', 'For example 850.00');
    if (!isValidDay(startDate.trim())) return notify('Check the date', 'Use the format YYYY-MM-DD, for example 2026-10-01.');
    const end = frequency === 'once' ? null : endDate.trim() || null;
    if (end && (!isValidDay(end) || end < startDate.trim())) {
      return notify('Check the end date', 'Use YYYY-MM-DD, on or after the start date. Leave it empty if it keeps going.');
    }
    await savePlan(db, {
      id: plan?.id,
      kind,
      description: description.trim(),
      amount_cents: Math.abs(cents),
      category,
      frequency,
      start_date: startDate.trim(),
      end_date: end,
    });
    refresh();
    onClose();
  };

  const remove = async () => {
    if (!plan) return;
    if (!(await confirmAction('Delete plan?', `${plan.description} will be removed from your forecast.`, 'Delete'))) return;
    await deletePlan(db, plan.id);
    refresh();
    onClose();
  };

  const isIncome = kind === 'income';
  const dateLabel = frequency === 'once' ? 'Date' : frequency === 'monthly' ? 'First date (repeats on this day each month)' : 'First date (repeats on this date each year)';

  return (
    <Sheet visible={visible} onClose={onClose} title={plan ? 'Edit plan' : isIncome ? 'Add expected income' : 'Add planned expense'}>
      <View style={styles.row}>
        {(['expense', 'income'] as const).map((k) => (
          <View key={k} style={{ flex: 1 }}>
            <Button
              label={k === 'expense' ? 'Expense' : 'Income'}
              variant={kind === k ? 'primary' : 'secondary'}
              onPress={() => {
                setKind(k);
                if (k === 'income') setCategory('income');
                else if (category === 'income') setCategory('other');
              }}
            />
          </View>
        ))}
      </View>
      <View>
        <FieldLabel>Description</FieldLabel>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={isIncome ? 'e.g. Salary' : 'e.g. Rent'}
          placeholderTextColor={c.textMuted}
          style={inputStyle(c)}
        />
      </View>
      <View>
        <FieldLabel>Amount</FieldLabel>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.textMuted} style={[inputStyle(c), styles.bigInput]} />
      </View>
      <View>
        <FieldLabel>How often</FieldLabel>
        <View style={styles.chips}>
          {FREQUENCIES.map((f) => (
            <Chip key={f.key} label={f.label} selected={frequency === f.key} onPress={() => setFrequency(f.key)} />
          ))}
        </View>
      </View>
      <View>
        <FieldLabel>{`${dateLabel} · YYYY-MM-DD`}</FieldLabel>
        <TextInput value={startDate} onChangeText={setStartDate} autoCapitalize="none" style={inputStyle(c)} />
      </View>
      {frequency !== 'once' ? (
        <View>
          <FieldLabel>End date (optional) · YYYY-MM-DD</FieldLabel>
          <TextInput
            value={endDate}
            onChangeText={setEndDate}
            autoCapitalize="none"
            placeholder="Keeps going"
            placeholderTextColor={c.textMuted}
            style={inputStyle(c)}
          />
        </View>
      ) : null}
      {!isIncome ? (
        <View>
          <FieldLabel>Category</FieldLabel>
          <CategoryPicker value={category} onChange={setCategory} />
        </View>
      ) : null}
      <Button label="Save" onPress={save} />
      {plan ? <Button label="Delete plan" variant="danger" icon="trash-outline" onPress={remove} /> : null}
    </Sheet>
  );
}

// ---------- Debt ----------

/** Add or edit money someone owes you (or you owe). `debt` null = new. */
export function DebtSheet({ visible, debt, onClose }: { visible: boolean; debt: Debt | null; onClose: () => void }) {
  const db = useDb();
  const c = useColors();
  const { refresh } = useAppState();
  const [person, setPerson] = useState('');
  const [direction, setDirection] = useState<DebtDirection>('owed_to_me');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setPerson(debt?.person ?? '');
      setDirection(debt?.direction ?? 'owed_to_me');
      setAmount(debt ? centsToInput(debt.amount_cents) : '');
      setNote(debt?.note ?? '');
    }
  }, [visible, debt]);

  const save = async () => {
    const cents = parseAmount(amount);
    if (!person.trim()) return notify('Who is it?', 'Enter the name of the person.');
    if (cents === null || cents <= 0) return notify('Enter the amount still open', 'For example 430.00');
    await saveDebt(db, { id: debt?.id, person: person.trim(), direction, amountCents: cents, note: note.trim() || null });
    refresh();
    onClose();
  };

  const remove = async () => {
    if (!debt) return;
    const settled = debt.direction === 'owed_to_me' ? `${debt.person} has paid you back` : `you've paid ${debt.person} back`;
    if (!(await confirmAction('Remove debt?', `Remove this when ${settled}.`, 'Remove'))) return;
    await deleteDebt(db, debt.id);
    refresh();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={debt ? 'Edit debt' : 'Add debt'}>
      <View style={styles.row}>
        {(['owed_to_me', 'i_owe'] as const).map((d) => (
          <View key={d} style={{ flex: 1 }}>
            <Button label={d === 'owed_to_me' ? 'Owes me' : 'I owe'} variant={direction === d ? 'primary' : 'secondary'} onPress={() => setDirection(d)} />
          </View>
        ))}
      </View>
      <View>
        <FieldLabel>Person</FieldLabel>
        <TextInput value={person} onChangeText={setPerson} placeholder="Name" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>
      <View>
        <FieldLabel>Amount still open</FieldLabel>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.textMuted} style={[inputStyle(c), styles.bigInput]} />
        <Text style={[styles.hint, { color: c.textSecondary }]}>When part is paid back, lower this amount.</Text>
      </View>
      <View>
        <FieldLabel>Note (optional)</FieldLabel>
        <TextInput value={note} onChangeText={setNote} placeholder="e.g. ₱30,000 or due in December" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </View>
      <Button label="Save" onPress={save} />
      {debt ? <Button label="Paid back · remove" variant="danger" icon="checkmark-done-outline" onPress={remove} /> : null}
    </Sheet>
  );
}

// ---------- Budget ----------

/** Set, change or remove a monthly budget for a category. */
export function BudgetSheet({
  visible,
  category: initialCategory,
  limitCents,
  spentCents,
  onClose,
}: {
  visible: boolean;
  category: string | null; // null = new budget
  limitCents: number | null;
  spentCents: number;
  onClose: () => void;
}) {
  const db = useDb();
  const c = useColors();
  const { refresh, currency } = useAppState();
  const [category, setCategory] = useState('groceries');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (visible) {
      setCategory(initialCategory ?? 'groceries');
      setAmount(limitCents !== null ? centsToInput(limitCents) : '');
    }
  }, [visible, initialCategory, limitCents]);

  const save = async () => {
    const cents = parseAmount(amount);
    if (cents === null || cents <= 0) return notify('Enter a monthly amount', 'For example 300.00');
    if (initialCategory && initialCategory !== category) await setBudget(db, initialCategory, null);
    await setBudget(db, category, cents);
    refresh();
    onClose();
  };

  const remove = async () => {
    if (!initialCategory) return;
    await setBudget(db, initialCategory, null);
    refresh();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={initialCategory ? `${getCategory(initialCategory).label} budget` : 'Add budget'}>
      <Text style={[styles.hint, { color: c.textSecondary, marginTop: 0 }]}>
        A monthly limit for day-to-day spending in one category. What's left of it counts as expected spending in your
        forecast, so don't also add a budget for things you've planned as expenses (like rent).
      </Text>
      {initialCategory ? (
        <Text style={{ color: c.text, fontSize: 15 }}>Spent this month: {formatMoney(spentCents, currency)}</Text>
      ) : null}
      <View>
        <FieldLabel>Category</FieldLabel>
        <CategoryPicker value={category} onChange={setCategory} />
      </View>
      <View>
        <FieldLabel>Monthly limit</FieldLabel>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={c.textMuted} style={[inputStyle(c), styles.bigInput]} />
      </View>
      <Button label="Save" onPress={save} />
      {initialCategory ? <Button label="Remove budget" variant="danger" icon="trash-outline" onPress={remove} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bigInput: { fontSize: 24, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18, marginTop: 6 },
});
