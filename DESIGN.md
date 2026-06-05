# WallRus.Portfolio — Design Document

A local-first personal investment tracker. Logs what you spend (deposits, fees, FX, purchases,
sells, dividends), derives your holdings and cash, pulls live prices, and rolls everything up
into EUR so you can see what you put in versus what it's worth.

**Status:** Phases 1–4 shipped and working. Phase 5 mostly done (PWA pending).
**Deliverables:** `index.html` · `styles.css` · `app.js` · `worker.js` (price proxy) · this document.

---

## 1. Principles

1. **Local-first.** All personal data lives in the browser on the user's device. No account, no server holding portfolio data.
2. **No build step.** Three static files (`index.html`, `styles.css`, `app.js`). Open from disk or host as a static file. Sharing the link gives each person their own separate copy automatically.
3. **Keyless where possible.** Prices via a free personal proxy; FX from a keyless ECB service. No API keys.
4. **Event-sourced.** Every action is an immutable transaction. Holdings, cash, lots and value are *derived* by replaying transactions — never stored directly. New features (sells, dividends) are additive, not rewrites.
5. **Honest numbers.** Costs use the rate actually paid where known; current value uses live data; anything uncomputable says *why* rather than showing a wrong number.

---

## 2. Technical decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Platform | Single-page web app, vanilla HTML/CSS/JS, three static files | No framework/build; hostable anywhere; trivial to share |
| Persistence | `localStorage` (JSON) | Simple, synchronous, ample for thousands of transactions |
| Hosting | Static host (Cloudflare Pages / Netlify / GitHub Pages) or local `file://` | Free; each browser keeps its own data |
| Base currency | EUR | User's reporting currency |
| Currency storage | Native amount **and** EUR value on the transaction date | Past history doesn't shift when today's FX moves |
| Stock prices | Yahoo Finance via a **Cloudflare Worker proxy** | Free, keyless, US + European listings; proxy adds CORS |
| Price adapter | Isolated `fetchPrices()` | Swapping providers touches one place |
| Price fallback | Per-holding **manual price** | Guarantees a value for anything the proxy can't resolve |
| FX rates | ECB via **Frankfurter** (`api.frankfurter.dev/v1`), keyless | Authoritative for EUR base; latest + historical. RSD → manual |
| **Charting** | **Hand-rolled inline SVG** (no library) | Keeps the single-file/offline/bespoke-look identity; our charts are simple line/area series; libraries add weight or a CDN dependency. Revisit (uPlot) only if heavy interactivity is needed |
| Cost-basis method | **FIFO** lots for realized gains | Chosen method; oldest lots consumed first on a sell |
| Benchmark | **SPY** (USD ETF) with same-cash-flows | Real tradeable instrument; each deposit is invested in SPY at the time it was made, giving a fair MWR-style comparison |
| Backup / multi-device | JSON **export/import** (manual) | Sync deferred until manual transfer feels tedious |
| Data privacy | Only public prices leave the device (via proxy); proxy never sees the portfolio | Keeps the local-first promise |
| Theme | Light/dark toggle, persisted to `localStorage` | System preference detected on first visit |

---

## 3. Data model

### Transaction event log
One array in `localStorage`. Every record shares: `id`, `type`, `date` (YYYY-MM-DD), `note`.
Type-specific fields:

- **deposit** — `currency`, `amount`, `eurValue`
- **gift** (cash) — `giftKind:'cash'`, `currency`, `amount`, `eurValue`
- **gift** (stock) — `giftKind:'stock'`, `symbol`, `currency`, `quantity`, `pricePerShare` (basis, may be 0), `eurValue`
- **buy** — `symbol`, `currency`, `quantity`, `pricePerShare`, `commission`, `eurValue` (all-in cost in EUR)
- **sell** — `symbol`, `currency`, `quantity`, `pricePerShare`, `commission`, `eurValue` (net proceeds in EUR); *realized gain derived via FIFO*
- **dividend** — `divKind:'cash'`, `symbol` (source, optional), `currency`, `amount`, `eurValue`
- **dividend** (DRIP) — `divKind:'reinvest'`, `symbol`, `currency`, `quantity`, `pricePerShare`, `eurValue`
- **fee** — `feeCategory` (bank / broker / tax / fx_spread / other), `currency`, `amount`, `eurValue`
- **fx** — `fromCurrency`, `fromAmount`, `toCurrency`, `toAmount`, `feesEUR` (fee always in EUR)

### Derived (never stored)
- **Lots** — per symbol, an ordered list of acquisition lots from `buy` + gift-stock + DRIP, each `{ source, qty, costNative, costEUR }`. Sells consume oldest-first (FIFO).
- **Holdings** — remaining (unconsumed) lots → `qty`, `costNative`, `costEUR`, `avgCostNative`, live/manual `price`, `value`, `gain`, `gainPct`.
- **Cash ledger** — per-currency balance from all cash movements.
- **Realized gains / dividends** — running totals (informational).
- **Summary** — dashboard roll-up.

