# Mock data (local demo)

One year (1 Oct 2025 to 28 Sep 2026) of finances for someone renting in Amsterdam
on €85,000 gross a year, including the 8% holiday allowance.

- **Income:** €4,283.12 net salary on the 24th, plus €3,184.50 holiday allowance in May
  and a €412 tax refund. These are estimates using 2026 Dutch tax rates and a ~5% pension premium.
- **Fixed costs:** rent €1,695, health insurance, energy, internet, phone, water,
  municipal taxes, insurance and gym.
- **Day to day:** groceries, eating out, drinks, shopping, Uber/Bolt, a Texel weekend
  and a week in Lisbon. Savings (€400) and investments (€300) go out on payday, plus
  most of the holiday allowance. There's also €50 a month in crypto.
- **In the app:** 5 accounts (€46k in total), 15 plans, 6 budgets and 2 debts.
  Some categories are set up as if the user had taught the app.

## Load it

With `pnpm web` running, open <http://localhost:8081/seed.html>. The page writes
the data into this browser's storage (moved forward so the year ends yesterday)
and opens the app. If data was already there, it's kept under `finance-overview:v1:before-mock`.

You can also go to **Import → Choose file** and pick `public/mock/finance-backup-mock-85k.json`.
To try the CSV import yourself, run the generator (below): it also writes ING and Revolut
statements to `mock-data/statements/` (not in git, like every `.csv` here).

## Regenerate

```bash
node --experimental-strip-types --import ./test/register.mjs mock-data/generate.ts
```

This needs Node 22 or later. The output is always the same: set `MOCK_SEED=<number>` for a different year.

`public/` gets copied into `expo export` builds. The public demo (`pnpm deploy:pages`)
ships them on purpose: its first visit loads this year, moved forward so it always ends
yesterday. For a private deploy of your own data (`pnpm deploy`), delete `public/mock` and
`public/seed.html` first.

All generated bank account numbers start with `NL00`. Those check digits never pass the IBAN
checksum, so none of them can be a real account.
