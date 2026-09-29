import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { deriveKey, encryptJson, decryptJson, keyForVault, newSalt, readVault, WrongPassphraseError } from '../src/lib/vaultCrypto.ts';
import { mergeData, sameData } from '../src/lib/syncMerge.ts';
import { empty, type Data } from '../src/db/database.web.ts';
import { toTable } from '../src/lib/csv.ts';
import { parseIng } from '../src/lib/importers.ts';

const FAST = 1000; // fewer PBKDF2 rounds to keep tests quick

test('encryption: round trip, wrong passphrase, nothing readable in the vault', async () => {
  const salt = newSalt();
  const key = await deriveKey('correct horse battery staple', salt, FAST);
  const data = { accounts: [{ name: 'ING savings', balance_cents: 98637 }], note: 'Oranje Spaarrekening €' };
  const vault = await encryptJson(key, salt, data, FAST);
  assert.ok(!vault.includes('ING savings') && !vault.includes('98637') && !vault.includes('Oranje'));
  assert.deepEqual(await decryptJson(key, vault), data);

  // Another device: derive the key from the passphrase and the vault's salt
  const { key: key2 } = await keyForVault('correct horse battery staple', vault);
  assert.deepEqual(await decryptJson(key2, vault), data);

  const { key: wrong } = await keyForVault('wrong passphrase', vault);
  await assert.rejects(decryptJson(wrong, vault), WrongPassphraseError);

  // Fresh random iv every time
  const again = await encryptJson(key, salt, data, FAST);
  assert.notEqual(readVault(again).iv, readVault(vault).iv);
  // Tampering is detected
  const v = readVault(vault);
  const bytes = Buffer.from(v.ct, 'base64');
  bytes[0] ^= 1;
  await assert.rejects(decryptJson(key, JSON.stringify({ ...v, ct: bytes.toString('base64') })), WrongPassphraseError);
});

test('encryption: large data (thousands of transactions)', async () => {
  const salt = newSalt();
  const key = await deriveKey('pw', salt, FAST);
  const big = { transactions: Array.from({ length: 20000 }, (_, i) => ({ id: i, description: 'Albert Heijn 2228 ALKMAAR', amount_cents: -i })) };
  const vault = await encryptJson(key, salt, big, FAST);
  assert.equal((await decryptJson<typeof big>(key, vault)).transactions.length, 20000);
});

// ---------- merge ----------

const account = (id: number, name: string, balance: number) => ({
  id, name, type: 'current' as const, link: null, balance_cents: balance, currency: 'EUR', updated_at: '2026-09-28 20:00:00',
});
const data = (p: Partial<Data>): Data => ({ ...empty(), ...p });

test('merge: changes on different devices are all kept', () => {
  const base = data({ accounts: [account(1, 'ING current', 9500), account(2, 'ING savings', 98637)] });
  const laptopA = data({ accounts: [account(1, 'ING current', 12000), account(2, 'ING savings', 98637)], budgets: [{ category: 'groceries', limit_cents: 35000 }] });
  const laptopB = data({ accounts: [account(1, 'ING current', 9500), account(2, 'ING savings', 110000), account(3, 'Cash', 2000)] });
  const m = mergeData(base, laptopA, laptopB);
  assert.deepEqual(m.accounts.map((a) => [a.name, a.balance_cents]), [['ING current', 12000], ['ING savings', 110000], ['Cash', 2000]]);
  assert.deepEqual(m.budgets, [{ category: 'groceries', limit_cents: 35000 }]);
});

test('merge: deletes, and an edit beats a delete', () => {
  const base = data({ accounts: [account(1, 'A', 1), account(2, 'B', 2)] });
  const local = data({ accounts: [account(2, 'B', 2)] }); // deleted A
  const remote = data({ accounts: [account(1, 'A', 1), account(2, 'B edited', 5)] });
  assert.deepEqual(mergeData(base, local, remote).accounts.map((a) => a.name), ['B edited']);

  const local2 = data({ accounts: [account(1, 'A', 1)] }); // deleted B
  assert.deepEqual(mergeData(base, local2, remote).accounts.map((a) => a.name), ['A', 'B edited']);
});

test('merge: both sides edit the same record → this device wins', () => {
  const base = data({ accounts: [account(1, 'A', 1)] });
  const m = mergeData(base, data({ accounts: [account(1, 'A', 100)] }), data({ accounts: [account(1, 'A', 200)] }));
  assert.equal(m.accounts[0].balance_cents, 100);
});