### Storage keys
- `wallrus.txns.v1` — transaction event log (persisted)
- `wallrus.settings.v1` — `{ proxyUrl, base }` (persisted)
- `wallrus.manual.v1` — `symbol → { price, date }` manual price overrides (persisted)
- `wallrus.hist.v1` — historical price series and FX series, keyed by `SYM@from@to` (persisted, session cache)
- `wallrus.theme.v1` — `'light' | 'dark'` theme preference (persisted)
- `wallrus.view` — last active view (persisted, restored on reload)

### Session-only (in-memory)
- `state.prices` — `symbol → live price` from most recent proxy fetch
- `state.fxCache` — `"USD@latest"` or `"USD@2024-01-02"` → rate (number | null)

---

## 4. Accounting rules (source of truth)

- **Deposited** = sum of deposits (EUR) + standalone fees (EUR). Gifts, dividends and DRIP are **excluded**.
- **Invested in stocks** = sum of *remaining* buy-lot cost basis (after FIFO sells). Gift-stock and DRIP lots are excluded from Invested but still reduce what's left in cash. Buy basis = `quantity × price + commission`. Commission is part of the asset cost.
- **Fees & taxes** = standalone fees + FX fees + sell commissions (EUR). Buy commissions are in Invested, not here.
- **Realized gains** *(informational)* = Σ over sells of `proceeds (EUR) − cost of consumed lots (EUR)`, FIFO.
- **Dividends received** *(informational)* = Σ cash dividends + Σ DRIP eurValues (EUR).
- **Cash (per currency)** — derived ledger:
  - deposit / gift-cash / dividend → `+amount`
  - sell → `+(quantity × price − commission)`
  - fee → `−amount`
  - buy → `−(quantity × price + commission)`
  - fx → `−fromAmount` (from), `+toAmount` (to), `−feesEUR` (EUR)
  - gift-stock → none; drip → net zero (dividend in, immediately spent on shares)
  - *Negative balance = a missing funding transaction, not a bug.*
- **Current value (hero)** = holdings value (EUR) + cash (EUR).
- **Total return** = current value − Deposited. Dividends, realized gains and DRIP flow into value/cash automatically, so the total stays correct; the realized-gains and dividends figures are breakdowns, not separate additions.
- **Display currency:** Portfolio & Transactions show **native**; Dashboard rolls up to **EUR**.

---

## 5. Screens

1. **Dashboard** — hero current value (EUR) + total return; cards: Deposited, Invested, Fees & taxes, Uninvested cash, Realized gains, Dividends; refresh prices button.
2. **Portfolio** — holdings table (sortable by Symbol / Qty / Avg cost / Value / Gain%) in native currency; 7-day sparkline per holding; manual price input where live is unavailable. Cash section per currency below.
3. **Transactions** — filterable event log: type chips (All/Deposits/Buys/Sells/Dividends/Fees/FX) + date-range pickers (dd/mm/yyyy text + calendar button) + symbol text filter. Add / edit / delete.
4. **Analytics** — date-range chips (MTD / 1M / 3M / 6M / YTD / 1Y / All); Chart 1: Portfolio value over time with deposited baseline and SPY same-cash-flows overlay; Chart 2: Return % vs deposited with SPY % overlay + insights panel (current return, period change, best/worst day); Allocation donut chart.
5. **Settings** — price proxy URL, base-currency note, export / import / erase.
6. **Add/Edit modal** — type selector (Deposit / Buy / Sell / Dividend / Gift / Fee-tax / FX); date input as dd/mm/yyyy text field with calendar picker fallback.

---

## 6. Phases & checklists

### ✅ Phase 1 — Usable core (DONE)
- [x] Event-log data model + localStorage
- [x] Add/edit/delete: deposit, buy, gift (cash & stock), fee/tax, FX
- [x] Derived holdings + per-currency cash ledger
- [x] Live prices via Yahoo proxy; manual price fallback
- [x] FX via Frankfurter (latest + historical); RSD manual
- [x] Dashboard EUR roll-up; Portfolio & Transactions in native currency
- [x] Settings: proxy URL, JSON export/import, erase
- [x] Quiet-wealth visual design
- [x] Cloudflare Worker price proxy (`worker.js`)

### ✅ Phase 2 — Sells, dividends & reinvestment (DONE)
*Goal: complete the transaction vocabulary with FIFO realized gains and income.*
- [x] Derive FIFO **lots** per symbol from buys + gift-stock + DRIP (date-ordered) — `buildPortfolio()` with `lotSource()`
- [x] **Sell** transaction: consume lots oldest-first; compute realized gain (native + EUR)
- [x] Reduce holding qty & cost basis to remaining lots
- [x] **Dividend** transaction: cash in; add to Dividends received
- [x] **DRIP** transaction: adds a lot at the reinvest price; net-zero cash; counts as income — `divKind='reinvest'`
- [x] Add **Realized gains** and **Dividends received** dashboard cards
- [x] Add Sell / Dividend / DRIP to the Add/Edit modal + transaction list rendering
- [x] Totals reconcile — total return = holdingsValue + cashEUR − deposited

