/**
 * Merging data from two devices.
 *
 * Three-way merge: `base` is what both sides last agreed on (the last sync),
 * `local` is this device, `remote` is what the server has now. For every
 * record (by id, or by key for rules and budgets):
 * - changed on one side only → that change wins
 * - changed on both sides → this device wins, except that an edit always beats
 *   a delete, so nothing you changed is lost
 * - deleted on one side and untouched on the other → deleted
 *
 * Afterwards, the same bank transaction imported on two devices (same hash) is
 * kept once (preferring the copy that was already synced, and keeping any
 * category, note or "not counted" change), and imports left without
 * transactions are removed.
 *
 * Without a base (a device's first sync, or restoring a backup) both sides may
 * use the same old-style ids (1, 2, 3…) for different records; those get a new
 * id instead of one replacing the other.
 */
import type { Data, StoredTxn } from '../db/database.web';
import { empty, newId } from '../db/database.web';

/** JSON with sorted keys, so equal records compare equal regardless of key order. */
function stable(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(',')}}`;
}

const same = (a: unknown, b: unknown) => stable(a) === stable(b);

function mergeValue<T>(base: T | undefined, local: T | undefined, remote: T | undefined): T | undefined {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  // Changed on both sides: keep an edit over a delete, otherwise this device wins
  if (local === undefined) return remote;
  return local;
}

function mergeBy<T>(base: T[], local: T[], remote: T[], keyOf: (x: T) => string): T[] {
  const b = new Map(base.map((x) => [keyOf(x), x]));
  const l = new Map(local.map((x) => [keyOf(x), x]));
  const r = new Map(remote.map((x) => [keyOf(x), x]));
  const keys = new Set([...l.keys(), ...r.keys(), ...b.keys()]);
  const out: T[] = [];
  for (const k of keys) {
    const v = mergeValue(b.get(k), l.get(k), r.get(k));
    if (v !== undefined) out.push(v);
  }
  return out;
}

function mergeRecord(base: Record<string, string>, local: Record<string, string>, remote: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(base)])) {
    const v = mergeValue(base[k], local[k], remote[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const byId = (x: { id: number }) => String(x.id);

/**
 * Gives records in `other` a new id where the same id is used locally for a
 * different record. Transactions follow their import's new id.
 */
function separateIds(local: Data, other: Data): Data {
  const renumber = <T extends { id: number }>(mine: T[], theirs: T[]) => {
    const byMyId = new Map(mine.map((x) => [x.id, x]));
    const moved = new Map<number, number>();
    const list = theirs.map((x) => {
      const clash = byMyId.get(x.id);
      if (!clash || same(clash, x)) return x;
      const id = newId();
      moved.set(x.id, id);
      return { ...x, id };
    });
    return { list, moved };
  };
  const imports = renumber(local.imports, other.imports);
  const txnsWithImports = other.transactions.map((t) =>
    t.import_id !== null && imports.moved.has(t.import_id) ? { ...t, import_id: imports.moved.get(t.import_id)! } : t,
  );
  return {
    ...other,
    imports: imports.list,
    transactions: renumber(local.transactions, txnsWithImports).list,
    accounts: renumber(local.accounts, other.accounts).list,
    plans: renumber(local.plans, other.plans).list,
    debts: renumber(local.debts, other.debts).list,
  };
}

/** One transaction per bank line (hash). Keeps the synced copy and any edits made to the others. */
function dedupeTransactions(transactions: StoredTxn[], base: Data): StoredTxn[] {
  const inBase = new Map(base.transactions.map((t) => [t.id, t]));
  const groups = new Map<string, StoredTxn[]>();
  const out: StoredTxn[] = [];
  for (const t of transactions) {
    if (!t.hash) {
      out.push(t);
      continue;
    }
    const g = groups.get(t.hash);
    if (g) g.push(t);
    else groups.set(t.hash, [t]);
  }
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    group.sort((a, b) => a.id - b.id);
    const survivor = { ...(group.find((t) => inBase.has(t.id)) ?? group[0]) };
    // Keep changes made to any copy: a copy that differs from how it was last synced was edited
    for (const t of group) {
      if (t.id === survivor.id) continue;
      const was = inBase.get(t.id);
      const edited = was ? !same({ c: was.category, n: was.note, e: was.excluded }, { c: t.category, n: t.note, e: t.excluded }) : false;
      if (edited) {
        survivor.category = t.category;
        survivor.excluded = t.excluded;
        survivor.note = t.note ?? survivor.note;
      } else if (!survivor.note && t.note) {
        survivor.note = t.note;
      }
    }
    out.push(survivor);
  }
  return out.sort((a, b) => a.id - b.id);
}

export function mergeData(base: Data | null, local: Data, remote: Data): Data {
  const o = { ...empty(), ...(base ?? {}) };
  const l = { ...empty(), ...local };
  const r = base ? { ...empty(), ...remote } : separateIds(l, { ...empty(), ...remote });

  const transactions = dedupeTransactions(mergeBy<StoredTxn>(o.transactions, l.transactions, r.transactions, byId), o);

  const usedImports = new Set(transactions.map((t) => t.import_id));
  const imports = mergeBy(o.imports, l.imports, r.imports, byId)
    .filter((i) => usedImports.has(i.id))
    .sort((a, b) => a.id - b.id);

  return {
    ...empty(),
    transactions,
    imports,
    rules: mergeRecord(o.rules, l.rules, r.rules),
    accounts: mergeBy(o.accounts, l.accounts, r.accounts, byId).sort((a, b) => a.id - b.id),
    plans: mergeBy(o.plans, l.plans, r.plans, byId).sort((a, b) => a.id - b.id),
    budgets: mergeBy(o.budgets, l.budgets, r.budgets, (b) => b.category),
    debts: mergeBy(o.debts, l.debts, r.debts, byId).sort((a, b) => a.id - b.id),
  };
}

/** True if two data sets hold the same records (ignores order). */
export function sameData(a: Data, b: Data): boolean {
  const norm = (d: Data) => {
    const x = { ...empty(), ...d };
    const sort = <T extends { id: number }>(arr: T[]) => [...arr].sort((p, q) => p.id - q.id);
    return stable({
      transactions: sort(x.transactions),
      imports: sort(x.imports),
      rules: x.rules,
      accounts: sort(x.accounts),
      plans: sort(x.plans),
      budgets: [...x.budgets].sort((p, q) => p.category.localeCompare(q.category)),
      debts: sort(x.debts),
    });
  };
  return norm(a) === norm(b);
}
