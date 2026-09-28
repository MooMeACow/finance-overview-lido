# Finance Overview

A simple, private money tracker for your phone. Import a bank statement (CSV), see a monthly overview of money in and out, and browse, categorize and add transactions. Everything is stored on your device in a local SQLite database; nothing is uploaded anywhere.

Built with React Native and Expo (SDK 57).

## Features

- **Monthly overview**: net result, money in vs out, a 6-month chart (tap a month to open it), spending by category, and your biggest expenses.
- **CSV import**: Revolut statements are recognised automatically. For any other bank you match the columns once (date, description, amount, and optionally an in/out column like ING's "Af Bij"). Dutch and English number and date formats are supported.
- **No duplicates**: importing the same file twice only adds what's new. Two genuinely identical payments in one file are both kept.
- **Categories that learn**: transactions are auto-categorized by simple keyword rules. When you change a category, you can apply it to all transactions with the same description, and future imports remember it.
- **Leave out of totals**: mark transfers between your own accounts so they aren't counted as income or spending.
- **Manual entries**: add cash payments or anything else by hand.
- **Undo an import**: remove everything a specific import added.
- Light and dark mode.

## Run it

You need [Node.js](https://nodejs.org) (LTS), [pnpm](https://pnpm.io), and the **Expo Go** app on your phone (App Store / Google Play).

```bash
pnpm install
pnpm expo install --fix   # aligns package versions with the Expo SDK
pnpm start
```

Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android). Your phone and computer need to be on the same Wi-Fi network.

Expo Go only supports the latest SDK. If Expo Go says the project's SDK is incompatible, run `pnpm expo install expo@latest && pnpm expo install --fix` to upgrade.

### If pnpm causes build errors

Expo's docs say recent SDKs work with pnpm's default (isolated) install. If you hit module resolution errors anyway, switch pnpm to a hoisted layout by adding this to a `pnpm-workspace.yaml` file in the project root, then reinstall:

```yaml
nodeLinker: hoisted
```

## Tests

The CSV parsing, amount/date handling and Revolut import are covered by tests that run with Node's built-in test runner (Node 22+):

```bash
pnpm test
```

`test/fixtures/revolut-sample.csv` is an anonymized sample statement.

## How to export a CSV from Revolut

In the Revolut app: open your account → **Statement** → choose **Excel/CSV**, pick a period, and share/save the file. Then in Finance Overview go to **Import → Choose CSV file**. (Menu names in the Revolut app may differ slightly between versions.)

## Project structure

```
App.tsx                      Tab navigation, database provider
src/db/database.ts           SQLite schema and all queries
src/lib/csv.ts               CSV parser (no dependencies)
src/lib/money.ts             Amount parsing and formatting (integer cents)
src/lib/dates.ts             Date parsing and month helpers
src/lib/categories.ts        Categories and auto-categorization rules
src/lib/importers.ts         Revolut and generic bank CSV import
src/screens/                 Overview, Transactions, Import
src/components/              UI building blocks, chart, sheets
test/                        Parser tests
```

## Notes and limitations

- Totals add up amounts as-is; if you import accounts in different currencies, they are not converted.
- For Revolut, fees are subtracted from the amount, reverted/declined transactions are skipped, and pending ones are skipped until they complete (import again later to add them).
- Revolut top-ups count as money in. If they're transfers from your own bank account that you also import, mark one side as "Leave out of totals".
- Bank-specific formats other than Revolut use the column matching step.
