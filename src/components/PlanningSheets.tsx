import React, { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, FieldLabel, Segmented, Text, inputStyle } from './ui';
import { HoldButton, Sheet, SheetFooter } from './Sheet';
import { AmountField, RadioList } from './fields';
import { DateField } from './DateField';
import { CategoryPicker } from './CategoryPicker';
import { AccountPreview, BudgetPreview, DebtPreview, PlanPreview } from './SheetPreviews';
import { space, type as T, useColors } from '../theme';
import { useDb } from '../db/provider';
import { useAppState } from '../state';
import { notify } from '../lib/dialogs';
import { toast } from '../lib/toast';
import { parseAmount, formatMoney } from '../lib/money';
import { isValidDay, todayString } from '../lib/dates';
import { getCategory } from '../lib/categories';
import { ACCOUNT_LINKS, linkLabel, type LiveAccount } from '../lib/balances';
import { shortDate } from '../lib/dates';
import { raft } from '../lido/buses';
import {
  type Account,
  type Debt,
  type DebtDirection,
  type AccountLink,
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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  const c = useColors();
  return (
    <View>
      <FieldLabel>{label}</FieldLabel>
      {children}
      {hint ? <Text style={[styles.hint, { color: c.textSecondary }]}>{hint}</Text> : null}
    </View>
  );
}

// ---------- Account ----------