test('merge: same statement imported on two devices is kept once', () => {
  const ing = parseIng(toTable(readFileSync(new URL('./fixtures/ing-sample.csv', import.meta.url), 'utf8'))).txns;
  const asStored = (importId: number, offset: number) =>
    ing.map((t, i) => ({
      id: offset + i, date: t.date, description: t.description, amount_cents: t.amountCents, currency: 'EUR', category: t.category,
      note: null, excluded: t.excluded ? 1 : 0, source: 'ing', import_id: importId, hash: t.hash,
    }));
  const imp = (id: number) => ({ id, file_name: 'ing.csv', source: 'ing', imported_at: '2026-09-29 09:00:00', row_count: 64 });
  const a = data({ transactions: asStored(1000, 1001), imports: [imp(1000)] });
  const b = data({ transactions: asStored(5000, 5001), imports: [imp(5000)], rules: { 'kpn': 'bills' } });
  const m = mergeData(null, a, b);
  assert.equal(m.transactions.length, 64);
  assert.deepEqual(m.imports.map((i) => i.id), [1000]);
  assert.deepEqual(m.rules, { kpn: 'bills' });
  // Merging again changes nothing
  assert.ok(sameData(mergeData(m, m, m), m));
  assert.ok(sameData(mergeData(null, m, empty()), m));
});

test('merge: new device with nothing takes everything from the server', () => {
  const remote = data({ accounts: [account(1, 'ING current', 9500)], debts: [{ id: 7, person: 'FJ', direction: 'owed_to_me', amount_cents: 7138, note: null, updated_at: '' }] });
  assert.ok(sameData(mergeData(null, empty(), remote), remote));
});

test('merge: old-style ids used for different records on two devices are both kept', () => {
  const a = data({ accounts: [account(1, 'A-bank', 100)] });
  const b = data({ accounts: [account(1, 'B-bank', 200)] });
  const m = mergeData(null, a, b);
  assert.deepEqual(m.accounts.map((x) => x.name).sort(), ['A-bank', 'B-bank']);
  assert.equal(new Set(m.accounts.map((x) => x.id)).size, 2);
  // Transactions follow their import's new id
  const imp = (id: number, file: string) => ({ id, file_name: file, source: 'ing', imported_at: '', row_count: 1 });
  const txn = (id: number, importId: number, hash: string) => ({
    id, date: '2026-09-01 00:00:00', description: hash, amount_cents: -100, currency: 'EUR', category: 'other',
    note: null, excluded: 0, source: 'ing', import_id: importId, hash,
  });
  const m2 = mergeData(null, data({ imports: [imp(1, 'a.csv')], transactions: [txn(1, 1, 'h-a')] }), data({ imports: [imp(1, 'b.csv')], transactions: [txn(1, 1, 'h-b')] }));
  assert.equal(m2.imports.length, 2);
  assert.equal(m2.transactions.length, 2);
  const bImport = m2.imports.find((i) => i.file_name === 'b.csv')!;
  assert.equal(m2.transactions.find((t) => t.hash === 'h-b')!.import_id, bImport.id);
});

test('merge: de-duplicating keeps the synced copy and its edits', () => {
  const t = (id: number, category: string, note: string | null) => ({
    id, date: '2026-09-01 00:00:00', description: 'KPN', amount_cents: -48000, currency: 'EUR', category,
    note, excluded: 0, source: 'ing', import_id: id + 1000, hash: 'same-line',
  });
  const imp = (id: number) => ({ id, file_name: 'ing.csv', source: 'ing', imported_at: '', row_count: 1 });
  const base = data({ transactions: [t(200, 'bills', 'phone')], imports: [imp(1200)] });
  const local = data({ transactions: [t(200, 'bills', 'phone')], imports: [imp(1200)] });
  const remote = data({ transactions: [t(200, 'bills', 'phone'), t(100, 'other', null)], imports: [imp(1200), imp(1100)] });
  const m = mergeData(base, local, remote);
  assert.deepEqual(m.transactions.map((x) => [x.id, x.category, x.note]), [[200, 'bills', 'phone']]);
  assert.deepEqual(m.imports.map((i) => i.id), [1200]);
});
