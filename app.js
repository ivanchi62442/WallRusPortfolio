/* ============================================================
   WallRus.Portfolio — local-first investment tracker
   Data lives in localStorage. No backend. Base currency: EUR.
   Transactions are an immutable-style event log; holdings, cash
   and value are DERIVED from them.

   Money model:
     deposit  -> money in (counts toward "Deposited")
     gift     -> money/stock in that does NOT count toward "Deposited"
     buy      -> stock principal (Invested) + commission (Fees);
                 cash debited by principal + commission
     fee      -> a cost (Fees); cash debited
     fx       -> moves cash between currencies; fee counts toward Fees
   Portfolio & Transactions tabs display NATIVE currency.
   Dashboard rolls everything up into EUR.
   ============================================================ */

const STORE_TXNS = 'wallrus.txns.v1';
const STORE_SETTINGS = 'wallrus.settings.v1';
const STORE_MANUAL = 'wallrus.manual.v1';
const STORE_HIST = 'wallrus.hist.v1';

/* ---------- SVG icon constants ---------- */
const SVG_EDIT = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 2.5l2 2-6.5 6.5H3V9.5l6.5-6.5z"/><path d="M8.5 3.5l2 2"/></svg>`;
const SVG_DELETE = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>`;
const SVG_SORT_NONE = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3.5l3-2.5 3 2.5"/><path d="M2 6.5l3 2.5 3-2.5"/></svg>`;
const SVG_SORT_ASC  = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 7l3-4 3 4"/></svg>`;
const SVG_SORT_DESC = `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3l3 4 3-4"/></svg>`;
const SVG_EMPTY_MARK = `<svg width="54" height="54" viewBox="0 0 54 54" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="27" cy="24" rx="15" ry="13"/><circle cx="21" cy="20" r="1.8" fill="currentColor" stroke="none"/><circle cx="33" cy="20" r="1.8" fill="currentColor" stroke="none"/><ellipse cx="27" cy="27" rx="5" ry="3.5"/><line x1="7" y1="26" x2="22" y2="27"/><line x1="7" y1="30" x2="22" y2="28.5"/><line x1="32" y1="27" x2="47" y2="26"/><line x1="32" y1="28.5" x2="47" y2="30"/><path d="M21.5 35 Q20 42 19.5 47"/><path d="M32.5 35 Q34 42 34.5 47"/></svg>`;
const SVG_MOON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M14 8.53A6 6 0 1 1 7.47 2 4.67 4.67 0 0 0 14 8.53z"/></svg>`;
const SVG_SUN = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/><line x1="3.1" y1="3.1" x2="4.5" y2="4.5"/><line x1="11.5" y1="11.5" x2="12.9" y2="12.9"/><line x1="12.9" y1="3.1" x2="11.5" y2="4.5"/><line x1="4.5" y1="11.5" x2="3.1" y2="12.9"/></svg>`;
const STORE_THEME = 'wallrus.theme.v1';
const CURRENCIES = ['EUR', 'USD', 'RSD'];
const BASE_CASH_CCYS = ['EUR', 'USD'];   // always shown in the Cash section
const FEE_CATEGORIES = [
  ['bank', 'Bank fee'],
  ['broker', 'Broker commission'],
  ['tax', 'Tax'],
  ['fx_spread', 'FX spread'],
  ['other', 'Other'],
];

let giftKind = 'cash'; // 'cash' | 'stock' — current gift sub-type in the form
let divKind = 'cash';  // 'cash' | 'reinvest' — current dividend sub-type in the form
const state = {
  txns: [],
  settings: { proxyUrl: '', base: 'EUR' },
  prices: {},     // symbol -> number (native ccy), from live proxy
  manual: {},     // symbol -> { price, date }, user-entered fallback
  fxCache: {},    // "USD@latest" or "USD@2024-01-02" -> number (1 unit -> EUR) or null
  hist: { prices: {}, fx: {} },
  view: 'dashboard',
  analyticsRange: '6m',
  txnFilter: 'all',
  txnDateFrom: '',
  txnDateTo: '',
  txnSymbol: '',
  portfolioSort: { col: 'value', dir: 'desc' },
  editingId: null,
  lastRefresh: null,
  lastError: null,
  refreshing: false,
};

/* ---------- persistence ---------- */
function loadData() {
  try { state.txns = JSON.parse(localStorage.getItem(STORE_TXNS)) || []; }
  catch (e) { state.txns = []; }
  try {
    const s = JSON.parse(localStorage.getItem(STORE_SETTINGS));
    if (s) state.settings = Object.assign(state.settings, s);
  } catch (e) {}
  try { state.manual = JSON.parse(localStorage.getItem(STORE_MANUAL)) || {}; }
  catch (e) { state.manual = {}; }
  try {
    const h = JSON.parse(localStorage.getItem(STORE_HIST));
    if (h && typeof h === 'object') state.hist = Object.assign(state.hist, h);
    if (!state.hist.prices) state.hist.prices = {};
    if (!state.hist.fx) state.hist.fx = {};
  } catch (e) {}
}
function saveTxns() {
  try { localStorage.setItem(STORE_TXNS, JSON.stringify(state.txns)); }
  catch (e) { showToast('Could not save — storage may be full or blocked.', 'error'); }
}
function saveSettings() {
  try { localStorage.setItem(STORE_SETTINGS, JSON.stringify(state.settings)); } catch (e) {}
}
function saveManual() {
  try { localStorage.setItem(STORE_MANUAL, JSON.stringify(state.manual)); } catch (e) {}
}
function saveHist() {
  try { localStorage.setItem(STORE_HIST, JSON.stringify(state.hist)); } catch (e) {}
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'dark' ? '#18160F' : '#2C5848';
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  btn.innerHTML = t === 'dark' ? SVG_SUN : SVG_MOON;
  btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}
function initTheme() {
  const stored = localStorage.getItem(STORE_THEME);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(stored || (prefersDark ? 'dark' : 'light'));
}
function setManualPrice(sym, val) {
  const n = parseFloat(val);
  if (isNaN(n) || n <= 0) delete state.manual[sym];
  else state.manual[sym] = { price: n, date: today() };
  saveManual();
  renderAll();
}

/* ---------- helpers ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

/* BUG 4 FIX: en-GB renders USD as "US$" — replace with plain "$" */
function fmtMoney(v, ccy) {
  if (v == null || isNaN(v)) return '—';
  try {
    const formatted = new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: ccy, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(v);
    return formatted.replace('US$', '$');
  } catch (e) {
    return v.toFixed(2) + ' ' + ccy;
  }
}
const fmtEUR = (v) => fmtMoney(v, 'EUR');
function fmtNum(v, d = 2) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
}
function fmtPct(v) {
  if (v == null || isNaN(v) || !isFinite(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
}
function fmtDate(d) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch (e) { return d; }
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rateOf = (ccy) => (ccy === 'EUR' ? 1 : (state.fxCache[ccy + '@latest'] != null ? state.fxCache[ccy + '@latest'] : null));

/* ---------- toast ---------- */
function showToast(msg, type = '') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 4000);
}

/* ---------- confirm overlay ---------- */
let _confirmCb = null;
function showConfirm(msg, label, cb, isDanger = false) {
  _confirmCb = cb;
  document.getElementById('confirm-msg').textContent = msg;
  const ok = document.getElementById('confirm-ok');
  ok.textContent = label;
  ok.className = 'btn-line' + (isDanger ? ' danger' : '');
  document.getElementById('confirm-overlay').classList.add('open');
  setTimeout(() => document.getElementById('confirm-cancel').focus(), 50);
}
function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('open');
  _confirmCb = null;
}

/* ---------- form error ---------- */
function showFormError(msg) {
  const el = document.getElementById('form-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearFormError() {
  const el = document.getElementById('form-error');
  if (el) { el.textContent = ''; el.classList.remove('visible'); }
}

function parseDMY(str) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((str || '').trim());
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function fmtDMY(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, mo, d] = iso.split('-');
  return `${d}/${mo}/${y}`;
}
function autoFmtDate(e) {
  const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
  let v = digits;
  if (digits.length > 4) v = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
  else if (digits.length > 2) v = digits.slice(0, 2) + '/' + digits.slice(2);
  e.target.value = v;
}

/* ---------- FX (ECB rates via Frankfurter, keyless) ---------- */
async function fxToEUR(currency, date) {
  if (!currency || currency === 'EUR') return 1;
  const key = currency + '@' + (date || 'latest');
  if (state.fxCache[key] != null) return state.fxCache[key];
  const path = date ? date : 'latest';
  const url = `https://api.frankfurter.dev/v1/${path}?base=${encodeURIComponent(currency)}&symbols=EUR`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fx http ' + res.status);
    const data = await res.json();
    const rate = data && data.rates && data.rates.EUR;
    if (typeof rate === 'number') { state.fxCache[key] = rate; return rate; }
    throw new Error('no rate');
  } catch (e) {
    state.fxCache[key] = null;
    return null;
  }
}