/** Add or edit an account and its current balance. `account` null = new. */
export function AccountSheet({
  visible,
  account,
  largestCents = 0,
  onClose,
}: {
  visible: boolean;
  /** The account as shown, with its up-to-date balance */
  account: (Account & Partial<LiveAccount>) | null;
  /** The biggest balance in the pool, so the preview's pebble is sized the same way */
  largestCents?: number;
  onClose: () => void;
}) {
  const db = useDb();
  const c = useColors();
  const { refresh, currency } = useAppState();
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('current');
  const [link, setLink] = useState<AccountLink | null>(null);
  const [balance, setBalance] = useState('');

  useEffect(() => {
    if (visible) {
      setName(account?.name ?? '');
      setType(account?.type ?? 'current');
      setLink(account?.link ?? null);
      setBalance(account ? centsToInput(account.balance_cents) : '');
    }
  }, [visible, account]);

  const save = async () => {
    const cents = parseAmount(balance);
    if (!name.trim()) return notify('Name the account', 'For example Revolut, ING or Cash.');
    if (cents === null) return notify('Enter the balance', 'For example 1250.00 (use a minus sign if it is negative).');
    // Only a changed balance becomes a new starting point; otherwise keep the old one and its date
    const balanceChanged = !account || cents !== account.balance_cents;
    await saveAccount(db, {
      id: account?.id,
      name: name.trim(),
      type,
      link,
      balanceCents: balanceChanged ? cents : undefined,
      currency: account?.currency ?? currency,
    });
    refresh();
    onClose();
    toast(account ? `${name.trim()} saved` : `${name.trim()} added`);
    if (account) setTimeout(() => raft.cheer(account.id), 260);
  };

  const remove = async () => {
    if (!account) return;
    await deleteAccount(db, account.id);
    refresh();
    onClose();
    toast(`${account.name} deleted`, 'removed');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={account ? 'Edit account' : 'Add account'}
      subtitle={account ? (account.link ? `Keeps up with ${linkLabel(account.link)}` : `Balance typed in on ${shortDate(account.updated_at)}`) : 'A bank account, savings or cash'}
      preview={<AccountPreview id={account?.id ?? null} name={name} type={type} balance={balance} currency={account?.currency ?? currency} largestCents={largestCents} />}
      footer={
        <SheetFooter>
          {account ? <HoldButton label="Hold to delete" onConfirm={remove} /> : null}
          <View style={{ flex: 1 }} />
          <Button label={account ? 'Save' : 'Add account'} icon="checkmark" onPress={save} />
        </SheetFooter>
      }
    >
      <Field label="Name">
        <TextInput value={name} onChangeText={setName} placeholder="e.g. Revolut" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </Field>
      <Field label="Type">
        <Segmented
          options={[
            { key: 'current' as const, label: 'Current' },
            { key: 'savings' as const, label: 'Savings & investments' },
          ]}
          value={type}
          onChange={setType}
        />
      </Field>
      <Field
        label="Current balance"
        hint={
          account?.change_count
            ? `You typed ${formatMoney(account.entered_cents ?? 0)} on ${shortDate(account.updated_at)}; ${account.change_count} imported transaction${account.change_count === 1 ? '' : 's'} since then changed it by ${formatMoney(account.change_cents ?? 0, 'EUR', 'always')}. Change the amount only if it doesn't match your bank app.`
            : "Check your bank app and type what's there now. Update it whenever you like."
        }
      >
        <AmountField label="Current balance" value={balance} onChange={setBalance} currency={account?.currency ?? currency} allowNegative />
      </Field>
      <Field
        label="Update automatically from imported statements"
        hint={
          link
            ? 'Transactions dated after the day you last typed in the balance are added to it.'
            : 'Pick the statements that belong to this account to keep its balance up to date when you import them.'
        }
      >
        <RadioList
          options={[{ key: null, label: "Don't update automatically", hint: 'Only the balance you type in' }, ...ACCOUNT_LINKS]}
          value={link}
          onChange={setLink}
        />
      </Field>
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
  const { refresh, currency } = useAppState();
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
    if (!isValidDay(startDate.trim())) return notify('Pick a date', 'Choose the day it (first) happens.');
    const end = frequency === 'once' ? null : endDate.trim() || null;
    if (end && (!isValidDay(end) || end < startDate.trim())) {
      return notify('Check the end date', 'It should be on or after the first date. Leave it empty if it keeps going.');
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
    toast(plan ? 'Plan saved' : kind === 'income' ? 'Income added to your plans' : 'Expense added to your plans');
  };

  const remove = async () => {
    if (!plan) return;
    await deletePlan(db, plan.id);
    refresh();
    onClose();
    toast(`${plan.description} removed from your plans`, 'removed');
  };

  const isIncome = kind === 'income';
  const dateLabel = frequency === 'once' ? 'Date' : frequency === 'monthly' ? 'First date (repeats on this day each month)' : 'First date (repeats on this date each year)';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={plan ? 'Edit plan' : isIncome ? 'Add expected income' : 'Add planned expense'}
      subtitle="Counts in your expected balance"
      preview={<PlanPreview kind={kind} description={description} amount={amount} frequency={frequency} startDate={startDate} endDate={endDate} currency={currency} />}
      footer={
        <SheetFooter>
          {plan ? <HoldButton label="Hold to delete" onConfirm={remove} /> : null}
          <View style={{ flex: 1 }} />
          <Button label={plan ? 'Save' : 'Add plan'} icon="checkmark" onPress={save} />
        </SheetFooter>
      }
    >
      <Segmented
        options={[
          { key: 'expense' as const, label: 'Expense' },
          { key: 'income' as const, label: 'Income' },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          if (k === 'income') setCategory('income');
          else if (category === 'income') setCategory('other');
        }}
      />
      <Field label="Description">
        <TextInput value={description} onChangeText={setDescription} placeholder={isIncome ? 'e.g. Salary' : 'e.g. Rent'} placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </Field>
      <Field label="Amount">
        <AmountField label="Amount" value={amount} onChange={setAmount} currency={currency} />
      </Field>
      <Field label="How often">
        <Segmented options={FREQUENCIES} value={frequency} onChange={setFrequency} />
      </Field>
      <View style={styles.dates}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Field label={dateLabel}>
            <DateField label={dateLabel} value={startDate} onChange={setStartDate} />
          </Field>
        </View>
        {frequency !== 'once' ? (
          <View style={{ flex: 1, minWidth: 180 }}>
            <Field label="Until (optional)">
              <DateField label="End date" value={endDate} onChange={setEndDate} optional />
            </Field>
          </View>
        ) : null}
      </View>
      {!isIncome ? (
        <Field label="Category">
          <CategoryPicker value={category} onChange={setCategory} exclude={['income', 'topup', 'transfers']} />
        </Field>
      ) : null}
    </Sheet>
  );
}

