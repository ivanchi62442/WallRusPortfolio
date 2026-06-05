/* ============================================================
   WallRus price proxy  —  Cloudflare Worker
   ------------------------------------------------------------
   Fetches current prices from Yahoo Finance (server-side, so no
   browser CORS wall) and returns CORS-enabled JSON to your app.
   No API key. Covers US and European listings.

   Request:  GET  https://your-worker.workers.dev/?symbols=AVUV,VWCE.DE,BRK-B
   Response: { "AVUV": {"price":120.05,"currency":"USD"},
               "VWCE.DE": {"price":131.2,"currency":"EUR"},
               "BRK-B": {"price":486.3,"currency":"USD"} }

   Deploy (free, ~3 minutes):
     1. Create a free account at https://dash.cloudflare.com
     2. Workers & Pages  ->  Create  ->  Workers  ->  Create Worker
     3. Name it (e.g. "wallrus-proxy")  ->  Deploy
     4. Click "Edit code", delete the sample, paste THIS file, Deploy
     5. Copy the worker URL and paste it into WallRus -> Settings
   ============================================================ */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function priceFor(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WallRusProxy/1.0)', 'Accept': 'application/json' },
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!r.ok) return { error: 'http ' + r.status };
  const data = await r.json();
  const res = data && data.chart && data.chart.result && data.chart.result[0];
  if (!res) {
    const msg = data && data.chart && data.chart.error && data.chart.error.description;
    return { error: msg || 'not found' };
  }
  const meta = res.meta || {};
  let price = meta.regularMarketPrice != null ? meta.regularMarketPrice : null;
  if (price == null && res.indicators && res.indicators.quote && res.indicators.quote[0]) {
    const closes = res.indicators.quote[0].close || [];
    for (let i = closes.length - 1; i >= 0; i--) { if (closes[i] != null) { price = closes[i]; break; } }
  }
  if (price == null) return { error: 'no price' };
  return { price, currency: meta.currency || null };
}

function toISODate(ts) {
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function historyFor(symbol, from, to, interval = '1d') {
  const params = new URLSearchParams();
  params.set('interval', interval);
  if (from) params.set('period1', String(Math.floor(new Date(from + 'T00:00:00Z').getTime() / 1000)));
  if (to) params.set('period2', String(Math.floor(new Date(to + 'T23:59:59Z').getTime() / 1000)));
  if (!from || !to) params.set('range', '1y');
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WallRusProxy/1.0)', 'Accept': 'application/json' },
    cf: { cacheTtl: 900, cacheEverything: true },
  });
  if (!r.ok) return { error: 'http ' + r.status };
  const data = await r.json();
  const res = data && data.chart && data.chart.result && data.chart.result[0];
  if (!res) {
    const msg = data && data.chart && data.chart.error && data.chart.error.description;
    return { error: msg || 'not found' };
  }
  const meta = res.meta || {};
  const stamps = Array.isArray(res.timestamp) ? res.timestamp : [];
  const quote = res.indicators && res.indicators.quote && res.indicators.quote[0];
  const closes = quote && Array.isArray(quote.close) ? quote.close : [];
  const series = [];
  for (let i = 0; i < stamps.length && i < closes.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close)) continue;
    series.push({ date: toISODate(stamps[i]), close });
  }
  return { currency: meta.currency || null, series };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(request.url);
    const param = url.searchParams.get('symbols');
    if (!param) return json({ error: 'pass ?symbols=AVUV,VWCE.DE' }, 400);
    const symbols = param.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    const historical = ['1', 'true', 'yes'].includes((url.searchParams.get('historical') || '').toLowerCase());
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const out = {};
    if (historical) {
      await Promise.all(symbols.map(async (sym) => {
        try { out[sym] = await historyFor(sym, from, to, '1d'); }
        catch (e) { out[sym] = { error: String(e && e.message || e) }; }
      }));
    } else {
      await Promise.all(symbols.map(async (sym) => {
        try { out[sym] = await priceFor(sym); }
        catch (e) { out[sym] = { error: String(e && e.message || e) }; }
      }));
    }
    return json(out);
  },
};
