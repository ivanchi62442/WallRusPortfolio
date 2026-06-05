# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WallRus.Portfolio** is a local-first personal investment portfolio tracker. No build step, no framework, no npm packages. Three static files — open `index.html` in a browser and it works.

## Running the App

```
start index.html
```
Or serve statically:
```
npx serve .
```

## Architecture

### File Structure

- `index.html` — Document skeleton + all HTML markup. Links to `styles.css` and `app.js`.
- `styles.css` — All CSS: design system variables, component styles, responsive rules.
- `app.js` — All application logic (~1540 lines of vanilla JS).
- `worker.js` — Cloudflare Worker: price proxy (current + historical) for Yahoo Finance.

### State Model

A single `state` object holds all runtime state:
```js
state = {
  txns: [],               // immutable event log (persisted)
  settings: {},           // { proxyUrl, base } (persisted)
  prices: {},             // symbol → live price (in-memory)
  manual: {},             // symbol → { price, date }, user-entered fallback (persisted)
  fxCache: {},            // "USD@latest" or "USD@2024-01-02" → rate (in-memory)
  hist: { prices: {}, fx: {} },  // historical series keyed by "SYM@from@to" (persisted)
  view,                   // active tab
  analyticsRange,         // 'mtd'|'1m'|'3m'|'6m'|'ytd'|'1y'|'all'
  txnFilter,              // transaction type chip filter
  txnDateFrom,            // ISO date string or ''
  txnDateTo,              // ISO date string or ''
  txnSymbol,              // symbol substring filter or ''
  portfolioSort,          // { col: 'symbol'|'qty'|'cost'|'value'|'gain', dir: 'asc'|'desc' }
  editingId, lastRefresh, lastError, refreshing
}
```

`localStorage` keys:
- `wallrus.txns.v1` — transaction event log
- `wallrus.settings.v1` — settings
- `wallrus.manual.v1` — manual price overrides
- `wallrus.hist.v1` — historical price + FX series (chart cache)
- `wallrus.theme.v1` — `'light' | 'dark'` theme preference
- `wallrus.view` — last active view (restored on reload)

### Transaction Types (Event-Sourced Ledger)

Transactions are **immutable events** — never mutate; only append or delete. Supported types: `deposit`, `buy`, `sell`, `dividend`, `gift`, `fee`, `fx`.

Each transaction has `{ id, type, date, eurValue, note, ...type-specific fields }`.

Sub-types via extra field:
- `gift` → `giftKind: 'cash' | 'stock'`
- `dividend` → `divKind: 'cash' | 'reinvest'` (reinvest = DRIP)

### Derived Calculations (never stored)

All portfolio math is recomputed on the fly from the event log:
- `buildPortfolio()` — FIFO lot tracking per symbol; returns `{ holdings, investedEUR, realizedEUR }`
- `computeCash()` — per-currency cash balance from all movements
- `computeSummary(deriv)` — dashboard totals (Deposited, Invested, Fees, Realized gains, Dividends, Cash, Total value)

**FIFO rule**: sells consume the oldest buy lots first. Cost basis is tracked per lot. `lotSource(t)` classifies which transaction types create acquisition lots (`buy`, gift-stock, `drip`).

### Routing / Views

No router library. `state.view` controls which `<section>` is visible:
- `setView(v)` — switches to `'dashboard' | 'portfolio' | 'transactions' | 'analytics' | 'settings'`
- Last view is persisted to `wallrus.view` and restored on page load.

### External APIs (both keyless)

- **FX rates**: `api.frankfurter.dev/v1` — ECB reference rates (latest + historical time-series)
- **Stock prices**: Yahoo Finance via a self-hosted Cloudflare Worker proxy (`worker.js`). Supports both current prices (`?symbols=`) and historical OHLC (`?historical=1&from=&to=&symbols=`). The proxy URL is stored in settings.

### Rendering

`renderAll()` is the master update — calls all section renderers. Call it after any state mutation. Call a specific renderer when only one section changes (e.g. `renderTransactions()` for filter changes).

```js
renderAll()
  → buildPortfolio() + computeSummary()
  → renderDashboard()
  → renderPortfolio()   // sortable; calls renderSparkline() per holding
  → renderCash()
  → renderTransactions() // filterable by type, date range, symbol
  → renderSettings()
  → updateSymbolDatalist()
  → renderAnalytics()   // only when view === 'analytics'
```

`renderAnalytics()` is async — fetches historical data then builds three charts:
1. Portfolio value over time (+ deposited baseline overlay + SPY value overlay)
2. Return % vs deposited (+ SPY % overlay + insights panel)
3. Allocation donut chart

### Design System

CSS variables in `:root`:
- Colors: `--paper` (bg), `--panel` (cards), `--ink` (text), `--ink-soft` (muted), `--accent` (#2C5848 green), positive = `#2C6A4A`, negative = `#A8462E`, gold = `#9C7B3A`
- Fonts: `--serif` (Fraunces, headings), `--sans` (Hanken Grotesk, body), `--mono` (Spline Sans Mono, numbers)
- Responsive breakpoint: `720px`
- Dark/light mode via `data-theme` attribute on `<html>`, toggled by theme button in header

### XSS Safety

All user-supplied strings must go through `esc()` before being interpolated into HTML. Never use raw values in template literals that set `innerHTML`.

### Coding Conventions

- SVG icons are `const` string literals at the top of `app.js` (`SVG_EDIT`, `SVG_DELETE`, etc.).
- `num(v)` — safe parseFloat that returns 0 for NaN.
- `fmtMoney(v, ccy)`, `fmtEUR(v)`, `fmtNum(v, d)`, `fmtPct(v)`, `fmtDate(d)` — all formatting helpers are null-safe and return `'—'` for missing data.
- `showToast(msg, type)` — transient feedback (auto-dismisses after 4 s). Type `'error'` for red.
- `showConfirm(msg, label, cb, isDanger)` / `closeConfirm()` — modal confirm overlay for destructive actions.
- `showFormError(msg)` / `clearFormError()` — inline validation in the add/edit modal.
- Date input convention: dd/mm/yyyy text field + hidden `<input type="date">` triggered by a calendar icon button. Use `parseDMY()` to convert to ISO, `fmtDMY()` to display, `autoFmtDate()` as the `oninput` handler.
- Functions that need to be called from inline `onclick` attributes in generated HTML are explicitly assigned to `window` at the bottom of `app.js` (e.g. `window.openModal = openModal`).
- Comments use `/* FEATURE N: ... */` or `/* BUG N FIX: ... */` labels to mark intentional non-obvious decisions inline.

## Product Spec

See [DESIGN.md](DESIGN.md) for the full product specification, accounting rules, data model details, and development roadmap (Phases 1–5).