### ✅ Phase 3 — Charts (inline SVG) (DONE)
*Goal: see growth over time and costs vs. value.*
- [x] Extend `worker.js` to serve a **historical range** — `?historical=1&from=&to=&symbols=` — implemented in `historyFor()`
- [x] Fetch & cache **historical FX** (Frankfurter time-series) — `fetchFxSeries()`
- [x] Replay transactions date-by-date to reconstruct daily value (holdings + cash) in EUR — `replaySummaryUntil()`
- [x] SVG line/area chart with hover + touch tooltip, crosshair, axis ticks, responsive resize — `renderChart()`
- [x] Chart 1: **Portfolio value over time** (with deposited baseline overlay)
- [x] Chart 2: **Return % vs deposited**
- [x] Cache historical series in localStorage — `STORE_HIST = 'wallrus.hist.v1'`
- [x] Analytics tab + date-range chips: MTD / 1M / 3M / 6M / YTD / 1Y / All

### ✅ Phase 4 — Benchmark vs. SPY (DONE)
- [x] Pull historical **SPY** prices via the proxy (from first deposit date to today, cached)
- [x] **Same-cash-flows benchmark:** each deposit is simulated as buying SPY shares at the time; compare running SPY portfolio value vs. actual portfolio value (both chart 1 overlay and chart 2 % overlay)
- [x] Dashed gold overlay line; legend rows; tooltip shows Portfolio value/% + SPY value/% on hover

### ✅ Phase 5 — Polish (mostly done)
- [ ] Installable on phone (PWA: manifest + service worker)
- [x] Sortable holdings table — all columns (Symbol / Qty / Avg cost / Value / Gain%); toggle asc/desc, sort icons
- [x] Filterable transactions by date range (dd/mm/yyyy + calendar picker) and by symbol text input
- [x] Dark / light theme toggle — persists to localStorage; respects system preference on first visit
- [x] 7-day sparklines in portfolio table (fetched via proxy historical endpoint, forward-filled)
- [x] Allocation donut chart (Analytics) — interactive SVG with hover tooltip and legend
- [x] Chart insights panel — current return, period change, best day, worst day
- [x] Refined empty states with custom walrus SVG mark

### ⬜ Later
- [ ] Installable PWA (manifest + service worker)
- [ ] Automatic sync (own Google Drive file or a small backend) — only if manual export becomes tedious
- [ ] Tax-lot reporting / export

---

## 7. Run, deploy & back up

**Run the app**
1. Open `index.html` (double-click) or serve: `npx serve .`
2. Settings → paste your price proxy URL → Save.

**Deploy the proxy (once)**
1. Free account at dash.cloudflare.com → Workers & Pages → Create → **Start with Hello World!**
2. Name it, Deploy, then **Edit code**, paste `worker.js`, Deploy.
3. Copy the `*.workers.dev` URL into Settings.
4. Test: open `https://<worker>.workers.dev/?symbols=AVUV,VWCE.DE` → expect JSON with prices.
5. Historical test: `https://<worker>.workers.dev/?historical=1&from=2024-01-01&to=2024-03-01&symbols=SPY`

**Tickers:** Yahoo symbols on Buy/Sell/Gift-stock — `AVUV` (US), `VWCE.DE` (Xetra), `VUAA.MI` (Milan), `BRK-B`.

**Backup:** Export regularly. Clearing browser data erases the app's data, so keep an exported copy. Import to restore or move devices.

---

## 8. Constraints & notes

- localStorage is per-browser/per-origin — no automatic cross-device sync (use export/import).
- RSD isn't in ECB reference rates → enter EUR values manually for RSD amounts.
- The proxy holds no personal data, so one proxy URL can be shared between users.
- Editing a transaction re-runs the accounting; deletes are immediate and permanent.
- FIFO is the realized-gain method; overselling (selling more than held) is silently clamped — remaining lots just go to zero.
- Historical data is cached per `SYM@from@to` range key; clearing localStorage clears chart history.

---

## 9. Decisions log (resolved)

- **Charting:** hand-rolled inline SVG (preserve single-file/offline/bespoke look). Revisit uPlot only for heavy interactivity.
- **Benchmark:** SPY with same-cash-flows (simulated deposit-by-deposit buy-in), not a fixed start-of-period comparison.
- **Realized gains:** FIFO.
- **Multi-device:** manual export/import for now; sync deferred.
- **Priority:** sells + dividends + DRIP before charts.
- **File split:** moved from single `index.html` to three files (`index.html` + `styles.css` + `app.js`) to make editing tractable while keeping no build step.
- **Date input UX:** dd/mm/yyyy text field (auto-formatted) + hidden `<input type="date">` triggered by calendar icon — avoids browser-native date picker inconsistencies while keeping keyboard-first entry fast.