/* ---------- prices (Yahoo via your proxy) ---------- */
async function fetchPrices(symbols) {
  const list = Array.from(new Set(symbols.filter(Boolean)));
  if (!list.length) return;
  const proxy = state.settings.proxyUrl;
  if (!proxy) throw new Error('NO_PROXY');
  const url = proxy + (proxy.includes('?') ? '&' : '?') + 'symbols=' + encodeURIComponent(list.join(','));
  const res = await fetch(url);
  if (!res.ok) throw new Error('proxy returned ' + res.status);
  const data = await res.json();
  if (data && data.error && !list.some((s) => data[s])) throw new Error(data.error);
  list.forEach((sym) => {
    const row = data[sym];
    if (row && row.price != null) state.prices[sym] = num(row.price);
  });
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function startForRange(end, range) {
  const d = new Date(end + 'T00:00:00Z');
  if (range === 'mtd') { d.setUTCDate(1); }
  else if (range === '1m') d.setUTCMonth(d.getUTCMonth() - 1);
  else if (range === '3m') d.setUTCMonth(d.getUTCMonth() - 3);
  else if (range === '6m') d.setUTCMonth(d.getUTCMonth() - 6);
  else if (range === 'ytd') { d.setUTCMonth(0); d.setUTCDate(1); }
  else if (range === '1y') d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}
function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
function upper(s) { return (s || '').trim().toUpperCase(); }

async function fetchHistory(symbols, from, to) {
  const list = Array.from(new Set(symbols.map(upper).filter(Boolean)));
  if (!list.length || !state.settings.proxyUrl) return;
  const missing = list.filter((sym) => !state.hist.prices[`${sym}@${from}@${to}`]);
  if (!missing.length) return;
  const proxy = state.settings.proxyUrl;
  const url = proxy + (proxy.includes('?') ? '&' : '?')
    + 'historical=1'
    + '&from=' + encodeURIComponent(from)
    + '&to=' + encodeURIComponent(to)
    + '&symbols=' + encodeURIComponent(missing.join(','));
  const res = await fetch(url);
  if (!res.ok) throw new Error('history proxy returned ' + res.status);
  const data = await res.json();
  missing.forEach((sym) => {
    const row = data[sym];
    if (row && Array.isArray(row.series)) state.hist.prices[`${sym}@${from}@${to}`] = row;
  });
  saveHist();
}

async function fetchFxSeries(currency, from, to) {
  if (!currency || currency === 'EUR') return;
  const key = `${currency}@${from}@${to}`;
  if (state.hist.fx[key]) return;
  const url = `https://api.frankfurter.dev/v1/${from}..${to}?base=${encodeURIComponent(currency)}&symbols=EUR`;
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  const rates = (data && data.rates) || {};
  const out = {};
  Object.keys(rates).forEach((d) => {
    const r = rates[d] && rates[d].EUR;
    if (typeof r === 'number') out[d] = r;
  });
  state.hist.fx[key] = out;
  saveHist();
}

function forwardFill(days, map, fallback) {
  const out = {};
  let last = fallback != null ? fallback : null;
  days.forEach((d) => {
    if (map[d] != null) last = map[d];
    if (last != null) out[d] = last;
  });
  return out;
}

function replaySummaryUntil(date, priceByDate, fxByDate) {
  const txns = state.txns
    .filter((t) => t.date <= date)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const lots = {};
  const cash = {};
  let deposited = 0;
  const addCash = (c, v) => { if (!c) return; cash[c] = (cash[c] || 0) + v; };
  txns.forEach((t) => {
    if (t.type === 'deposit') { deposited += num(t.eurValue); addCash(t.currency, num(t.amount)); return; }
    if (t.type === 'fee') { deposited += num(t.eurValue); addCash(t.currency, -num(t.amount)); return; }
    if (t.type === 'fx') { addCash(t.fromCurrency, -num(t.fromAmount)); addCash(t.toCurrency, num(t.toAmount)); addCash('EUR', -num(t.feesEUR)); return; }
    if (t.type === 'gift' && t.giftKind === 'cash') { addCash(t.currency, num(t.amount)); return; }
    if (t.type === 'dividend' && t.divKind !== 'reinvest') { addCash(t.currency, num(t.amount)); return; }
    if (t.type === 'buy') addCash(t.currency, -(num(t.quantity) * num(t.pricePerShare) + num(t.commission)));
    if (t.type === 'sell') addCash(t.currency, num(t.quantity) * num(t.pricePerShare) - num(t.commission));

    const src = lotSource(t);
    if (src) {
      const sym = upper(t.symbol);
      if (!sym) return;
      if (!lots[sym]) lots[sym] = [];
      const q = num(t.quantity);
      const comm = t.type === 'buy' ? num(t.commission) : 0;
      lots[sym].push({
        qty: q,
        currency: t.currency || 'USD',
        costEUR: num(t.eurValue),
        costNative: q * num(t.pricePerShare) + comm,
      });
      return;
    }
    if (t.type === 'sell') {
      const sym = upper(t.symbol);
      let remain = num(t.quantity);
      const qlots = lots[sym] || [];
      while (remain > 1e-9 && qlots.length) {
        const lot = qlots[0];
        const take = Math.min(remain, lot.qty);
        const frac = lot.qty ? take / lot.qty : 0;
        lot.qty -= take;
        lot.costEUR -= lot.costEUR * frac;
        lot.costNative -= lot.costNative * frac;
        remain -= take;
        if (lot.qty <= 1e-9) qlots.shift();
      }
    }
  });
  let holdingsEUR = 0;
  Object.keys(lots).forEach((sym) => {
    (lots[sym] || []).forEach((lot) => {
      if (lot.qty <= 1e-9) return;
      const pMap = priceByDate[sym] || {};
      const fxMap = fxByDate[lot.currency] || {};
      const p = pMap[date];
      const r = lot.currency === 'EUR' ? 1 : fxMap[date];
      if (p != null && r != null) holdingsEUR += lot.qty * p * r;
    });
  });
  let cashEUR = 0;
  Object.keys(cash).forEach((c) => {
    const r = c === 'EUR' ? 1 : ((fxByDate[c] || {})[date]);
    if (r != null) cashEUR += cash[c] * r;
  });
  return { deposited, invested: holdingsEUR, total: holdingsEUR + cashEUR };
}

/* ---------- derive holdings, cash & summary ---------- */
// Which transactions create an acquisition lot, and of what kind:
function lotSource(t) {
  if (t.type === 'buy') return 'buy';
  if (t.type === 'gift' && t.giftKind === 'stock') return 'gift';
  if (t.type === 'dividend' && t.divKind === 'reinvest') return 'drip';
  return null;
}
function isStockTxn(t) { return lotSource(t) != null || t.type === 'sell'; }

// FIFO engine: replay acquisitions & sells in date order.
// Returns current holdings, remaining invested (buy lots only), and realized gains (EUR).
function buildPortfolio() {
  const lots = {};   // symbol -> [ { source, qty, costNative, costEUR } ]
  const ccyOf = {};  // symbol -> currency
  let realizedEUR = 0;
  const ordered = state.txns
    .map((t, i) => ({ t, i }))
    .filter((x) => isStockTxn(x.t) && (x.t.symbol || '').trim())
    .sort((a, b) => (a.t.date < b.t.date ? -1 : a.t.date > b.t.date ? 1 : a.i - b.i));

  ordered.forEach(({ t }) => {
    const sym = t.symbol.toUpperCase();
    if (!lots[sym]) lots[sym] = [];
    if (t.currency) ccyOf[sym] = t.currency;
    const src = lotSource(t);
    if (src) {
      const qty = num(t.quantity);
      if (qty <= 0) return;
      const commission = t.type === 'buy' ? num(t.commission) : 0;
      const costNative = qty * num(t.pricePerShare) + commission;        // commission is part of basis
      const costEUR = num(t.eurValue) + (t.type === 'buy' ? num(t.commissionEUR) : 0); // back-compat
      lots[sym].push({ source: src, qty, costNative, costEUR });
    } else { // sell — consume oldest lots first (FIFO)
      let remain = num(t.quantity);
      let consumedEUR = 0;
      while (remain > 1e-9 && lots[sym] && lots[sym].length) {
        const lot = lots[sym][0];
        const take = Math.min(remain, lot.qty);
        const frac = lot.qty ? take / lot.qty : 0;
        consumedEUR += lot.costEUR * frac;
        lot.costNative -= lot.costNative * frac;
        lot.costEUR -= lot.costEUR * frac;
        lot.qty -= take;
        remain -= take;
        if (lot.qty <= 1e-9) lots[sym].shift();
      }
      realizedEUR += num(t.eurValue) - consumedEUR; // eurValue = net proceeds in EUR
    }
  });

  let investedEUR = 0;
  const holdings = Object.keys(lots).map((sym) => {
    const ls = lots[sym];
    const qty = ls.reduce((s, l) => s + l.qty, 0);
    const costNative = ls.reduce((s, l) => s + l.costNative, 0);
    const costEUR = ls.reduce((s, l) => s + l.costEUR, 0);
    investedEUR += ls.reduce((s, l) => s + (l.source === 'buy' ? l.costEUR : 0), 0);
    return { symbol: sym, qty, costNative, costEUR, currency: ccyOf[sym] || 'USD' };
  }).filter((h) => h.qty > 1e-9);

  holdings.forEach((h) => {
    h.avgCostNative = h.costNative / h.qty;
    const priceLive = state.prices[h.symbol];
    const priceManual = state.manual[h.symbol] && state.manual[h.symbol].price;
    const price = priceLive != null ? priceLive : (priceManual != null ? priceManual : null);
    h.priceSource = priceLive != null ? 'live' : (priceManual != null ? 'manual' : null);
    h.price = price != null ? price : null;
    if (price != null) {
      h.valueNative = price * h.qty;
      h.gainNative = h.valueNative - h.costNative;
      h.gainPct = h.costNative ? (h.gainNative / h.costNative) * 100 : null;
    } else { h.valueNative = null; h.gainNative = null; h.gainPct = null; }
    const rate = rateOf(h.currency);
    h.valueEUR = (price != null && rate != null) ? price * h.qty * rate : null;
  });
  holdings.sort((a, b) => (b.valueEUR || 0) - (a.valueEUR || 0));
  return { holdings, investedEUR, realizedEUR };
}
function deriveHoldings() { return buildPortfolio().holdings; }

function computeCash() {
  const cash = {};
  const add = (c, v) => { if (!c) return; cash[c] = (cash[c] || 0) + v; };
  state.txns.forEach((t) => {
    if (t.type === 'deposit') add(t.currency, num(t.amount));
    else if (t.type === 'gift' && t.giftKind === 'cash') add(t.currency, num(t.amount));
    else if (t.type === 'fx') { add(t.fromCurrency, -num(t.fromAmount)); add(t.toCurrency, num(t.toAmount)); add('EUR', -num(t.feesEUR)); }
    else if (t.type === 'buy') add(t.currency, -(num(t.quantity) * num(t.pricePerShare) + num(t.commission)));
    else if (t.type === 'sell') add(t.currency, num(t.quantity) * num(t.pricePerShare) - num(t.commission));
    else if (t.type === 'dividend' && t.divKind !== 'reinvest') add(t.currency, num(t.amount));
    // gift stock: no cash movement. dividend reinvest: net-zero (income immediately buys shares).
  });
  return cash;
}

function computeSummary(deriv) {
  const holdings = deriv.holdings;
  let deposited = 0, fees = 0, dividendsEUR = 0;
  state.txns.forEach((t) => {
    if (t.type === 'deposit') deposited += num(t.eurValue);
    else if (t.type === 'fee') { fees += num(t.eurValue); deposited += num(t.eurValue); }
    else if (t.type === 'fx') fees += num(t.feesEUR);
    else if (t.type === 'dividend') dividendsEUR += num(t.eurValue);
  });
  const invested = deriv.investedEUR;
  const realizedEUR = deriv.realizedEUR;
  const cash = computeCash();
  let cashEUR = 0, cashMissingFx = false;
  Object.keys(cash).forEach((c) => {
    const r = rateOf(c);
    if (r != null) cashEUR += cash[c] * r;
    else if (Math.abs(cash[c]) > 1e-9) cashMissingFx = true;
  });
  let holdingsValue = 0;
  holdings.forEach((h) => { if (h.valueEUR != null) holdingsValue += h.valueEUR; });
  const totalValue = holdingsValue + cashEUR;
  const returnEUR = totalValue - deposited;
  const returnPct = deposited ? (returnEUR / deposited) * 100 : null;
  return { deposited, invested, fees, dividendsEUR, realizedEUR, cash, cashEUR, cashMissingFx, holdingsValue, totalValue, returnEUR, returnPct };
}

/* ---------- rendering ---------- */
function setView(v) {
  state.view = v;
  try { localStorage.setItem('wallrus.view', v); } catch (e) {}
  document.querySelectorAll('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('show', s.id === 'view-' + v));
  renderAll();
}

function updateSymbolDatalist() {
  const dl = document.getElementById('symbol-datalist');
  if (!dl) return;
  const syms = Array.from(new Set(
    state.txns.map((t) => (t.symbol || '').trim().toUpperCase()).filter(Boolean)
  )).sort();
  dl.innerHTML = syms.map((s) => `<option value="${esc(s)}">`).join('');
}

function renderAll() {
  const deriv = buildPortfolio();
  const sum = computeSummary(deriv);
  renderDashboard(sum, deriv.holdings);
  renderPortfolio(deriv.holdings);
  renderCash(sum.cash);
  renderTransactions();
  renderSettings();
  updateSymbolDatalist();
  if (state.view === 'analytics') renderAnalytics();
}

function renderDashboard(sum, holdings) {
  const hero = document.getElementById('hero-value');
  const ret = document.getElementById('hero-return');
  const hasData = state.txns.length > 0;
  hero.textContent = hasData ? fmtEUR(sum.totalValue) : '€0.00';
  const cls = sum.returnEUR > 0 ? 'pos' : sum.returnEUR < 0 ? 'neg' : 'flat';
  ret.className = 'hero-return ' + cls;
  ret.innerHTML = hasData
    ? `<span class="ret-amt">${sum.returnEUR >= 0 ? '+' : ''}${fmtEUR(sum.returnEUR)}</span>` +
      `<span class="ret-pct">${fmtPct(sum.returnPct)}</span>` +
      `<span class="ret-label">total return vs deposited</span>`
    : '<span class="ret-label">Add your first transaction to begin.</span>';

  const cards = [
    ['Deposited', fmtEUR(sum.deposited), 'Money in, incl. fees & taxes', ''],
    ['Invested in stocks', fmtEUR(sum.invested), 'Cost basis of holdings', ''],
    ['Fees & taxes', fmtEUR(sum.fees), 'Bank fees, taxes & FX fees', ''],
    ['Uninvested cash', fmtEUR(sum.cashEUR) + (sum.cashMissingFx ? ' *' : ''), 'All currencies, in EUR', ''],
    ['Realized gains', (sum.realizedEUR >= 0 ? '+' : '') + fmtEUR(sum.realizedEUR), 'Booked on sales (FIFO)', sum.realizedEUR > 1e-9 ? 'pos' : sum.realizedEUR < -1e-9 ? 'neg' : ''],
    ['Dividends', fmtEUR(sum.dividendsEUR), 'Received, incl. reinvested', ''],
  ];
  document.getElementById('stat-cards').innerHTML = cards.map((c, i) => `
    <div class="stat${c[3] ? ' stat-' + c[3] : ''}" style="animation-delay:${0.05 * i}s">
      <div class="stat-label">${c[0]}</div>
      <div class="stat-value mono ${c[3] || ''}">${c[1]}</div>
      <div class="stat-hint">${c[2]}</div>
    </div>`).join('');

  const meta = document.getElementById('refresh-meta');
  if (state.refreshing) meta.textContent = 'Refreshing prices…';
  else if (state.lastError) meta.textContent = 'Could not refresh: ' + state.lastError;
  else if (!holdings.length) meta.textContent = '';
  else if (state.lastRefresh) meta.textContent = 'Prices updated ' + state.lastRefresh.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  else meta.textContent = 'Prices not loaded yet';
}

/* FEATURE 1: sort icon helper for portfolio table headers */
function sortIcon(col) {
  const { col: sc, dir } = state.portfolioSort;
  if (sc !== col) return ` <span class="sort-ic muted">${SVG_SORT_NONE}</span>`;
  return ` <span class="sort-ic">${dir === 'asc' ? SVG_SORT_ASC : SVG_SORT_DESC}</span>`;
}

function renderSparkline(sym) {
  const end = today();
  const from = addDays(end, -9);
  const row = state.hist.prices[`${sym}@${from}@${end}`];
  if (!row || !Array.isArray(row.series) || row.series.length < 2) return '<span class="muted" style="font-size:11px">—</span>';
  const prices = row.series.map((p) => num(p.close));
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP || minP * 0.001 || 1;
  const W = 64, H = 22, sp = 2;
  const pts = prices.map((p, i) => {
    const x = sp + (i / (prices.length - 1)) * (W - sp * 2);
    const y = sp + ((maxP - p) / range) * (H - sp * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#2C6A4A' : '#A8462E';
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;margin:0 auto"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"></polyline></svg>`;
}

function renderPortfolio(holdings) {
  const wrap = document.getElementById('portfolio-body');
  if (!holdings.length) {
    wrap.innerHTML = `<div class="empty"><div class="empty-mark">${SVG_EMPTY_MARK}</div><p>No holdings yet. Add a <strong>Buy</strong> transaction and your positions will appear here.</p></div>`;
    return;
  }

  /* FEATURE 1: sort by portfolioSort state */
  const sorted = [...holdings];
  const { col, dir } = state.portfolioSort;
  sorted.sort((a, b) => {
    if (col === 'symbol') {
      return dir === 'asc' ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
    }
    const keyMap = { qty: 'qty', cost: 'avgCostNative', value: 'valueEUR', gain: 'gainPct' };
    const key = keyMap[col] || 'valueEUR';
    const sentinel = dir === 'asc' ? Infinity : -Infinity;
    const va = a[key] != null ? a[key] : sentinel;
    const vb = b[key] != null ? b[key] : sentinel;
    return dir === 'asc' ? va - vb : vb - va;
  });

  const totalEUR = holdings.reduce((s, h) => s + (h.valueEUR || 0), 0);
  const rows = sorted.map((h) => {
    const gCls = h.gainNative == null ? 'flat' : h.gainNative >= 0 ? 'pos' : 'neg';
    const posWeight = totalEUR ? ((h.valueEUR || 0) / totalEUR * 100) : 0;
    const posBarHTML = h.valueEUR != null
      ? `<div class="pos-bar"><div class="pos-bar-fill" style="width:${posWeight.toFixed(1)}%"></div></div>` : '';
    let priceTxt;
    if (h.priceSource === 'live') {
      priceTxt = `${fmtMoney(h.price, h.currency)}<span class="src live">live</span>`;
    } else {
      const mv = h.priceSource === 'manual' ? h.price : '';
      const tag = h.priceSource === 'manual' ? '<span class="src">manual</span>' : '';
      priceTxt = `<input class="price-in" type="text" inputmode="decimal" value="${mv}" placeholder="set price" aria-label="Manual price for ${esc(h.symbol)}" onchange="setManualPrice('${esc(h.symbol)}', this.value)">${tag}`;
    }
    const valTxt = h.valueNative != null ? fmtMoney(h.valueNative, h.currency) : '<span class="muted">—</span>';
    let gainCell;
    if (h.gainNative == null) {
      gainCell = '<span class="muted">—</span>';
    } else {
      const arrow = h.gainNative > 1e-9 ? '▲' : h.gainNative < -1e-9 ? '▼' : '';
      const sign = h.gainNative >= 0 ? '+' : '−';
      const pctTxt = h.gainPct == null ? '—' : Math.abs(h.gainPct).toFixed(2) + '%';
      gainCell = `<div class="gain-amt mono ${gCls}">${sign}${fmtMoney(Math.abs(h.gainNative), h.currency)}</div>`
        + `<div class="gain-pct ${gCls}">${arrow ? `<span class="gain-arrow">${arrow}</span>` : ''}${pctTxt}</div>`;
    }
    return `<tr>
      <td><span class="sym">${esc(h.symbol)}</span><span class="ccy-tag">${esc(h.currency)}</span>${posBarHTML}</td>
      <td class="mono r soft">${fmtNum(h.qty, 4)}</td>
      <td class="mono r soft">${fmtMoney(h.avgCostNative, h.currency)}</td>
      <td class="mono r">${priceTxt}</td>
      <td class="mono r val-cell">${valTxt}</td>
      <td class="gain-cell r">${gainCell}</td>
      <td class="r">${renderSparkline(h.symbol)}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<table class="grid"><thead><tr>
      <th class="sortable" onclick="sortPortfolio('symbol')">Holding${sortIcon('symbol')}</th>
      <th class="sortable r" onclick="sortPortfolio('qty')">Quantity${sortIcon('qty')}</th>
      <th class="sortable r" onclick="sortPortfolio('cost')">Avg cost${sortIcon('cost')}</th>
      <th class="r">Price</th>
      <th class="sortable r" onclick="sortPortfolio('value')">Value${sortIcon('value')}</th>
      <th class="sortable r gain-th" onclick="sortPortfolio('gain')">Gain / loss${sortIcon('gain')}</th>
      <th class="r" style="width:72px">7d</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

/* FEATURE 1: toggle sort column/direction, re-render */
function sortPortfolio(col) {
  if (state.portfolioSort.col === col) {
    state.portfolioSort.dir = state.portfolioSort.dir === 'desc' ? 'asc' : 'desc';
  } else {
    state.portfolioSort = { col, dir: 'desc' };
  }
  renderPortfolio(deriveHoldings());
}

function renderCash(cash) {
  const wrap = document.getElementById('cash-body');
  const ccys = Array.from(new Set([...BASE_CASH_CCYS, ...Object.keys(cash)]))
    .filter((c) => BASE_CASH_CCYS.includes(c) || Math.abs(cash[c] || 0) > 1e-9);
  if (!ccys.length) { wrap.innerHTML = `<div class="empty"><p>No cash activity yet.</p></div>`; return; }
  wrap.innerHTML = ccys.map((c) => {
    const bal = cash[c] || 0;
    const r = rateOf(c);
    const eurTxt = c === 'EUR' ? '' : (r != null ? `<span class="cash-eur">≈ ${fmtEUR(bal * r)}</span>` : '<span class="cash-eur">≈ — (rate not loaded)</span>');
    const cls = bal < -1e-9 ? 'neg' : '';
    return `<div class="cash-row">
      <div class="cash-ccy">${c}</div>
      <div><span class="cash-amt ${cls}">${fmtMoney(bal, c)}</span>${eurTxt}</div>
    </div>`;
  }).join('');
}

function txnSummaryLine(t) {
  if (t.type === 'deposit') return `Deposit · ${fmtMoney(num(t.amount), t.currency)}`;
  if (t.type === 'gift') return t.giftKind === 'stock'
    ? `Gift ${esc(t.symbol)} · ${fmtNum(num(t.quantity), 4)} shares`
    : `Gift · ${fmtMoney(num(t.amount), t.currency)}`;
  if (t.type === 'fee') { const cat = (FEE_CATEGORIES.find((c) => c[0] === t.feeCategory) || ['', 'Fee'])[1]; return `${cat} · ${fmtMoney(num(t.amount), t.currency)}`; }
  if (t.type === 'fx') return `FX · ${fmtMoney(num(t.fromAmount), t.fromCurrency)} → ${fmtMoney(num(t.toAmount), t.toCurrency)}`;
  if (t.type === 'buy') return `Buy ${esc(t.symbol)} · ${fmtNum(num(t.quantity), 4)} @ ${fmtMoney(num(t.pricePerShare), t.currency)}`;
  if (t.type === 'sell') return `Sell ${esc(t.symbol)} · ${fmtNum(num(t.quantity), 4)} @ ${fmtMoney(num(t.pricePerShare), t.currency)}`;
  if (t.type === 'dividend') return t.divKind === 'reinvest'
    ? `Dividend reinvested · ${esc(t.symbol)} ${fmtNum(num(t.quantity), 4)} sh`
    : `Dividend${t.symbol ? ' ' + esc(t.symbol) : ''} · ${fmtMoney(num(t.amount), t.currency)}`;
  return t.type;
}
function txnNativeAmount(t) {
  if (t.type === 'deposit' || (t.type === 'gift' && t.giftKind === 'cash')) return { v: num(t.amount), c: t.currency, sign: 1 };
  if (t.type === 'fee') return { v: num(t.amount), c: t.currency, sign: -1 };
  if (t.type === 'buy') return { v: num(t.quantity) * num(t.pricePerShare) + num(t.commission), c: t.currency, sign: -1 };
  if (t.type === 'sell') return { v: num(t.quantity) * num(t.pricePerShare) - num(t.commission), c: t.currency, sign: 1 };
  if (t.type === 'dividend') {
    if (t.divKind === 'reinvest') { const v = num(t.quantity) * num(t.pricePerShare); return v ? { v, c: t.currency, sign: 1 } : null; }
    return { v: num(t.amount), c: t.currency, sign: 1 };
  }
  if (t.type === 'gift' && t.giftKind === 'stock') { const v = num(t.quantity) * num(t.pricePerShare); return v ? { v, c: t.currency, sign: 1 } : null; }
  return null; // fx shown in the description
}
const TYPE_LABEL = { deposit: 'Deposit', gift: 'Gift', fee: 'Fee / tax', fx: 'FX', buy: 'Buy', sell: 'Sell', dividend: 'Dividend' };

function renderTransactions() {
  const wrap = document.getElementById('txn-list');
  let list = state.txns.slice().sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

  /* apply filters */
  if (state.txnFilter !== 'all') list = list.filter((t) => t.type === state.txnFilter);
  if (state.txnDateFrom) list = list.filter((t) => t.date >= state.txnDateFrom);
  if (state.txnDateTo) list = list.filter((t) => t.date <= state.txnDateTo);
  if (state.txnSymbol) {
    const sym = state.txnSymbol.toUpperCase();
    list = list.filter((t) => (t.symbol || '').toUpperCase().includes(sym));
  }

  document.querySelectorAll('#view-transactions .chip').forEach((c) => c.classList.toggle('active', c.dataset.filter === state.txnFilter));
  if (!list.length) {
    const hasFilters = state.txnFilter !== 'all' || state.txnDateFrom || state.txnDateTo || state.txnSymbol;
    wrap.innerHTML = `<div class="empty"><div class="empty-mark">${SVG_EMPTY_MARK}</div><p>${hasFilters
      ? 'No transactions match the current filters.'
      : 'No transactions yet. Use <strong>Add transaction</strong> to log one.'}</p></div>`;
    return;
  }
  const groups = [];
  let curDate = null;
  for (const t of list) {
    if (t.date !== curDate) { curDate = t.date; groups.push({ date: t.date, txns: [] }); }
    groups[groups.length - 1].txns.push(t);
  }
  wrap.innerHTML = groups.map(({ date, txns }) => {
    const rows = txns.map((t) => {
      const amt = txnNativeAmount(t);
      const amtTxt = amt ? `<span class="${amt.sign < 0 ? 'neg' : 'pos'}">${amt.sign < 0 ? '−' : '+'}${fmtMoney(amt.v, amt.c)}</span>` : '';
      const subLine = t.note ? `<div class="txn-sub">${esc(t.note)}</div>` : '';
      return `<div class="txn txn-${t.type}">
        <div class="txn-type t-${t.type}">${TYPE_LABEL[t.type] || t.type}</div>
        <div class="txn-main">
          <div class="txn-desc">${txnSummaryLine(t)}</div>
          ${subLine}
        </div>
        <div class="txn-eur mono">${amtTxt}</div>
        <div class="txn-actions">
          <button class="icon-btn" aria-label="Edit transaction" onclick="openModal('${t.id}')">${SVG_EDIT}</button>
          <button class="icon-btn danger" aria-label="Delete transaction" onclick="deleteTxn('${t.id}')">${SVG_DELETE}</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="txn-group"><div class="txn-date-header">${fmtDate(date)}</div>${rows}</div>`;
  }).join('');
}

function renderSettings() {
  document.getElementById('proxy-url-input').value = state.settings.proxyUrl || '';
  document.getElementById('txn-count').textContent = state.txns.length;
}

function buildPath(points, w, h, minY, maxY, pad) {
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const x = (i) => pad.l + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const y = (v) => pad.t + (maxY === minY ? innerH / 2 : ((maxY - v) / (maxY - minY)) * innerH);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(2)},${(h - pad.b).toFixed(2)} L${x(0).toFixed(2)},${(h - pad.b).toFixed(2)} Z`;
  return { line, area, x, y };
}

/* Shared chart tooltip.
   It lives on <body> — NOT inside .chart-wrap — so it can never inherit a
   transformed containing block from an ancestor (e.g. .view's entrance-animation
   transform), which previously made the position:fixed coords resolve against the
   wrong origin and threw the tooltip ~180px away from the cursor.
   It tracks the pointer directly so it always sits right next to the mouse. */
let _chartTip = null;
function chartTipEl() {
  if (!_chartTip || !document.body.contains(_chartTip)) {
    _chartTip = document.createElement('div');
    _chartTip.className = 'chart-tooltip';
    _chartTip.style.display = 'none';
    document.body.appendChild(_chartTip);
  }
  return _chartTip;
}
function showChartTip(text, clientX, clientY) {
  const tip = chartTipEl();
  tip.textContent = text;
  tip.style.display = 'block';
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  // Prefer up-and-to-the-right of the cursor; flip near the viewport edges.
  let left = clientX + gap;
  if (left + tw + 6 > window.innerWidth) left = clientX - tw - gap;
  left = Math.max(6, Math.min(window.innerWidth - tw - 6, left));
  let top = clientY - th - gap;
  if (top < 6) top = clientY + gap + 6;
  tip.style.left = Math.round(left) + 'px';
  tip.style.top = Math.round(top) + 'px';
}
function hideChartTip() { if (_chartTip) _chartTip.style.display = 'none'; }

/* BUG 1 FIX: pad.l increased to 84 so y-axis labels don't clip at SVG left edge */
function renderChart(containerId, metaId, series, extra, opts = {}) {
  const { formatY = fmtEUR, formatTooltip = null, showZero = false, overlay = null } = opts;
  const wrap = document.getElementById(containerId);
  const meta = document.getElementById(metaId);
  if (!series.length) {
    wrap.innerHTML = '<div class="chart-empty">Add transactions to see this chart.</div>';
    meta.textContent = '';
    return;
  }
  if (series.length === 1) {
    wrap.innerHTML = `<div class="chart-empty">${esc(fmtDate(series[0].d))} · ${esc(formatY(series[0].v))} — select a wider range to see a chart.</div>`;
    meta.textContent = fmtDate(series[0].d);
    return;
  }
  const w = wrap.clientWidth || 900, h = wrap.clientHeight || 290;
  const pad = { l: 84, r: 14, t: 14, b: 30 };
  const { overlay2 = null, overlay2Color = 'var(--gold)' } = opts;
  const vals = series.map((x) => x.v).filter((v) => v != null);
  const allVals = [...vals];
  if (overlay) overlay.forEach((op) => { if (op.v != null) allVals.push(op.v); });
  if (overlay2) overlay2.forEach((op) => { if (op.v != null) allVals.push(op.v); });
  const minY = Math.min(...allVals), maxY = Math.max(...allVals);
  const p = buildPath(series, w, h, minY, maxY, pad);
  const yTicks = 4;
  let grid = '';
  for (let i = 0; i <= yTicks; i++) {
    const v = minY + ((maxY - minY) * i) / yTicks;
    const yy = p.y(v);
    grid += `<line class="chart-grid" x1="${pad.l}" y1="${yy}" x2="${w - pad.r}" y2="${yy}" />`;
    grid += `<text class="chart-label" x="${pad.l - 8}" y="${yy + 4}" text-anchor="end" font-size="10.5">${esc(formatY(v))}</text>`;
  }
  let zeroLine = '';
  if (showZero && minY < 0 && maxY > 0) {
    const zy = p.y(0).toFixed(2);
    zeroLine = `<line class="chart-zero" x1="${pad.l}" y1="${zy}" x2="${w - pad.r}" y2="${zy}" />`;
  }
  const idxA = 0, idxB = Math.max(0, Math.floor((series.length - 1) / 2)), idxC = series.length - 1;
  const xTicks = [idxA, idxB, idxC];
  let xLabels = '';
  xTicks.forEach((i, ti) => {
    const xx = p.x(i);
    const anchor = ti === 0 ? 'start' : ti === xTicks.length - 1 ? 'end' : 'middle';
    xLabels += `<text class="chart-label" x="${xx}" y="${h - 8}" text-anchor="${anchor}" font-size="10.5">${esc(fmtDate(series[i].d))}</text>`;
  });

  const chartStartMs = new Date(series[0].d + 'T00:00:00Z').getTime();
  const chartSpanMs = new Date(series[series.length - 1].d + 'T00:00:00Z').getTime() - chartStartMs || 1;
  const innerW = w - pad.l - pad.r;
  const buildOverlayPath = (ovl, color) => {
    if (!ovl || ovl.length < 2) return '';
    const filtered = ovl.filter((op) => op.d >= series[0].d && op.d <= series[series.length - 1].d && op.v != null);
    if (filtered.length < 2) return '';
    const pts = filtered.map((op) => {
      const t = (new Date(op.d + 'T00:00:00Z').getTime() - chartStartMs) / chartSpanMs;
      return `${(pad.l + t * innerW).toFixed(2)},${p.y(op.v).toFixed(2)}`;
    }).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.75" stroke-dasharray="5 3" opacity="0.85" pointer-events="none"></polyline>`;
  };
  const { overlayColor = 'var(--gold)' } = opts;
  const overlayPath = buildOverlayPath(overlay, overlayColor) + buildOverlayPath(overlay2, overlay2Color);

  wrap.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><linearGradient id="${containerId}-grad" x1="0" y1="0" x2="0" y2="1">
        <stop class="grad-top" offset="0%" /><stop class="grad-bot" offset="100%" />
      </linearGradient></defs>
      ${grid}
      ${zeroLine}
      <path class="chart-area" d="${p.area}" fill="url(#${containerId}-grad)"></path>
      <path class="chart-line" d="${p.line}" fill="none" stroke-width="2.25"></path>
      ${overlayPath}
      ${extra || ''}
      <line class="chart-crosshair" x1="0" y1="${pad.t}" x2="0" y2="${h - pad.b}" stroke-width="1" display="none" pointer-events="none"></line>
      <circle class="chart-dot" cx="0" cy="0" r="4" stroke-width="2" display="none" pointer-events="none"></circle>
      ${xLabels}
    </svg>`;

  const crosshair = wrap.querySelector('.chart-crosshair');
  const dot = wrap.querySelector('.chart-dot');
  const showAt = (clientX, clientY) => {
    const r = wrap.getBoundingClientRect();
    const scaleX = r.width / w;
    const mouseX = (clientX - r.left) / scaleX;
    const clampedX = Math.max(pad.l, Math.min(w - pad.r, mouseX));
    const ratio = (clampedX - pad.l) / Math.max(1, (w - pad.l - pad.r));
    const idx = Math.max(0, Math.min(series.length - 1, Math.round(ratio * (series.length - 1))));
    const s = series[idx];
    const cx = p.x(idx).toFixed(2);
    const cy = p.y(s.v).toFixed(2);
    crosshair.setAttribute('x1', cx); crosshair.setAttribute('x2', cx); crosshair.removeAttribute('display');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.removeAttribute('display');
    // Tooltip follows the actual pointer (crosshair + dot still snap to the data point).
    showChartTip(formatTooltip ? formatTooltip(s) : `${fmtDate(s.d)} · ${fmtEUR(s.v)}`, clientX, clientY);
  };
  const hideChart = () => {
    hideChartTip();
    crosshair.setAttribute('display', 'none');
    dot.setAttribute('display', 'none');
  };
  wrap.onmousemove = (e) => showAt(e.clientX, e.clientY);
  wrap.onmouseleave = hideChart;
  wrap.ontouchstart = wrap.ontouchmove = (e) => {
    e.preventDefault();
    const t = e.touches[0] || e.changedTouches[0];
    if (t) showAt(t.clientX, t.clientY);
  };
  wrap.ontouchend = hideChart;
  meta.textContent = `${fmtDate(series[0].d)} → ${fmtDate(series[series.length - 1].d)}`;
}

function renderChartInsights(series, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (series.length < 2) { el.innerHTML = ''; return; }
  const startV = series[0].v, endV = series[series.length - 1].v;
  const fmtSgn = (v, dec = 2) => (v >= 0 ? '+' : '') + v.toFixed(dec) + ' pp';
  let bestDay = null, worstDay = null;
  for (let i = 1; i < series.length; i++) {
    const pp = series[i].v - series[i - 1].v;
    if (bestDay === null || pp > bestDay.pp) bestDay = { pp, date: series[i].d };
    if (worstDay === null || pp < worstDay.pp) worstDay = { pp, date: series[i].d };
  }
  const curReturn = endV;
  const periodChange = endV - startV;
  const items = [
    { label: 'Current return', val: (curReturn >= 0 ? '+' : '') + curReturn.toFixed(2) + '%', cls: curReturn >= 0 ? 'pos' : 'neg' },
    { label: 'Period change', val: fmtSgn(periodChange), cls: periodChange >= 0 ? 'pos' : 'neg' },
  ];
  if (bestDay) items.push({ label: 'Best day', val: `+${bestDay.pp.toFixed(2)} pp · ${fmtDate(bestDay.date)}`, cls: 'pos' });
  if (worstDay) items.push({ label: 'Worst day', val: `${fmtSgn(worstDay.pp)} · ${fmtDate(worstDay.date)}`, cls: worstDay.pp < 0 ? 'neg' : 'flat' });
  el.innerHTML = items.map((it) => `<div class="insight">
    <span class="insight-label">${it.label}</span>
    <span class="insight-value mono ${it.cls}">${it.val}</span>
  </div>`).join('');
}

function renderAllocationChart() {
  const wrap = document.getElementById('allocation-wrap');
  if (!wrap) return;
  const { holdings } = buildPortfolio();
  const slices = holdings.filter((h) => h.valueEUR != null && h.valueEUR > 0.01).sort((a, b) => b.valueEUR - a.valueEUR);
  if (!slices.length) {
    wrap.innerHTML = '<div class="chart-empty" style="height:110px">Load prices to see allocation.</div>';
    return;
  }
  const total = slices.reduce((s, h) => s + h.valueEUR, 0);
  const palette = ['#2C5848', '#9C7B3A', '#2f6f7a', '#6d5d8a', '#A8462E', '#4a7c59', '#c4913a', '#5b7fa6', '#8a6d5d', '#5d7a6d'];
  const cx = 90, cy = 90, R = 72, ri = 46;
  let angle = -Math.PI / 2;
  let paths = '';
  if (slices.length === 1) {
    paths = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${palette[0]}" stroke="var(--panel)" stroke-width="2.5" data-i="0" style="cursor:pointer"></circle><circle cx="${cx}" cy="${cy}" r="${ri}" fill="var(--panel)"></circle>`;
  } else {
    slices.forEach((h, i) => {
      const sweep = (h.valueEUR / total) * 2 * Math.PI;
      const end = angle + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      const c1 = Math.cos(angle), s1 = Math.sin(angle), c2 = Math.cos(end), s2 = Math.sin(end);
      paths += `<path data-i="${i}" style="cursor:pointer" d="M${(cx + ri * c1).toFixed(2)},${(cy + ri * s1).toFixed(2)} L${(cx + R * c1).toFixed(2)},${(cy + R * s1).toFixed(2)} A${R},${R} 0 ${large},1 ${(cx + R * c2).toFixed(2)},${(cy + R * s2).toFixed(2)} L${(cx + ri * c2).toFixed(2)},${(cy + ri * s2).toFixed(2)} A${ri},${ri} 0 ${large},0 ${(cx + ri * c1).toFixed(2)},${(cy + ri * s1).toFixed(2)} Z" fill="${palette[i % palette.length]}" stroke="var(--panel)" stroke-width="2.5"></path>`;
      angle = end;
    });
  }
  const legend = slices.map((h, i) => {
    const pct = (h.valueEUR / total * 100).toFixed(1);
    const gCls = h.gainPct == null ? 'flat' : h.gainPct >= 0 ? 'pos' : 'neg';
    return `<div class="alloc-row">
      <span class="alloc-swatch" style="background:${palette[i % palette.length]}"></span>
      <span class="alloc-sym">${esc(h.symbol)}</span>
      <span class="alloc-pct mono">${pct}%</span>
      <span class="alloc-val mono muted">${fmtEUR(h.valueEUR)}</span>
      <span class="alloc-gain ${gCls}">${h.gainPct != null ? fmtPct(h.gainPct) : '—'}</span>
    </div>`;
  }).join('');
  wrap.innerHTML = `<div class="alloc-chart">
    <div class="alloc-donut"><svg class="alloc-svg" viewBox="0 0 180 180">${paths}</svg></div>
    <div class="alloc-legend">
      <div class="alloc-total">Total · <span class="mono">${esc(fmtEUR(total))}</span></div>
      ${legend}
    </div>
  </div>`;

  const donut = wrap.querySelector('.alloc-donut');
  const svgEl = donut.querySelector('.alloc-svg');

  svgEl.addEventListener('mousemove', (e) => {
    const idx = e.target.dataset.i;
    if (idx === undefined) { hideChartTip(); return; }
    const h = slices[parseInt(idx)];
    const pct = (h.valueEUR / total * 100).toFixed(1);
    showChartTip(`${h.symbol} · ${fmtEUR(h.valueEUR)} · ${pct}%`, e.clientX, e.clientY);
  });
  svgEl.addEventListener('mouseleave', () => { hideChartTip(); });
}

async function renderAnalytics() {
  document.querySelectorAll('#range-chips .chip').forEach((x) => x.classList.toggle('active', x.dataset.range === state.analyticsRange));
  const txns = state.txns.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!txns.length) {
    renderChart('chart1-wrap', 'chart1-meta', [], '');
    renderChart('chart2-wrap', 'chart2-meta', [], '');
    const ins = document.getElementById('chart2-insights');
    if (ins) ins.innerHTML = '';
    renderAllocationChart();
    return;
  }
  const end = today();
  const firstTxn = txns[0].date;
  const start = state.analyticsRange === 'all' ? firstTxn : (startForRange(end, state.analyticsRange) < firstTxn ? firstTxn : startForRange(end, state.analyticsRange));
  const days = eachDay(start, end);
  const symbols = Array.from(new Set(txns.map((t) => upper(t.symbol)).filter(Boolean)));
  const ccys = Array.from(new Set(
    txns.flatMap((t) => [t.currency, t.fromCurrency, t.toCurrency]).filter((c) => c && c !== 'EUR')
  ));
  ['chart1-wrap', 'chart2-wrap'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="chart-loading"></div>';
  });

  const deposits = state.txns.filter((t) => t.type === 'deposit').sort((a, b) => (a.date < b.date ? -1 : 1));
  const firstDepDate = deposits.length ? deposits[0].date : null;

  try {
    if (symbols.length) await fetchHistory(symbols, start, end);
    await Promise.all(ccys.map((c) => fetchFxSeries(c, start, end)));
    if (state.settings.proxyUrl && firstDepDate) {
      await fetchHistory(['SPY'], firstDepDate, end);
      await fetchFxSeries('USD', firstDepDate, end);
    }
  } catch (e) {}

  const priceByDate = {};
  symbols.forEach((sym) => {
    const row = state.hist.prices[`${sym}@${start}@${end}`];
    const base = {};
    if (row && Array.isArray(row.series)) row.series.forEach((p) => { base[p.date] = num(p.close); });
    priceByDate[sym] = forwardFill(days, base, state.prices[sym] != null ? state.prices[sym] : null);
  });
  const fxByDate = {};
  ccys.forEach((c) => {
    const base = state.hist.fx[`${c}@${start}@${end}`] || {};
    fxByDate[c] = forwardFill(days, base, state.fxCache[c + '@latest']);
  });
  const valueSeries = [];
  const costSeries = [];
  days.forEach((d) => {
    const row = replaySummaryUntil(d, priceByDate, fxByDate);
    valueSeries.push({ d, v: row.total });
    costSeries.push({ d, v: row.deposited, value: row.total });
  });

  /* ---- Phase 4: money-weighted SPY benchmark ---- */
  // Simulate buying SPY with each deposit on its actual date.
  // Both portfolio % and SPY % use (value - deposited) / deposited,
  // so they share the same denominator and are directly comparable.
  const depositedMap = {};
  costSeries.forEach((x) => { depositedMap[x.d] = x.v; });

  let spyValueSeries = [];  // absolute EUR value, for Chart 1
  let spyMwrSeries = [];    // (value - deposited) / deposited %, for Chart 2
  const spyValueMap = {}, spyMwrMap = {};

  if (state.settings.proxyUrl && firstDepDate) {
    const allSpyDays = eachDay(firstDepDate, end);
    const spyRow = state.hist.prices[`SPY@${firstDepDate}@${end}`];
    const spyBase = {};
    if (spyRow && Array.isArray(spyRow.series)) spyRow.series.forEach((p) => { spyBase[p.date] = num(p.close); });
    const spyByDate = forwardFill(allSpyDays, spyBase, null);
    const usdFxRow = state.hist.fx[`USD@${firstDepDate}@${end}`] || {};
    const usdByDate = forwardFill(allSpyDays, usdFxRow, state.fxCache['USD@latest']);

    // Look ahead up to 4 days to find the nearest trading day value.
    // Handles deposits on weekends/holidays where forward-fill has no prior data yet.
    const nearest = (map, date) => {
      for (let i = 0; i <= 4; i++) {
        const v = map[i === 0 ? date : addDays(date, i)];
        if (v != null) return v;
      }
      return null;
    };

    let spyShares = 0, depIdx = 0;
    while (depIdx < deposits.length && deposits[depIdx].date < start) {
      const dep = deposits[depIdx++];
      const spyP = nearest(spyByDate, dep.date);
      const usdEur = nearest(usdByDate, dep.date) ?? state.fxCache['USD@latest'];
      if (spyP != null && usdEur != null && usdEur > 0) spyShares += (dep.eurValue / usdEur) / spyP;
    }
    days.forEach((d) => {
      while (depIdx < deposits.length && deposits[depIdx].date <= d) {
        const dep = deposits[depIdx++];
        const spyP = nearest(spyByDate, dep.date);
        const usdEur = nearest(usdByDate, dep.date) ?? state.fxCache['USD@latest'];
        if (spyP != null && usdEur != null && usdEur > 0) spyShares += (dep.eurValue / usdEur) / spyP;
      }
      const spyP = spyByDate[d], usdEur = usdByDate[d];
      if (spyP != null && usdEur != null) {
        const spyVal = spyShares * spyP * usdEur;
        spyValueSeries.push({ d, v: spyVal });
        const dep = depositedMap[d];
        if (dep > 0) spyMwrSeries.push({ d, v: (spyVal - dep) / dep * 100 });
      }
    });
    spyValueSeries.forEach((p) => { spyValueMap[p.d] = p.v; });
    spyMwrSeries.forEach((p) => { spyMwrMap[p.d] = p.v; });
  }

  const fmtPctLocal = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const pctSeries = costSeries.filter((x) => x.v > 0).map((x) => ({ d: x.d, v: (x.value - x.v) / x.v * 100 }));
  const depositedSeries = costSeries.map((x) => ({ d: x.d, v: x.v }));

  renderChart('chart1-wrap', 'chart1-meta', valueSeries, '', {
    overlay:  depositedSeries.length >= 2 ? depositedSeries : null,
    overlayColor: 'var(--ink-soft)',
    overlay2: spyValueSeries.length >= 2 ? spyValueSeries : null,
    overlay2Color: '#4A8BC1',
    formatTooltip: (s) => {
      const dep = depositedMap[s.d], spy = spyValueMap[s.d];
      return `${fmtDate(s.d)} · Value ${fmtEUR(s.v)}`
        + (spy != null ? ` · SPY ${fmtEUR(spy)}` : '')
        + (dep != null ? ` · Deposited ${fmtEUR(dep)}` : '');
    },
  });
  renderChart('chart2-wrap', 'chart2-meta', pctSeries, '', {
    formatY: fmtPctLocal,
    formatTooltip: (s) => {
      const spy = spyMwrMap[s.d];
      return `${fmtDate(s.d)} · Portfolio ${fmtPctLocal(s.v)}` + (spy != null ? ` · SPY ${fmtPctLocal(spy)}` : '');
    },
    showZero: true,
    overlay: spyMwrSeries.length >= 2 ? spyMwrSeries : null,
    overlayColor: '#4A8BC1',
  });
  renderChartInsights(pctSeries, 'chart2-insights');
  renderAllocationChart();

  const el1 = document.getElementById('chart1-legend');
  if (el1) el1.innerHTML = `<div class="chart-legend">
    <span class="legend-item"><span class="legend-line legend-portfolio"></span>Portfolio value</span>
    ${spyValueSeries.length >= 2 ? '<span class="legend-item"><span class="legend-line legend-spy"></span>SPY — same cash flows</span>' : ''}
    <span class="legend-item"><span class="legend-line legend-deposited"></span>Deposited</span>
  </div>`;
  const el2 = document.getElementById('chart2-legend');
  if (el2) el2.innerHTML = spyMwrSeries.length >= 2 ? `<div class="chart-legend">
    <span class="legend-item"><span class="legend-line legend-portfolio"></span>Portfolio return</span>
    <span class="legend-item"><span class="legend-line legend-spy"></span>SPY return — same cash flows</span>
  </div>` : '';
}

/* ---------- transactions: add / edit / delete ---------- */
function deleteTxn(id) {
  showConfirm('Delete this transaction? This cannot be undone.', 'Delete', () => {
    state.txns = state.txns.filter((t) => t.id !== id);
    saveTxns();
    renderAll();
  }, true);
}

const modal = () => document.getElementById('modal');
function openModal(id) {
  state.editingId = id || null;
  const existing = id ? state.txns.find((t) => t.id === id) : null;
  const type = existing ? existing.type : 'deposit';
  if (type === 'gift') giftKind = existing && existing.giftKind ? existing.giftKind : 'cash';
  if (type === 'dividend') divKind = existing && existing.divKind ? existing.divKind : 'cash';
  document.getElementById('modal-title').textContent = existing ? 'Edit transaction' : 'Add transaction';
  document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
  buildForm(type, existing);
  clearFormError();
  modal().classList.add('open');
  setTimeout(() => {
    const first = document.getElementById('form-body')?.querySelector('input, select');
    (first || document.getElementById('modal-cancel')).focus();
  }, 60);
}
function closeModal() { modal().classList.remove('open'); state.editingId = null; clearFormError(); }
function setGiftKind(k) {
  giftKind = k;
  const ex = state.editingId ? state.txns.find((t) => t.id === state.editingId) : null;
  buildForm('gift', ex);
}
function setDivKind(k) {
  divKind = k;
  const ex = state.editingId ? state.txns.find((t) => t.id === state.editingId) : null;
  buildForm('dividend', ex);
}

function field(label, inner, hint) {
  return `<label class="field"><span class="field-label">${label}</span>${inner}${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;
}
function ccySelect(id, val) {
  return `<select id="${id}">${CURRENCIES.map((c) => `<option ${c === val ? 'selected' : ''}>${c}</option>`).join('')}</select>`;
}
const inp = (id, val, ph) => `<input type="text" inputmode="decimal" id="${id}" value="${val != null && val !== '' ? val : ''}" placeholder="${ph || '0.00'}">`;

function buildForm(type, t) {
  t = t || {};
  const d = t.date || today();
  const body = document.getElementById('form-body');
  const showEur = (ccy) => (t.eurValue != null && ccy && ccy !== 'EUR' ? t.eurValue : '');
  const calSvg = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="1" y="2.5" width="12" height="10.5" rx="1.5"/><line x1="4.5" y1="1" x2="4.5" y2="4"/><line x1="9.5" y1="1" x2="9.5" y2="4"/><line x1="1" y1="6.5" x2="13" y2="6.5"/></svg>`;
  let html = field('Date', `<div class="date-wrap"><input type="text" id="f-date" value="${fmtDMY(d)}" placeholder="dd/mm/yyyy" maxlength="10" inputmode="numeric"><button type="button" class="cal-btn" onclick="document.getElementById('f-date-pick').showPicker()">${calSvg}</button><input type="date" id="f-date-pick" class="date-pick-hidden" tabindex="-1"></div>`);

  if (type === 'deposit') {
    html += field('Currency', ccySelect('f-ccy', t.currency || 'EUR'));
    html += field('Amount', inp('f-amount', t.amount));
    html += field('EUR value', inp('f-eur', showEur(t.currency), 'auto'), 'Auto-filled from the ECB rate on that date. Override if needed.');
  } else if (type === 'gift') {
    const kind = giftKind;
    html += `<div class="gift-toggle">
        <button type="button" class="gk-btn ${kind === 'cash' ? 'active' : ''}" onclick="setGiftKind('cash')">Cash gift</button>
        <button type="button" class="gk-btn ${kind === 'stock' ? 'active' : ''}" onclick="setGiftKind('stock')">Stock gift</button>
      </div>`;
    if (kind === 'cash') {
      html += field('Currency', ccySelect('f-ccy', t.currency || 'EUR'));
      html += field('Amount', inp('f-amount', t.amount));
      html += field('EUR value', inp('f-eur', showEur(t.currency), 'auto'), 'For your records only — gifts do not count toward Deposited.');
    } else {
      html += field('Symbol', `<input type="text" id="f-symbol" value="${esc(t.symbol || '')}" placeholder="VWCE.DE" style="text-transform:uppercase" list="symbol-datalist">`, 'Yahoo ticker — e.g. AVUV, VWCE.DE, VUAA.MI, BRK-B.');
      html += `<div class="row2">${field('Quantity', inp('f-qty', t.quantity, '0'))}${field('Currency', ccySelect('f-ccy', t.currency || 'USD'))}</div>`;
      html += field('Value / share at receipt', inp('f-price', t.pricePerShare, '0.00'), 'Optional cost basis. Leave blank to treat the gift as free (all value counts as gain).');
      html += field('EUR value', inp('f-eur', showEur(t.currency), 'auto'), 'Optional. Used only for the EUR rollup.');
    }
  } else if (type === 'fee') {
    html += field('Category', `<select id="f-cat">${FEE_CATEGORIES.map((c) => `<option value="${c[0]}" ${t.feeCategory === c[0] ? 'selected' : ''}>${c[1]}</option>`).join('')}</select>`);
    html += field('Currency', ccySelect('f-ccy', t.currency || 'EUR'));
    html += field('Amount', inp('f-amount', t.amount));
    html += field('EUR value', inp('f-eur', showEur(t.currency), 'auto'), 'Auto-filled from the ECB rate. Override for RSD or actual cost.');
  } else if (type === 'fx') {
    html += `<div class="row2">${field('From', ccySelect('f-fromccy', t.fromCurrency || 'EUR'))}${field('From amount', inp('f-fromamt', t.fromAmount))}</div>`;
    html += `<div class="row2">${field('To', ccySelect('f-toccy', t.toCurrency || 'USD'))}${field('To amount', inp('f-toamt', t.toAmount))}</div>`;
    html += field('Conversion fees (EUR)', inp('f-fxfees', t.feesEUR), 'Always in EUR. Reduces your EUR cash and counts toward Fees & taxes.');
  } else if (type === 'buy') {
    html += field('Symbol', `<input type="text" id="f-symbol" value="${esc(t.symbol || '')}" placeholder="VWCE.DE" style="text-transform:uppercase" list="symbol-datalist">`, 'Yahoo ticker — e.g. AVUV (US), VWCE.DE (Xetra), VUAA.MI (Milan), BRK-B.');
    html += `<div class="row2">${field('Quantity', inp('f-qty', t.quantity, '0'))}${field('Currency', ccySelect('f-ccy', t.currency || 'USD'))}</div>`;
    html += `<div class="row2">${field('Price / share', inp('f-price', t.pricePerShare))}${field('Commission', inp('f-comm', t.commission))}</div>`;
    html += field('Total paid in EUR', inp('f-eur', showEur(t.currency), 'auto'), 'Optional — the all-in EUR cost (price + commission). Otherwise the ECB rate is used.');
  } else if (type === 'sell') {
    html += field('Symbol', `<input type="text" id="f-symbol" value="${esc(t.symbol || '')}" placeholder="VWCE.DE" style="text-transform:uppercase" list="symbol-datalist">`, 'Must match the buy. FIFO consumes your oldest lots first.');
    html += `<div class="row2">${field('Quantity', inp('f-qty', t.quantity, '0'))}${field('Currency', ccySelect('f-ccy', t.currency || 'USD'))}</div>`;
    html += `<div class="row2">${field('Price / share', inp('f-price', t.pricePerShare))}${field('Commission', inp('f-comm', t.commission))}</div>`;
    html += field('Net proceeds in EUR', inp('f-eur', showEur(t.currency), 'auto'), 'Optional — EUR actually received (price × qty − commission). Otherwise the ECB rate is used.');
  } else if (type === 'dividend') {
    const dk = divKind;
    html += `<div class="gift-toggle">
        <button type="button" class="gk-btn ${dk === 'cash' ? 'active' : ''}" onclick="setDivKind('cash')">Paid in cash</button>
        <button type="button" class="gk-btn ${dk === 'reinvest' ? 'active' : ''}" onclick="setDivKind('reinvest')">Reinvested</button>
      </div>`;
    if (dk === 'cash') {
      html += field('Symbol (optional)', `<input type="text" id="f-symbol" value="${esc(t.symbol || '')}" placeholder="AVUV" style="text-transform:uppercase" list="symbol-datalist">`, 'Which holding paid it — for your records.');
      html += field('Currency', ccySelect('f-ccy', t.currency || 'USD'));
      html += field('Amount', inp('f-amount', t.amount));
      html += field('EUR value', inp('f-eur', showEur(t.currency), 'auto'), 'Auto-filled from the ECB rate. Counts as income, not Deposited.');
    } else {
      html += field('Symbol', `<input type="text" id="f-symbol" value="${esc(t.symbol || '')}" placeholder="VWCE.DE" style="text-transform:uppercase" list="symbol-datalist">`, 'Yahoo ticker the dividend bought more of.');
      html += `<div class="row2">${field('Quantity', inp('f-qty', t.quantity, '0'))}${field('Currency', ccySelect('f-ccy', t.currency || 'USD'))}</div>`;
      html += field('Price / share', inp('f-price', t.pricePerShare), 'Price the new shares were bought at.');
      html += field('EUR value', inp('f-eur', showEur(t.currency), 'auto'), 'Optional. Adds shares as a new lot; no cash change.');
    }
  }
  html += field('Note (optional)', `<input type="text" id="f-note" value="${esc(t.note || '')}" placeholder="">`);
  body.innerHTML = html;
  document.getElementById('f-date').addEventListener('input', autoFmtDate);
  document.getElementById('f-date-pick').addEventListener('change', (e) => {
    document.getElementById('f-date').value = fmtDMY(e.target.value);
  });
}

async function saveForm() {
  clearFormError();
  const type = document.querySelector('.seg-btn.active').dataset.type;
  const date = parseDMY(document.getElementById('f-date').value) || today();
  const note = (document.getElementById('f-note').value || '').trim();
  const rec = { id: state.editingId || uid(), type, date, note };
  const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };

  // Convert `amount` of `ccy` to EUR. override wins; else ECB; null => caller decides.
  const toEUR = async (amount, ccy) => {
    if (ccy === 'EUR') return amount;
    const ov = val('f-eur');
    if (ov !== '') return num(ov);
    const r = await fxToEUR(ccy, date);
    return r == null ? null : amount * r;
  };

  try {
    if (type === 'deposit' || type === 'fee') {
      rec.currency = val('f-ccy');
      rec.amount = num(val('f-amount'));
      if (type === 'fee') rec.feeCategory = val('f-cat');
      const eur = await toEUR(rec.amount, rec.currency);
      if (eur == null) { showFormError(`No EUR rate for ${rec.currency} on ${date}. Enter the EUR value manually.`); return; }
      rec.eurValue = eur;
    } else if (type === 'gift') {
      rec.giftKind = giftKind;
      if (giftKind === 'cash') {
        rec.currency = val('f-ccy');
        rec.amount = num(val('f-amount'));
        const eur = await toEUR(rec.amount, rec.currency);
        rec.eurValue = eur == null ? 0 : eur;
      } else {
        rec.symbol = (val('f-symbol') || '').trim().toUpperCase();
        rec.quantity = num(val('f-qty'));
        rec.currency = val('f-ccy');
        rec.pricePerShare = num(val('f-price'));
        if (!rec.symbol) { showFormError('Please enter a stock symbol.'); return; }
        const principal = rec.quantity * rec.pricePerShare;
        const eur = principal === 0 ? 0 : await toEUR(principal, rec.currency);
        rec.eurValue = eur == null ? 0 : eur;
      }
    } else if (type === 'fx') {
      rec.fromCurrency = val('f-fromccy');
      rec.fromAmount = num(val('f-fromamt'));
      rec.toCurrency = val('f-toccy');
      rec.toAmount = num(val('f-toamt'));
      rec.feesEUR = num(val('f-fxfees')); // entered directly in EUR
      rec.eurValue = 0;
    } else if (type === 'buy') {
      rec.symbol = (val('f-symbol') || '').trim().toUpperCase();
      rec.quantity = num(val('f-qty'));
      rec.currency = val('f-ccy');
      rec.pricePerShare = num(val('f-price'));
      rec.commission = num(val('f-comm'));
      if (!rec.symbol) { showFormError('Please enter a stock symbol.'); return; }
      const principal = rec.quantity * rec.pricePerShare;
      const totalNative = principal + rec.commission;
      let rate;
      if (rec.currency === 'EUR') rate = 1;
      else if (val('f-eur') !== '') rate = totalNative ? num(val('f-eur')) / totalNative : 0;
      else { rate = await fxToEUR(rec.currency, date); if (rate == null) { showFormError(`No EUR rate for ${rec.currency}. Enter the total EUR paid manually.`); return; } }
      rec.eurValue = totalNative * rate; // full cost incl. commission -> Invested
    } else if (type === 'sell') {
      rec.symbol = (val('f-symbol') || '').trim().toUpperCase();
      rec.quantity = num(val('f-qty'));
      rec.currency = val('f-ccy');
      rec.pricePerShare = num(val('f-price'));
      rec.commission = num(val('f-comm'));
      if (!rec.symbol) { showFormError('Please enter a stock symbol.'); return; }

      /* Oversell guard: temporarily exclude the current edit, rebuild FIFO, check available qty */
      const savedTxns = state.txns;
      state.txns = state.txns.filter((t) => t.id !== (state.editingId || ''));
      const { holdings: tempHoldings } = buildPortfolio();
      state.txns = savedTxns;
      const held = (tempHoldings.find((h) => h.symbol === rec.symbol) || { qty: 0 }).qty;
      if (rec.quantity > held + 1e-9) {
        showFormError(`Cannot sell ${fmtNum(rec.quantity, 4)} ${rec.symbol} — only ${fmtNum(held, 4)} held.`);
        return;
      }

      const net = rec.quantity * rec.pricePerShare - rec.commission;
      const eur = await toEUR(net, rec.currency);
      if (eur == null) { showFormError(`No EUR rate for ${rec.currency}. Enter the net proceeds in EUR manually.`); return; }
      rec.eurValue = eur; // net proceeds in EUR -> drives realized gain
    } else if (type === 'dividend') {
      rec.divKind = divKind;
      rec.symbol = (val('f-symbol') || '').trim().toUpperCase();
      rec.currency = val('f-ccy');
      if (divKind === 'cash') {
        rec.amount = num(val('f-amount'));
        const eur = await toEUR(rec.amount, rec.currency);
        rec.eurValue = eur == null ? 0 : eur;
      } else {
        rec.quantity = num(val('f-qty'));
        rec.pricePerShare = num(val('f-price'));
        if (!rec.symbol) { showFormError('Please enter a stock symbol.'); return; }
        const principal = rec.quantity * rec.pricePerShare;
        const eur = principal === 0 ? 0 : await toEUR(principal, rec.currency);
        rec.eurValue = eur == null ? 0 : eur;
      }
    }
  } catch (e) { showFormError('Something went wrong saving: ' + e.message); return; }

  if (state.editingId) state.txns = state.txns.map((x) => (x.id === state.editingId ? rec : x));
  else state.txns.push(rec);
  saveTxns();
  closeModal();
  renderAll();
  showToast('Transaction saved.');
  if (isStockTxn(rec)) refreshPrices();
}

async function fetchSparklines() {
  const { holdings } = buildPortfolio();
  if (!holdings.length || !state.settings.proxyUrl) return;
  const symbols = holdings.map((h) => h.symbol);
  const end = today();
  const from = addDays(end, -9);
  try { await fetchHistory(symbols, from, end); } catch (e) {}
}

/* ---------- refresh prices + fx ---------- */
async function refreshPrices() {
  const holdings = deriveHoldings();
  const cash = computeCash();
  if (!holdings.length && !Object.keys(cash).length) return;
  if (!state.settings.proxyUrl) {
    showToast('Add a price proxy URL in Settings to load live prices.');
    setView('settings');
    return;
  }
  state.refreshing = true; state.lastError = null; renderAll();
  try {
    const ccys = new Set();
    holdings.forEach((h) => { if (h.currency !== 'EUR') ccys.add(h.currency); });
    Object.keys(cash).forEach((c) => { if (c !== 'EUR' && Math.abs(cash[c]) > 1e-9) ccys.add(c); });
    await Promise.all([...ccys].map((c) => fxToEUR(c)));
    if (holdings.length) await fetchPrices(holdings.map((h) => h.symbol));
    await fetchSparklines();
    state.lastRefresh = new Date();
  } catch (e) {
    state.lastError = e.message === 'NO_PROXY' ? 'set your price proxy URL in Settings' : e.message;
    if (e.message === 'NO_PROXY') setView('settings');
  } finally {
    state.refreshing = false; renderAll();
  }
}

/* ---------- export / import ---------- */
function exportData() {
  const payload = { app: 'wallrus', version: 2, exportedAt: new Date().toISOString(), settings: { base: state.settings.base }, transactions: state.txns };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `wallrus-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const txns = Array.isArray(data) ? data : data.transactions;
      if (!Array.isArray(txns)) throw new Error('No transactions array found.');
      showConfirm(`Import ${txns.length} transactions? This replaces your current data.`, 'Import', () => {
        state.txns = txns;
        saveTxns();
        renderAll();
        showToast(`Imported ${txns.length} transactions.`);
      });
    } catch (e) { showToast('Could not import: ' + e.message, 'error'); }
  };
  reader.readAsText(file);
}
function clearData() {
  showConfirm('Erase ALL transactions on this device? Export a backup first if unsure.', 'Erase all', () => {
    state.txns = [];
    saveTxns();
    renderAll();
  }, true);
}

/* ---------- wire up ---------- */
function init() {
  loadData();

  document.querySelectorAll('.nav-link').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#view-transactions .chip').forEach((c) => c.addEventListener('click', () => { state.txnFilter = c.dataset.filter; renderTransactions(); }));
  document.querySelectorAll('#range-chips .chip').forEach((c) => c.addEventListener('click', () => {
    state.analyticsRange = c.dataset.range;
    document.querySelectorAll('#range-chips .chip').forEach((x) => x.classList.toggle('active', x.dataset.range === state.analyticsRange));
    renderAnalytics();
  }));
  document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    if (b.dataset.type === 'gift') giftKind = 'cash';
    if (b.dataset.type === 'dividend') divKind = 'cash';
    clearFormError();
    buildForm(b.dataset.type, null);
  }));

  initTheme();
  document.getElementById('theme-btn').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(STORE_THEME, next); } catch (e) {}
    applyTheme(next);
  });
  document.getElementById('add-btn').addEventListener('click', () => openModal(null));
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-save').addEventListener('click', saveForm);
  document.getElementById('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => { const cb = _confirmCb; closeConfirm(); if (cb) cb(); });
  document.getElementById('confirm-overlay').addEventListener('click', (e) => { if (e.target.id === 'confirm-overlay') closeConfirm(); });

  document.getElementById('refresh-btn').addEventListener('click', refreshPrices);
  document.getElementById('portfolio-refresh').addEventListener('click', refreshPrices);

  /* FEATURE 2+3: transaction date + symbol filters */
  ['txn-from', 'txn-to'].forEach((id) => document.getElementById(id).addEventListener('input', autoFmtDate));
  document.getElementById('txn-from').addEventListener('change', (e) => { state.txnDateFrom = parseDMY(e.target.value); renderTransactions(); });
  document.getElementById('txn-to').addEventListener('change', (e) => { state.txnDateTo = parseDMY(e.target.value); renderTransactions(); });
  document.getElementById('txn-from-pick').addEventListener('change', (e) => {
    document.getElementById('txn-from').value = fmtDMY(e.target.value);
    state.txnDateFrom = e.target.value; renderTransactions();
  });
  document.getElementById('txn-to-pick').addEventListener('change', (e) => {
    document.getElementById('txn-to').value = fmtDMY(e.target.value);
    state.txnDateTo = e.target.value; renderTransactions();
  });
  document.getElementById('txn-symbol').addEventListener('input', (e) => { state.txnSymbol = e.target.value.trim(); renderTransactions(); });
  document.getElementById('txn-clear-filters').addEventListener('click', () => {
    state.txnDateFrom = ''; state.txnDateTo = ''; state.txnSymbol = '';
    document.getElementById('txn-from').value = '';
    document.getElementById('txn-to').value = '';
    document.getElementById('txn-symbol').value = '';
    renderTransactions();
  });

  document.getElementById('save-proxy-btn').addEventListener('click', () => {
    state.settings.proxyUrl = document.getElementById('proxy-url-input').value.trim().replace(/\/+$/, '');
    saveSettings();
    const note = document.getElementById('proxy-saved');
    note.textContent = 'Saved.'; setTimeout(() => (note.textContent = ''), 2000);
    if (state.settings.proxyUrl) refreshPrices();
  });
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-input').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  document.getElementById('clear-btn').addEventListener('click', clearData);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeConfirm(); } });
  window.addEventListener('resize', () => { if (state.view === 'analytics') renderAnalytics(); });

  const savedView = localStorage.getItem('wallrus.view');
  setView(['dashboard','portfolio','transactions','analytics','settings'].includes(savedView) ? savedView : 'dashboard');
  if (state.settings.proxyUrl && deriveHoldings().length) refreshPrices();
}

window.openModal = openModal;
window.deleteTxn = deleteTxn;
window.setManualPrice = setManualPrice;
window.setGiftKind = setGiftKind;
window.setDivKind = setDivKind;
window.sortPortfolio = sortPortfolio;

document.addEventListener('DOMContentLoaded', init);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
