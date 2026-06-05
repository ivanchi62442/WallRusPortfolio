# WallRus. — User Guide

*A local-first personal investment portfolio tracker. No account, no cloud, no nonsense.*

---

## Table of Contents

1. [What is WallRus?](#1-what-is-wallrus)
2. [Opening the App](#2-opening-the-app)
3. [First-Time Setup — Price Proxy](#3-first-time-setup--price-proxy)
4. [Adding Your First Transaction](#4-adding-your-first-transaction)
5. [Transaction Types — Full Reference](#5-transaction-types--full-reference)
6. [Dashboard](#6-dashboard)
7. [Portfolio](#7-portfolio)
8. [Transactions](#8-transactions)
9. [Analytics](#9-analytics)
10. [Settings](#10-settings)
11. [Editing & Deleting Transactions](#11-editing--deleting-transactions)
12. [Backup, Import & Moving Devices](#12-backup-import--moving-devices)
13. [Currencies & FX Rates](#13-currencies--fx-rates)
14. [Tips & Conventions](#14-tips--conventions)
15. [Frequently Asked Questions](#15-frequently-asked-questions)

---

## 1. What is WallRus?

WallRus is a **personal investment portfolio tracker** that runs entirely in your browser. There is no account to create, no data sent to any server, and no subscription. Everything is stored on your device in the browser's local storage.

**What it does:**

- Keeps an immutable log of every investment event — deposits, stock purchases, sales, dividends, fees, and currency conversions.
- Derives your current holdings, cash balances, gains/losses, and totals automatically from those events.
- Fetches live stock prices (via a small personal proxy you set up once) and live FX rates (via the European Central Bank, keyless).
- Rolls everything up into EUR so you always have a single number to compare against what you put in.
- Shows historical charts of your portfolio value, return %, and allocation — with an optional SPY benchmark.

**What it is not:**

- It is not a broker. It does not execute trades.
- It is not a tax tool. Realized-gain figures are informational (FIFO method).
- It does not sync automatically across devices — export/import is the transfer mechanism.

---

## 2. Opening the App

Double-click `index.html` to open it in your default browser — or serve it locally:

```
npx serve .
```

The app works offline after the first load (Google Fonts aside). Your data is stored in `localStorage` for the specific browser and device you used to open the file.

> **Important:** If you clear your browser's site data, history, or use "private/incognito" mode, your stored data will be lost. Export a backup regularly (Settings → Export backup).

### Interface layout

```
┌──────────────────────────────────────────────────────────────┐
│  WallRus. portfolio        [☽] [Add transaction]             │
│  Dashboard  Portfolio  Transactions  Analytics  Settings     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    (Active view content)                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

- **Top bar:** Brand name, navigation tabs, theme toggle (moon/sun), and the global "Add transaction" button.
- **Navigation tabs:** Click any tab to switch views. The last-visited tab is remembered between sessions.
- **Theme toggle:** Switches between light and dark mode. Preference is saved automatically.

---

## 3. First-Time Setup — Price Proxy

WallRus fetches stock prices from Yahoo Finance through a small **Cloudflare Worker** that you deploy once for free (no credit card, ~3 minutes). This proxy is needed for:

- Live prices on the Dashboard and Portfolio tabs.
- 7-day sparklines in the Portfolio table.
- Historical price data for the Analytics charts and the SPY benchmark.

**Skipping the proxy:** You can still use WallRus without it — enter manual prices directly in the Portfolio table for any holding. FX rates (via the ECB) and all accounting still work.

### Link for an already created proxy

`https://meridian-proxy.ivanacurcic.workers.dev`

### Deploying your proxy

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) and create a free account.
2. Navigate to **Workers & Pages → Create → Start with Hello World!**
3. Name your Worker (e.g. `wallrus-proxy`), click **Deploy**.
4. Click **Edit code**, delete the placeholder, and paste the full contents of `worker.js` from this project.
5. Click **Deploy** again.
6. Copy your Worker's URL (looks like `https://wallrus-proxy.your-name.workers.dev`).

### Connecting the proxy to WallRus

1. Open WallRus → go to the **Settings** tab.
2. Paste your Worker URL into the "Live prices" input field. Working proxy `https://meridian-proxy.ivanacurcic.workers.dev`
3. Click **Save**.

The app will immediately fetch current prices for any holdings you have.

> **Test it:** Open `https://your-worker.workers.dev/?symbols=AVUV,VWCE.DE` in a browser tab — you should see a JSON response with prices.

---

## 4. Adding Your First Transaction

Click **Add transaction** (top-right button, always visible). A modal sheet slides up with a **type selector** across the top.

```
┌──────────────────────────────────────────────────────┐
│  Add transaction                                     │
│                                                      │
│  [Deposit] [Buy] [Sell] [Dividend] [Gift] [Fee/Tax] [FX] │
│                                                      │
│  (form fields for selected type)                     │
│                                                      │
│  Note (optional) ________________________________    │
│                                                      │
│              [Cancel]  [Save transaction]            │
└──────────────────────────────────────────────────────┘
```

**Typical starting sequence for a new portfolio:**

1. **Deposit** — log the money you transferred to your broker account.
2. **FX** (if you converted currencies) — log the conversion.
3. **Buy** — log each stock purchase.

Every transaction requires a **Date**. Enter it as `dd/mm/yyyy` in the text field, or click the calendar icon to use a date picker. The field auto-formats as you type digits.

Press **Escape** or click the backdrop to cancel without saving.

---

## 5. Transaction Types — Full Reference

### Deposit

Money you transferred into your investment account from your own funds. Deposits count toward the **Deposited** total, which is your baseline cost against which total return is measured.

| Field | Description |
|-------|-------------|
| Date | When the money landed in your account |
| Currency | EUR, USD, or RSD |
| Amount | The amount in the chosen currency |
| EUR value | Auto-filled from the ECB rate on that date. Override if you know the exact EUR amount (e.g. from your bank statement). |
| Note | Optional free-text memo |

> Fees charged by your bank on the transfer should be logged separately as a **Fee** transaction (category: Bank fee), not deducted from the deposit amount. Both the deposit and the fee count toward Deposited.

---

### Buy

A stock purchase. Creates an acquisition lot at the given price.

| Field | Description |
|-------|-------------|
| Symbol | Yahoo Finance ticker — see [Ticker format](#ticker-format) |
| Quantity | Number of shares purchased |
| Currency | The trading currency (usually USD or EUR) |
| Price / share | Price paid per share (before commission) |
| Commission | Broker commission in the same currency. Included in the cost basis. |
| Total paid in EUR | Optional override. If blank, WallRus uses the ECB rate on that date. Use this if you know the exact EUR deducted from your account. |
| Note | Optional memo |

**FIFO note:** Each Buy creates a dated lot. When you later sell shares of the same symbol, WallRus consumes the oldest lots first (FIFO) to calculate realized gains.

---

### Sell

Closes a position (fully or partially). Consumes lots oldest-first (FIFO) and calculates realized gain.

| Field | Description |
|-------|-------------|
| Symbol | Must exactly match the ticker used on the Buy |
| Quantity | Shares sold — cannot exceed what you hold |
| Currency | Trading currency |
| Price / share | Proceeds per share before commission |
| Commission | Broker commission (subtracted from proceeds) |
| Net proceeds in EUR | Optional override. If blank, the ECB rate is used. Use this for the exact EUR credited to your account. |
| Note | Optional memo |

The realized gain (proceeds EUR − cost of consumed lots EUR, FIFO) is shown on the Dashboard card and in the Analytics insights.

---

### Dividend

Income received from a holding. Two sub-types:

**Paid in cash** — money received in your account.

| Field | Description |
|-------|-------------|
| Symbol (optional) | Which holding paid the dividend |
| Currency | Currency the dividend was paid in |
| Amount | Cash received |
| EUR value | Auto-filled from ECB rate; override if needed |

**Reinvested (DRIP)** — dividend automatically used to buy more shares.

| Field | Description |
|-------|-------------|
| Symbol | The holding that received more shares |
| Quantity | New shares received |
| Currency | Trading currency |
| Price / share | Price at which the shares were acquired |
| EUR value | Optional |

DRIP shares add a new acquisition lot and count as dividend income, but have no net cash effect (the income and the purchase cancel out).

---

### Gift

Received money or shares that are **not** your own deposits — so they do not count toward the Deposited baseline.

**Cash gift:** Like a deposit but excluded from the Deposited figure and total-return denominator.

**Stock gift:** Shares received (e.g. from a transfer-in). Enter the cost basis per share if known; leave blank to treat the entire value as unrealized gain.

---

### Fee / Tax

A standalone cost — broker commissions not attached to a trade, bank fees, custody fees, withholding tax, etc. Fees count toward **Deposited** (they represent money out of your pocket) and are also tracked separately in the **Fees & taxes** dashboard card.

| Field | Description |
|-------|-------------|
| Category | Bank fee / Broker commission / Tax / FX spread / Other |
| Currency | Currency the fee was charged in |
| Amount | Fee amount |
| EUR value | Auto-filled; override for RSD or if you know the exact EUR amount |

> **Buy commissions** are entered as part of the Buy transaction and are included in the cost basis (Invested), not counted in Fees.

---

### FX

A currency conversion in your account (e.g. EUR → USD before buying a US stock).

| Field | Description |
|-------|-------------|
| From currency + amount | The currency and amount you converted from |
| To currency + amount | The currency and amount you received |
| Conversion fees (EUR) | Any spread or fee charged, expressed in EUR. Counts toward Fees & taxes. |

FX moves cash between your per-currency balances. The fee reduces your EUR cash.

---

## 6. Dashboard

The Dashboard is the default landing view. It gives you a one-screen summary of your portfolio.

```
┌──────────────────────────────────────────────────────┐
│                  Current value                       │
│                    €24,310.50                        │
│              +€2,415.00   +11.02%                    │
│            total return vs deposited                 │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Deposited │ │Invested  │ │Fees&taxes│            │
│  │€21,895.50│ │€19,500.00│ │  €95.00  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Uninvested│ │Realized  │ │Dividends │            │
│  │  €810.50 │ │  +€0.00  │ │  €320.00 │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│                                                      │
│  ↻ Refresh prices        Prices updated 14:22       │
└──────────────────────────────────────────────────────┘
```

### Hero number

The large figure at the top is your **Current value in EUR** — the sum of all stock holdings (at live or manual prices, converted to EUR) plus all cash balances (converted to EUR).

Below it: total return (EUR amount and %) relative to everything you deposited (including fees).

- Green = positive return
- Red = negative return

### Stat cards

| Card | What it means |
|------|---------------|
| **Deposited** | Total money you put in (deposits + fees). This is your cost baseline. |
| **Invested in stocks** | Current cost basis of all remaining holdings (FIFO lots from Buy transactions, excluding gift-stock and DRIP lots). |
| **Fees & taxes** | All standalone fees + FX fees + sell commissions. Buy commissions are part of Invested. |
| **Uninvested cash** | All currency balances converted to EUR. A `*` suffix means an FX rate couldn't be loaded for one of your currencies. |
| **Realized gains** | Profit (or loss) booked on sells so far, FIFO method. Informational only. |
| **Dividends** | All cash dividends + DRIP reinvestments received, in EUR. |

> **Total return = Current value − Deposited.** Realized gains, dividends, and DRIP all flow into the value or cash automatically, so the total is always correct without double-counting.

### Refresh prices button

Fetches the latest prices from your proxy and the latest FX rates from the ECB. The timestamp next to the button shows when prices were last loaded.

---

## 7. Portfolio

The Portfolio tab shows your current holdings in detail, plus your cash balances.

### Holdings table

```
 Holding    Qty        Avg cost    Price           Value        Gain/loss     7d
 ──────────────────────────────────────────────────────────────────────────────
 AVUV USD   45.0000    $98.20      $115.40 live   $5,193.00   +$772.70 +17.43%  ▁▂▅▇
 VWCE.DE EUR  10.0000  €87.50      €110.20 live   €1,102.00   +€227.00 +25.94%  ▃▅▆▇
 BRK-B USD   12.5000   $410.00     [set price]    —           —                 —
```

**Columns:**

- **Holding** — ticker symbol, currency tag, and a small position-weight bar (proportional to share of total holdings value).
- **Quantity** — total shares held (4 decimal places for fractional shares).
- **Avg cost** — weighted average cost per share across all lots, in the trading currency.
- **Price** — live price (tagged `live`) or a manual input field if no live price is available.
- **Value** — quantity × current price, in the trading currency.
- **Gain / loss** — unrealized gain/loss in trading currency, plus a % badge (green/red).
- **7d** — a sparkline showing the past 7 days of price movement. Requires the price proxy.

### Sorting

Click any column header to sort by it. Click again to reverse direction. An arrow icon shows the active sort column and direction. The default sort is by Value (largest first).

### Manual prices

If a symbol has no live price (proxy not configured, or the ticker isn't recognized by Yahoo), its Price cell shows an input field. Type a price and press Enter — it is saved immediately and used for all calculations until replaced by a live fetch.

### Cash section

Below the holdings table, each currency balance is shown with an EUR equivalent. Negative balances indicate a missing funding transaction — they are expected if you haven't logged a deposit before a buy.

---

## 8. Transactions

The Transactions tab is a filterable log of every event, sorted newest-first, grouped by date.

```
┌──────────────────────────────────────────────────────┐
│  From [__/__/____] 📅  To [__/__/____] 📅  [Symbol…] [Clear] │
│                                                      │
│  [All] [Deposits] [Buys] [Sells] [Dividends] [Fees & tax] [FX] │
│                                                      │
│  04 Jun 2026                                         │
│  ┌────────────────────────────────────────────────┐  │
│  │ Buy   Buy AVUV · 5.0000 @ $114.80        ✎ ✕  │  │
│  └────────────────────────────────────────────────┘  │
│  02 Jun 2026                                         │
│  ┌────────────────────────────────────────────────┐  │
│  │ Deposit  Deposit · €1,000.00              ✎ ✕  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Filters

All filters work simultaneously and combine with AND logic:

| Filter | How to use |
|--------|------------|
| **Type chips** | Click All / Deposits / Buys / Sells / Dividends / Fees & tax / FX to show only that type. |
| **From date** | Type `dd/mm/yyyy` or click the calendar icon. Shows only transactions on or after this date. |
| **To date** | Same — shows only transactions on or before this date. |
| **Symbol filter** | Type a ticker substring (case-insensitive). A dropdown of known symbols appears. |
| **Clear button** | Resets all filters at once. |

### Reading a transaction row

Each row shows:
- A coloured **type badge** (Deposit, Buy, Sell, etc.)
- A **description line** with the key details (symbol, quantity, price)
- A **note line** (if a note was added)
- The **native amount** in green (+) or red (−)
- **Edit** (pencil) and **Delete** (×) buttons

---

## 9. Analytics

The Analytics tab shows three visual panels. It loads historical data on demand (requires the price proxy for stock history; FX history comes from the ECB and is always available).

### Time-range selector

Chips at the top right of the section header let you choose the period shown in Charts 1 and 2:

| Chip | Period |
|------|--------|
| MTD | Month to date (1st of current month → today) |
| 1M | Last 1 month |
| 3M | Last 3 months |
| 6M | Last 6 months (default) |
| YTD | Year to date (1 Jan → today) |
| 1Y | Last 12 months |
| All | From your first transaction to today |

The allocation chart always shows the current snapshot regardless of the range.

---

### Chart 1 — Portfolio value over time

![alt text](image-1.png)

Three lines are drawn:

| Line | Colour | Meaning |
|------|--------|---------|
| Portfolio value | Solid green | Total EUR value (holdings + cash) each day |
| Deposited | Soft dashed | Cumulative deposits (your cost baseline) |
| SPY benchmark | Blue dashed | What your portfolio would be worth if each deposit had been used to buy SPY shares instead |

**Hover/touch** anywhere on the chart to see a tooltip with: date · your portfolio value · SPY value · deposited total for that day.

---

### Chart 2 — Return % vs deposited

```
+15% ┤                     ╭───────
 +5% ┤       ╭─────────────╯
  0% ┼───────╯  - - - - - - - - -  (zero line)
 -5% ┤
     └────────────────────────────
     Jan 2025   Apr 2025   Jun 2025
```

Shows `(portfolio value − deposited) / deposited × 100` each day, with the same SPY % overlay for direct comparison. A zero line is drawn so it is immediately clear when the portfolio is above or below breakeven.

**Hover/touch** to see: date · your portfolio return % · SPY return %.

#### Insights panel

Below Chart 2, four key stats are shown:

| Insight | Meaning |
|---------|---------|
| Current return | Return % at the end of the selected period |
| Period change | Change in return % from the start to the end of the period (in percentage points) |
| Best day | Largest single-day gain (in pp) within the period |
| Worst day | Largest single-day loss (in pp) within the period |

---

### Allocation donut chart

![alt text](image.png)

Shows each holding as a proportional slice of total stock value. **Hover** over a slice to see a tooltip with symbol, EUR value, and allocation %. The legend on the right also shows each holding's unrealized gain %.

Requires prices to be loaded (live or manual). Shows "Load prices to see allocation" otherwise.

---

## 10. Settings

The Settings tab has three panels.

### Live prices

Paste your Cloudflare Worker URL here and click **Save**. The URL is stored only on this device. After saving, prices are fetched immediately.

See [Section 3](#3-first-time-setup--price-proxy) for the full setup instructions.

**Ticker format reminder:** Use Yahoo Finance symbols — `AVUV` (US-listed), `VWCE.DE` (Deutsche Börse/Xetra), `VUAA.MI` (Borsa Italiana/Milan), `BRK-B` (hyphenated tickers).

### Base currency

All totals are rolled up into **EUR**. Foreign values are converted using ECB reference rates. Currencies not in the ECB's basket (like RSD) must have their EUR value entered manually at the time of each transaction.

### Your data

Shows how many transactions are stored. Three actions:

| Button | What it does |
|--------|-------------|
| **Export backup** | Downloads a `wallrus-backup-YYYY-MM-DD.json` file with all your transactions and settings |
| **Import backup** | Opens a file picker; replaces current data with the imported file (confirmation required) |
| **Erase all data** | Permanently deletes all transactions from this device (confirmation required, cannot be undone) |

> **Export regularly.** Clearing your browser's site data, switching browsers, or using a new device will lose your data if you have no backup.

---

## 11. Editing & Deleting Transactions

### Editing

Click the **pencil icon** on any transaction row in the Transactions tab. The Add/Edit modal opens pre-filled with the existing values. Change what you need and click **Save transaction**.

When you save an edit, all derived values (holdings, cash, gains, charts) are instantly recomputed.

### Deleting

Click the **× icon** on any transaction row. A confirmation dialog appears — click **Delete** to confirm. Deletion is permanent and cannot be undone.

> **FIFO integrity:** If you delete a Buy transaction that has already had shares sold against it, the FIFO engine will silently clamp the quantities — the sell lots simply have nothing left to consume. Re-enter any missing transactions to fix the history.

---

## 12. Backup, Import & Moving Devices

### Exporting

Settings → **Export backup** → a JSON file named `wallrus-backup-YYYY-MM-DD.json` is downloaded. Keep this file somewhere safe (e.g. a cloud drive folder outside the app).

### Importing

Settings → **Import backup** → select your JSON file. You will be asked to confirm, as importing replaces your current data.

### Moving to a new device or browser

1. Export a backup on the old device.
2. Open `index.html` on the new device (or navigate to the hosted URL).
3. Settings → Import backup → select the file.
4. Re-enter your price proxy URL in Settings (URLs are not exported for privacy).

### What is and is not exported

| Exported | Not exported |
|----------|-------------|
| All transactions | Price proxy URL |
| Base currency setting | Live prices (in-memory) |
| Manual price overrides | FX cache |
| | Historical chart cache |

---

## 13. Currencies & FX Rates

WallRus supports **EUR, USD, and RSD** as transaction currencies.

FX rates come from the **European Central Bank** via [api.frankfurter.dev](https://api.frankfurter.dev) — keyless, no account needed. Rates are fetched for the transaction date when you save, and for "today" when you refresh prices.

### RSD

RSD is not in the ECB's reference basket. For any transaction in RSD, the EUR value field will not auto-fill — you must enter it manually. Look up the rate in your bank statement or a reliable source.

### Rate caching

FX rates are cached in memory during the session and also for historical periods used in charts. If you see a `*` next to the Uninvested cash figure, it means one of your non-EUR currency balances couldn't be converted (the rate wasn't loaded). Click **Refresh prices** to retry.

### Currency balances

The Portfolio tab shows a **Cash** section with one row per currency. Each row shows the balance in the native currency, and (for non-EUR) the approximate EUR equivalent at the current rate.

A negative cash balance just means you have not yet logged the deposit or FX that funded a purchase. It is not an error.

---

## 14. Tips & Conventions

### Ticker format

Always use Yahoo Finance symbols exactly as Yahoo recognizes them:

| Exchange | Example tickers |
|----------|-----------------|
| US (NYSE/Nasdaq) | `AVUV`, `SPY`, `VTI`, `BRK-B` |
| Deutsche Börse (Xetra) | `VWCE.DE`, `EXS1.DE` |
| Borsa Italiana (Milan) | `VUAA.MI`, `VWCE.MI` |
| London Stock Exchange | `VWRL.L`, `CSP1.L` |

If you bought the same ETF on two exchanges (e.g. `VWCE.DE` and `VWCE.MI`), they are tracked as separate holdings. This is correct — the cost basis and price are in different currencies.

### Date entry

Enter dates as `dd/mm/yyyy`. As you type digits, slashes are inserted automatically. Alternatively, click the calendar icon to pick from a calendar widget.

### The EUR value field (optional override)

Most transaction forms have a **EUR value** field marked "auto". WallRus looks up the ECB rate on the transaction date and fills it in automatically when you save. You only need to override it if:

- Your broker charged a different FX rate than the ECB reference.
- You are entering an RSD transaction (ECB has no RSD rate).
- You want the historical books to reflect the exact EUR amount from your bank statement.

### Commission on buys vs. sells

- **Buy commissions** are added to the cost basis. They are part of "Invested" and factor into your unrealized gain calculation.
- **Sell commissions** are subtracted from proceeds. They reduce your realized gain.
- Standalone broker fees (account fees, custody fees) should be logged as **Fee → Broker commission**.

### FIFO cost basis

WallRus uses FIFO (First In, First Out) to match sell transactions against acquisition lots. When you sell 10 shares, the oldest 10 shares you bought are consumed first. This affects:

- **Avg cost** shown in the Portfolio table (reflects remaining lots only).
- **Realized gains** on the Dashboard.

You cannot change the cost-basis method — FIFO is fixed.

### Gift stock and DRIP

- **Gift stock** lots are tracked in the holdings and contribute to your current value, but their cost is **not** included in the "Invested in stocks" dashboard figure (only Buy lots are). This means your "Invested" and your actual cost basis may differ if you hold gifted shares.
- **DRIP (dividend reinvest)** shares add a lot at the reinvest price and count as dividend income. They have zero net cash effect (the dividend credit and the share purchase cancel out). DRIP lots are included in "Invested" as well as in "Dividends received."

---

## 15. Frequently Asked Questions

**Q: Why does my total value not match what I see in my broker app?**

A: Several reasons are common:
- Live prices are not loaded yet — click **Refresh prices**.
- Your proxy URL is missing or incorrect — check Settings.
- You have holdings with no live price and no manual price set.
- The live price shown is the last closing price from Yahoo, which may differ from the real-time bid/ask.

---

**Q: I refreshed prices but some holdings still show `—` for value.**

A: The ticker symbol is either not recognized by Yahoo Finance, or the currency shown in the holdings table doesn't match what Yahoo returns. Double-check the ticker against Yahoo's search. You can set a manual price as a workaround.

---

**Q: The chart shows "Add transactions to see this chart" even though I have transactions.**

A: The Analytics charts need historical price data from your proxy. Make sure:
1. Your proxy URL is saved in Settings.
2. You are connected to the internet.
3. The selected time range starts after your first transaction.

---

**Q: My cash balance is negative. Is something wrong?**

A: No. A negative cash balance simply means a transaction consumed more cash than was logged as coming in. The most common cause is a Buy logged before the corresponding Deposit. Add the missing deposit and the balance will normalize.

---

**Q: What happens if I delete a transaction by mistake?**

A: Deletes are permanent. If you have an exported backup, you can import it to restore everything (but you will lose any transactions added since the backup). Going forward, export regularly so your backup is always recent.

---

**Q: Can I use WallRus on my phone?**

A: Yes — the app is responsive and works on mobile browsers. Open `index.html` from your phone's browser, or navigate to the hosted URL. Data is stored on that device; use Export/Import to keep your phone and desktop in sync.

---

**Q: Does WallRus support currencies other than EUR, USD, and RSD?**

A: Those are the only currencies in the transaction forms. For holdings traded in other currencies (e.g. GBP, CHF), enter the EUR value manually on each transaction. FX support for additional currencies may be added in a future version.

---

**Q: My sparklines are not showing.**

A: Sparklines require the price proxy to be configured and connected. They show the past 7 days of closing prices. If the proxy is set up but sparklines are still missing, click Refresh prices — this also fetches the sparkline data.

---

**Q: What does "same cash flows" mean in the SPY benchmark?**

A: Rather than comparing your portfolio against a single SPY investment made at the beginning, WallRus simulates buying SPY shares with each of your actual deposits on the exact dates those deposits were made. This gives a fair apples-to-apples comparison: you are asking "if I had put exactly this money into SPY at exactly these times, what would I have now?"

---

*WallRus stores your data only on this device. No personal or financial data is ever sent to any server. The only outbound calls are: stock prices to your personal proxy (which only receives ticker symbols, never your portfolio), and FX rates to the ECB's public API.*