// ---------- Debt ----------

/** Add or edit money someone owes you (or you owe). `debt` null = new. */
export function DebtSheet({ visible, debt, onClose }: { visible: boolean; debt: Debt | null; onClose: () => void }) {
  const db = useDb();
  const c = useColors();
  const { refresh, currency } = useAppState();
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
    toast(debt ? 'Debt saved' : 'Debt added');
  };

  const remove = async () => {
    if (!debt) return;
    await deleteDebt(db, debt.id);
    refresh();
    onClose();
    toast(debt.direction === 'owed_to_me' ? `${debt.person} has paid you back` : `You've paid ${debt.person} back`, 'removed');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={debt ? 'Edit debt' : 'Add debt'}
      subtitle="Not counted in your total or forecast"
      preview={<DebtPreview person={person} direction={direction} amount={amount} currency={currency} />}
      footer={
        <SheetFooter>
          {debt ? <HoldButton label="Hold: paid back" onConfirm={remove} /> : null}
          <View style={{ flex: 1 }} />
          <Button label={debt ? 'Save' : 'Add debt'} icon="checkmark" onPress={save} />
        </SheetFooter>
      }
    >
      <Segmented
        options={[
          { key: 'owed_to_me' as const, label: 'Owes me' },
          { key: 'i_owe' as const, label: 'I owe' },
        ]}
        value={direction}
        onChange={setDirection}
      />
      <Field label="Person">
        <TextInput value={person} onChangeText={setPerson} placeholder="Name" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </Field>
      <Field label="Amount still open" hint="When part is paid back, lower this amount.">
        <AmountField label="Amount still open" value={amount} onChange={setAmount} currency={currency} />
      </Field>
      <Field label="Note (optional)">
        <TextInput value={note} onChangeText={setNote} placeholder="e.g. ₱30,000 or due in December" placeholderTextColor={c.textMuted} style={inputStyle(c)} />
      </Field>
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
  spentByCategory,
  onClose,
}: {
  visible: boolean;
  category: string | null; // null = new budget
  limitCents: number | null;
  spentCents: number;
  /** This month's spending per category, so the preview follows the chosen category */
  spentByCategory?: Map<string, number>;
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

  const spent = spentByCategory?.get(category) ?? (category === initialCategory ? spentCents : 0);

  const save = async () => {
    const cents = parseAmount(amount);
    if (cents === null || cents <= 0) return notify('Enter a monthly amount', 'For example 300.00');
    if (initialCategory && initialCategory !== category) await setBudget(db, initialCategory, null);
    await setBudget(db, category, cents);
    refresh();
    onClose();
    toast(`${getCategory(category).label} budget saved`);
  };

  const remove = async () => {
    if (!initialCategory) return;
    await setBudget(db, initialCategory, null);
    refresh();
    onClose();
    toast(`${getCategory(initialCategory).label} budget removed`, 'removed');
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={initialCategory ? `${getCategory(initialCategory).label} budget` : 'Add budget'}
      subtitle="A monthly limit for day-to-day spending"
      preview={<BudgetPreview category={category} limit={amount} spentCents={spent} currency={currency} />}
      footer={
        <SheetFooter>
          {initialCategory ? <HoldButton label="Hold to remove" onConfirm={remove} /> : null}
          <View style={{ flex: 1 }} />
          <Button label={initialCategory ? 'Save' : 'Add budget'} icon="checkmark" onPress={save} />
        </SheetFooter>
      }
    >
      <Text style={[T.body, { color: c.textSecondary }]}>
        What's left of it counts as expected spending in your forecast, so don't also add a budget for things you've planned as
        expenses (like rent).
      </Text>
      <Field label="Monthly limit">
        <AmountField label="Monthly limit" value={amount} onChange={setAmount} currency={currency} />
      </Field>
      <Field label="Category">
        <CategoryPicker value={category} onChange={setCategory} exclude={['income', 'topup', 'transfers']} />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 19, marginTop: 8 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
});
