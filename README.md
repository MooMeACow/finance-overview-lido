# Finance Overview

A simple, private money tracker that works in your phone's browser (and as an iOS/Android app). Import a bank statement (CSV), see a monthly overview of money in and out, and browse, categorize and add transactions. Everything is stored on your device; nothing is uploaded anywhere.

Built with React Native and Expo (SDK 57).

## Features

**Dashboard**
- **Three key numbers**: total money across your accounts, how much of it is savings, and your expected balance in 6 months. You type in each account's balance (and whether it's an everyday or a savings/investment account) and update it whenever you like.
- **Expected balance for the next 6 months**, based on your accounts, planned income and expenses, and budgets. Tap a month to see how it adds up; you're warned if it's expected to drop below zero.
- **Coming up**: everything planned in the next 30 days.
- **Plans**: recurring (monthly or yearly) and one-off expenses and income, e.g. rent, salary, a trip.
- **Monthly budgets** per category, with progress for the current month.
- **Debts**: money people owe you, or you owe, kept separate from your total and forecast.

**Monthly**
- Net result, money in vs out, a 6-month chart (tap a month to open it), spending by category with budget progress, and your biggest expenses.

**Transactions and import**
- **CSV import**: Revolut and ING statements (English or Dutch export) are recognised automatically. For any other bank you match the columns once (date, description, amount, and optionally an in/out column like ING's "Af Bij"). Dutch and English number and date formats are supported.
- **No duplicates**: importing the same file twice only adds what's new. Two genuinely identical payments in one file are both kept.
- **Categories that learn**: when you change a category, you can apply it to all transactions with the same description, and future imports remember it.
- **Own-account transfers aren't counted**: moving money between your own accounts isn't income or spending, so these are imported but left out of totals automatically: Revolut top-ups, Revolut Digital Assets, ING savings (Oranje Spaarrekening) transfers and round-ups, ING investment-account transfers, and ING top-ups to Revolut. You can switch this per transaction ("Leave out of totals").
- **Imported statements**: a list of every statement you imported (bank, period, number of transactions, counted money in/out). Delete one to remove all its transactions, e.g. to import it again.
- **Manual entries**.
- **Plans file**: a small JSON file with plans, budgets and debts that you can import in one go (used to move over an old spreadsheet). The format is described at the top of `src/lib/setupFile.ts`. Importing the same file twice skips what's already there.
- **Responsive design**: on a computer you get a left sidebar, KPI cards, side-by-side panels, sortable tables, hover tooltips on charts and editing in a side panel; on a phone a compact layout with a bottom tab bar.
- Blue theme with light and dark mode.

### How the forecast works

Expected balance = your accounts' total today + planned income − planned expenses − what's left of your monthly budgets. For the current month only items from today onward count. It only knows what you enter, so it's an estimate. Budgets are meant for day-to-day spending; don't also budget for things you've added as planned expenses (like rent), or they'll be counted twice.

## Run it (web)

The app runs in any browser, including your phone's. On a Mac:

**1. Install the tools (once).** You need [Node.js](https://nodejs.org) (LTS). If the `pnpm` command isn't found, install it globally:

```bash
npm install -g pnpm
pnpm -v            # should print a version number
```

If that gives a permissions error and you use Homebrew, `brew install pnpm` works too. Or skip installing and put `npx` in front of every `pnpm` command below (e.g. `npx pnpm install`).

**2. Install and start** (in the project folder):

```bash
pnpm install
pnpm expo install --fix   # aligns package versions with the Expo SDK
pnpm web
```

The terminal shows a local address (usually `http://localhost:8081`). Open it in your Mac's browser.

**3. Open it on your phone.** With your phone on the same Wi-Fi as your Mac:

- Find your Mac's local IP address: `ipconfig getifaddr en0` (or System Settings → Wi-Fi → Details).
- On your phone, open `http://<that-ip>:8081`, e.g. `http://192.168.1.23:8081`.
- If macOS asks whether to allow incoming connections for Node, allow it.

This works while `pnpm web` is running on your Mac. To use it anywhere without your Mac, the site needs to be hosted online; see "Publishing" below.

### Where your data is stored

- **Web:** in the browser you use (browser storage). Each browser and device has its own separate data, so data you import on your Mac won't appear on your phone. Clearing the browser's website data deletes it.
- **iOS/Android app:** in a SQLite database on the device.

Nothing is uploaded anywhere in either case.

### Publishing (later)

`pnpm build:web` creates a static website in the `dist` folder, which any static host can serve (for example EAS Hosting, Netlify, Vercel or GitHub Pages). Not set up yet.

## Run it (phone app)

Install the **Expo Go** app on your phone, run `pnpm start`, and scan the QR code. Expo Go only supports the latest SDK; if it says the project's SDK is incompatible, run `pnpm expo install expo@latest && pnpm expo install --fix`.

### If pnpm causes build errors

Expo's docs say recent SDKs work with pnpm's default (isolated) install. If you hit module resolution errors anyway, switch pnpm to a hoisted layout by adding this to a `pnpm-workspace.yaml` file in the project root, then reinstall:

```yaml
nodeLinker: hoisted
```

## Tests

The CSV parsing, amount/date handling, Revolut import, forecast and web storage are covered by tests that run with Node's built-in test runner (Node 22+):

```bash
pnpm test
```

`test/fixtures/revolut-sample.csv` is an anonymized sample statement.

## How to export a CSV from ING

In the ING app or on mijn.ing.nl: go to your current account, choose to download/export transactions, pick **CSV** (comma- or semicolon-separated both work) and a period. English and Dutch exports are both supported. (Menu names may differ between versions.)

## How to export a CSV from Revolut

In the Revolut app: open your account → **Statement** → choose **Excel/CSV**, pick a period, and share/save the file. Then in Finance Overview go to **Import → Choose CSV file**. (Menu names in the Revolut app may differ slightly between versions.)

## Project structure

```
App.tsx                      Tab navigation, database provider
src/db/database.ts           Phone storage: SQLite schema and queries
src/db/database.web.ts       Web storage: same functions, using browser storage
src/db/provider(.web).tsx    Picks the right storage per platform
src/lib/csv.ts               CSV parser (no dependencies)
src/lib/money.ts             Amount parsing and formatting (integer cents)
src/lib/dates.ts             Date parsing and month helpers
src/lib/dialogs.ts           Confirm/alert dialogs that also work in the browser
src/lib/categories.ts        Categories and auto-categorization rules
src/lib/importers.ts         Revolut and generic bank CSV import
src/lib/forecast.ts          Plan dates, upcoming items and the balance forecast
src/lib/setupFile.ts         Plans file (plans, budgets, debts) format and import
src/screens/                 Dashboard, Monthly, Transactions, Import
src/components/              UI building blocks, charts, tables, sheets/side panels
src/layout.ts                Breakpoints for the responsive layout
test/                        Tests (import, forecast, web storage)
```

## Notes and limitations

- Totals add up amounts as-is; if you import accounts in different currencies, they are not converted.
- For Revolut, fees are subtracted from the amount, reverted/declined transactions are skipped, and pending ones are skipped until they complete (import again later to add them).
- Bank-specific formats other than Revolut use the column matching step.
