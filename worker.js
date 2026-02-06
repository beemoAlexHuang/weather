// ================= CONFIG =================
const DEFAULT_TZ = "Asia/Taipei";
const DEFAULT_TIMES = ["07:00", "12:00", "18:00"];
const CACHE_TTL_SECONDS = 1800; // 30 min
const DEFAULT_POP_RAIN_THRESHOLD = 30; // %

const TZ_OFFSET = "+08:00";
const WIND_STRONG_MS = 6;
const HUMID_FEEL_BONUS = 1.5;

// 改演算法/版面就改這個：一鍵切新 cache
const CACHE_VERSION = "2026-02-05pwa-v1";

// 想更保守（早晚偏冷）可調 0.5~1.5
const MORNING_BIAS_C = 0.0;
const EVENING_BIAS_C = 0.0;

// ================= ROUTER =================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // API
    if (url.pathname === "/api/outfit") return handleApi(request, env, ctx);

    // PWA assets
    if (url.pathname === "/manifest.webmanifest") return manifestResponse(url.origin);
    if (url.pathname === "/sw.js") return serviceWorkerResponse();
    if (url.pathname === "/icon.svg") return iconSvgResponse();
    if (url.pathname === "/apple-touch-icon.png") return appleTouchIconResponse(); // 內建一個簡單 PNG（小）
    if (url.pathname === "/mini") return miniHtmlResponse(url);
    if (url.pathname === "/" || url.pathname === "/ui") return uiHtmlResponse(url);

    // help
    return new Response(
      [
        "OK",
        "",
        `UI: ${url.origin}/`,
        `Mini: ${url.origin}/mini`,
        `API: ${url.origin}/api/outfit?lat=25.0330&lon=121.5654`,
        `Manifest: ${url.origin}/manifest.webmanifest`,
      ].join("\n"),
      { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  },
};

// ================= UI HTML =================
function uiHtmlResponse(url) {
  const origin = url.origin;
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>穿搭建議</title>

  <!-- PWA / Add to Home Screen -->
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#111111" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="穿搭建議" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <style>
    :root{
      --bg:#ffffff; --fg:#111111; --muted:#666; --card:#f6f6f7; --border:#e5e5e7;
      --btn:#111; --btnfg:#fff; --btn2:#666; --code:#f0f0f2;
    }
    @media (prefers-color-scheme: dark){
      :root{
        --bg:#0b0b0c; --fg:#f2f2f3; --muted:#a2a2aa; --card:#141417; --border:#242428;
        --btn:#f2f2f3; --btnfg:#111; --btn2:#3a3a42; --code:#1a1a1f;
      }
    }
    html,body{background:var(--bg); color:var(--fg);}
    body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans TC","PingFang TC";margin:16px;line-height:1.45}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px;margin:12px 0}
    .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    input{padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--fg)}
    button{padding:10px 12px;border:0;border-radius:12px;background:var(--btn);color:var(--btnfg);cursor:pointer}
    button.secondary{background:var(--btn2);color:#fff}
    code{background:var(--code);padding:2px 6px;border-radius:8px}
    .muted{color:var(--muted)}
    .big{font-size:18px;font-weight:800}
    .miniLink{font-size:14px}
    pre{background:#000;color:#eee;padding:12px;border-radius:14px;overflow:auto}
    .pill{display:inline-block;padding:4px 10px;border-radius:999px;background:var(--code);color:var(--fg);border:1px solid var(--border);font-size:12px}
    .hint{font-size:13px}
  </style>
</head>
<body>
  <div class="row" style="justify-content:space-between;align-items:flex-end">
    <div>
      <div class="pill">PWA / 介面 + API</div>
      <h2 style="margin:10px 0 0">穿搭建議</h2>
      <div class="muted hint">API：<code>${origin}/api/outfit?lat=25.0330&lon=121.5654</code></div>
    </div>
    <div class="muted miniLink"><a href="/mini" style="color:inherit">開啟精簡版 /mini</a></div>
  </div>

  <div class="card">
    <div class="row">
      <button id="btnGeo">用目前位置</button>
      <button class="secondary" id="btnTaipei101">台北101</button>
      <label class="muted"><input type="checkbox" id="debug" /> debug</label>
    </div>

    <div class="row" style="margin-top:10px">
      <div>
        <div class="muted">緯度 lat</div>
        <input id="lat" inputmode="decimal" placeholder="25.0330" size="12" />
      </div>
      <div>
        <div class="muted">經度 lon</div>
        <input id="lon" inputmode="decimal" placeholder="121.5654" size="12" />
      </div>
      <button id="btnRun">查詢</button>
      <button class="secondary" id="btnPin">儲存座標</button>
    </div>

    <div class="muted hint" style="margin-top:8px">
      iPhone：Safari → 分享 →「加入主畫面」。加入後會以全螢幕開啟，並可用 apple-touch-icon 顯示更漂亮的圖示。 
    </div>
  </div>

  <div class="card" id="out">
    <div class="big" id="summary">尚未查詢</div>
    <div class="muted" id="meta"></div>
    <div id="periods"></div>
  </div>

  <details class="card">
    <summary>Raw JSON</summary>
    <pre id="raw">{}</pre>
  </details>

<script>
  const apiBase = "/api/outfit";
  const KEY = "outfit:lastCoords";

  function qs(id){ return document.getElementById(id); }
  function setText(id, txt){ qs(id).textContent = txt; }
  function saveCoords(lat, lon){
    localStorage.setItem(KEY, JSON.stringify({lat, lon, t: Date.now()}));
  }
  function loadCoords(){
    try{ return JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ return null; }
  }

  function render(data){
    setText("raw", JSON.stringify(data, null, 2));
    if(!data || !data.ok){
      setText("summary", "查詢失敗");
      setText("meta", data && data.error ? data.error : "");
      qs("periods").innerHTML = "";
      return;
    }
    setText("summary", data.overall?.summary || "（無 overall）");
    setText("meta", \`\${data.place?.ctyName||""}\${data.place?.townName||""} \${data.date} \${data.timezone}\`);
    const p = data.periods || [];
    qs("periods").innerHTML = p.map(x => {
      const rain = (x.rain === true) ? "會下雨" : (x.rain === false ? "不太會下雨" : "雨未知");
      const extras = (x.extras && x.extras.length) ? ("｜" + x.extras.join("、")) : "";
      const feels = (x.feels_like_c != null) ? \`（體感 \${x.feels_like_c}°C）\` : "";
      return \`<div style="margin-top:8px"><b>\${x.label || x.time}</b>：\${x.wear} \${feels}｜\${rain}\${extras}</div>\`;
    }).join("");

    // 同步 mini 連結（帶座標）
    const lat = data.location?.lat, lon = data.location?.lon;
    if(Number.isFinite(lat) && Number.isFinite(lon)){
      history.replaceState(null, "", \`/?lat=\${lat}&lon=\${lon}&debug=\${qs("debug").checked?1:0}\`);
    }
  }

  async function callApi(lat, lon){
    const debug = qs("debug").checked ? "1" : "0";
    const url = \`\${apiBase}?lat=\${encodeURIComponent(lat)}&lon=\${encodeURIComponent(lon)}&debug=\${debug}\`;
    const res = await fetch(url, { headers: { "Accept": "application/json" }});
    const data = await res.json();
    render(data);
    return data;
  }

  qs("btnRun").onclick = () => {
    const lat = qs("lat").value.trim();
    const lon = qs("lon").value.trim();
    if(!lat || !lon) return alert("請輸入 lat/lon");
    saveCoords(lat, lon);
    callApi(lat, lon).catch(e => render({ok:false,error:String(e)}));
  };

  qs("btnPin").onclick = () => {
    const lat = qs("lat").value.trim();
    const lon = qs("lon").value.trim();
    if(!lat || !lon) return alert("請先輸入 lat/lon");
    saveCoords(lat, lon);
    alert("已儲存，下次開啟會自動帶入。");
  };

  qs("btnTaipei101").onclick = () => {
    qs("lat").value = "25.0330";
    qs("lon").value = "121.5654";
    qs("btnRun").click();
  };

  qs("btnGeo").onclick = () => {
    if(!navigator.geolocation) return alert("此瀏覽器不支援定位");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        qs("lat").value = lat;
        qs("lon").value = lon;
        saveCoords(lat, lon);
        callApi(lat, lon).catch(e => render({ok:false,error:String(e)}));
      },
      err => alert("定位失敗：" + err.message),
      { enableHighAccuracy:false, timeout:10000, maximumAge:60000 }
    );
  };

  // 進來先用：URL座標 > localStorage座標
  const params = new URLSearchParams(location.search);
  const pLat = params.get("lat"), pLon = params.get("lon");
  if(pLat && pLon){
    qs("lat").value = pLat; qs("lon").value = pLon;
    qs("debug").checked = params.get("debug") === "1";
    saveCoords(pLat, pLon);
    qs("btnRun").click();
  } else {
    const last = loadCoords();
    if(last && last.lat && last.lon){
      qs("lat").value = last.lat; qs("lon").value = last.lon;
    }
  }

  // Register SW (best effort)
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("/sw.js").catch(()=>{});
  }
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

// ================= MINI (Widget-friendly) =================
function miniHtmlResponse(url) {
  const origin = url.origin;
  // mini 支援：?lat=...&lon=... ；沒給就用 localStorage（若是加入主畫面/一般瀏覽器）
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>穿搭（精簡）</title>

  <meta name="theme-color" content="#111111" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="穿搭（精簡）" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <style>
    :root{--bg:#fff;--fg:#111;--muted:#666;--card:#f6f6f7;--border:#e5e5e7}
    @media (prefers-color-scheme: dark){
      :root{--bg:#0b0b0c;--fg:#f2f2f3;--muted:#a2a2aa;--card:#141417;--border:#242428}
    }
    html,body{background:var(--bg);color:var(--fg);margin:0}
    body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"Noto Sans TC","PingFang TC";padding:14px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px}
    .big{font-size:22px;font-weight:900;line-height:1.25}
    .row{margin-top:10px;color:var(--muted);font-size:14px}
    .small{margin-top:10px;font-size:14px;line-height:1.4}
    .err{color:#d33}
    a{color:inherit}
  </style>
</head>
<body>
  <div class="card">
    <div class="big" id="s">載入中…</div>
    <div class="row" id="m"></div>
    <div class="small" id="p"></div>
  </div>

<script>
  const KEY = "outfit:lastCoords";
  const apiBase = "/api/outfit";

  function getParams(){
    const q = new URLSearchParams(location.search);
    return { lat: q.get("lat"), lon: q.get("lon") };
  }
  function loadCoords(){
    try{ return JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ return null; }
  }
  function set(id, t){ document.getElementById(id).textContent = t; }

  async function run(){
    let {lat, lon} = getParams();
    if(!lat || !lon){
      const last = loadCoords();
      if(last && last.lat && last.lon){ lat = last.lat; lon = last.lon; }
    }
    if(!lat || !lon){
      set("s","請先到主頁設定座標");
      set("m","→ " + location.origin + "/");
      return;
    }
    const url = \`\${apiBase}?lat=\${encodeURIComponent(lat)}&lon=\${encodeURIComponent(lon)}\`;
    const res = await fetch(url);
    const data = await res.json();
    if(!data.ok){
      set("s","查詢失敗");
      set("m", data.error || "");
      return;
    }
    set("s", data.overall?.summary || "（無 summary）");
    set("m", \`\${data.place?.ctyName||""}\${data.place?.townName||""}  \${data.date}\`);
    const lines = (data.periods||[]).map(x => {
      const rain = (x.rain===true) ? "雨" : (x.rain===false ? "" : "雨?");
      return \`\${x.label||x.time}：\${x.wear}\${rain?(" · "+rain):""}\`;
    });
    set("p", lines.join("｜"));
  }
  run().catch(e => { document.getElementById("s").textContent = "錯誤"; document.getElementById("m").textContent = String(e); document.getElementById("m").className="row err"; });
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

// ================= PWA manifest =================
function manifestResponse(origin) {
  const manifest = {
    name: "穿搭建議",
    short_name: "穿搭",
    start_url: "/?source=a2hs",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#111111",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}

// ================= Service worker (simple offline shell) =================
function serviceWorkerResponse() {
  const js = `
// Very small SW: cache the UI shell + mini.
// (Best-effort; iOS support varies.)
const CACHE = "outfit-shell-${CACHE_VERSION}";
const ASSETS = ["/", "/mini", "/manifest.webmanifest", "/icon.svg", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Don't cache API responses here (they change). Let Worker API do its own caching.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then(hit => hit || fetch(event.request))
  );
});
`;
  return new Response(js, {
    status: 200,
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
  });
}

// ================= Icons =================
function iconSvgResponse() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="outfit">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#111"/>
      <stop offset="1" stop-color="#444"/>
    </linearGradient>
  </defs>
  <rect x="32" y="32" width="448" height="448" rx="96" fill="url(#g)"/>
  <path d="M196 160c10-22 30-36 60-36s50 14 60 36l32 26-28 58-22-18v164c0 14-12 26-26 26H240c-14 0-26-12-26-26V226l-22 18-28-58 32-26z"
        fill="#fff" opacity="0.92"/>
  <circle cx="256" cy="176" r="18" fill="#fff" opacity="0.92"/>
</svg>`;
  return new Response(svg, {
    status: 200,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}

// 簡易 180x180 PNG（iOS apple-touch-icon 常用尺寸）
// 這裡用最小可行方案：回傳一張非常簡單的 PNG（固定內容）
function appleTouchIconResponse() {
  // 這是一個很小的內嵌 PNG（180x180），內容是深底白衣符號（為了避免多檔案部署）
  // 若你之後想換更漂亮的 icon，建議改成放在 R2/Pages assets 或直接在 Worker 內替換這段 bytes。
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAAAACXBIWXMAAAsSAAALEgHS3X78AAAB" +
    "tElEQVR4nO3RMQ0AAAgDINc/9K3hQYwQkG7m2wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB4Gm0AAZ9m8p8AAAAASUVORK5CYII=";
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" },
  });
}

// ================= API =================
async function handleApi(request, env, ctx) {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";

  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return json({ ok: false, error: "missing/invalid lat lon" }, 400, corsHeaders());
  }

  const tz = (url.searchParams.get("tz") || env.TZ || DEFAULT_TZ).toString();
  const date = (url.searchParams.get("date") || todayInTZ(tz)).toString();
  const times = (env.TIMES ? String(env.TIMES).split(",") : DEFAULT_TIMES).map(s => s.trim()).filter(Boolean);
  const popTh = env.POP_RAIN_THRESHOLD ? Number(env.POP_RAIN_THRESHOLD) : DEFAULT_POP_RAIN_THRESHOLD;

  if (!env.CWA_ENDPOINT || !env.CWA_GQL_QUERY || !env.CWA_AUTH) {
    return json({ ok: false, error: "Missing env: CWA_ENDPOINT, CWA_GQL_QUERY, CWA_AUTH(secret)" }, 500, corsHeaders());
  }

  const useCache = !debug;

  // Cache key is Request(URL). Cache API keys must be fully-qualified valid URLs.
  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = "/__cache__/api-outfit";
  cacheUrl.search = "";
  cacheUrl.searchParams.set("lat", String(lat));
  cacheUrl.searchParams.set("lon", String(lon));
  cacheUrl.searchParams.set("date", date);
  cacheUrl.searchParams.set("tz", tz);
  cacheUrl.searchParams.set("times", times.join(","));
  cacheUrl.searchParams.set("popTh", String(popTh));
  cacheUrl.searchParams.set("v", CACHE_VERSION);
  cacheUrl.searchParams.set("debug", debug ? "1" : "0");

  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;
  if (useCache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  // CWA GraphQL: Authorization in URL, query in body (avoid header newline issues).
  const endpoint = new URL(env.CWA_ENDPOINT);
  endpoint.searchParams.set("Authorization", env.CWA_AUTH);

  const gql = String(env.CWA_GQL_QUERY);
  const resp = await fetch(endpoint.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query: gql, variables: { Longitude: lon, Latitude: lat } }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return json({ ok: false, error: `CWA upstream error: HTTP ${resp.status}`, body: text.slice(0, 800) }, 502, corsHeaders());
  }

  const payload = await resp.json();
  if (payload?.errors?.length) {
    return json({ ok: false, error: "CWA GraphQL returned errors", errors: payload.errors }, 502, corsHeaders());
  }

  let town = payload?.data?.town;
  if (Array.isArray(town)) town = town[0];
  const f72 = town?.forecast72hr;
  if (!f72) return json({ ok: false, error: "CWA response missing forecast72hr" }, 502, corsHeaders());

  const tempPoints = flattenPointSeries_(f72?.Temperature?.Time, "DataTime", "Temperature");
  const windPoints = flattenPointSeries_(f72?.WindSpeed?.Time, "DataTime", "WindSpeed");
  const ciPoints = flattenComfortSeries_(f72?.ComfortIndex?.Time);

  const popIntervals = flattenIntervalSeries_(f72?.ProbabilityOfPrecipitation?.Time, "StartTime", "EndTime", "ProbabilityOfPrecipitation");
  const wxDescIntervals = flattenIntervalDesc_(f72?.WeatherDescription?.Time, "StartTime", "EndTime", "WeatherDescription");

  const periods = times.map(hhmm => {
    const hh = String(hhmm).trim();
    const targetMs = parseCwaTimeToMs(`${date}T${hh}:00`);

    const tempC = pickAtOrBefore_(tempPoints, targetMs);
    const windMs = pickAtOrBefore_(windPoints, targetMs);
    const comfortDesc = pickDescAtOrBefore_(ciPoints, targetMs);

    const popPct = pickIntervalValue_(popIntervals, targetMs);
    const wxDesc = pickIntervalDesc_(wxDescIntervals, targetMs);

    const advice = outfitAdvice({ tempC, windMs, popPct, wxDesc, comfortDesc, popTh, hhmm: hh });

    const item = {
      label: labelOfTime(hh),
      time: hh,
      wear: advice.wear,
      rain: advice.rain,
      extras: advice.extras,
      feels_like_c: advice.feels_like_c,
    };
    if (debug) item._debug = { tempC, windMs, comfortDesc, popPct, wxDesc };
    return item;
  });

  const overall = overallOutfit({ periods, popTh });

  const out = json(
    {
      ok: true,
      date,
      timezone: tz,
      location: { lat, lon },
      place: { ctyName: town?.ctyName ?? null, townName: town?.townName ?? null, villageName: town?.villageName ?? null },
      periods,
      overall,
    },
    200,
    corsHeaders()
  );

  out.headers.set("Cache-Control", `public, max-age=${CACHE_TTL_SECONDS}`);
  if (useCache) ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}

// ================= Outfit logic =================
function labelOfTime(hhmm) {
  const s = String(hhmm || "").trim();
  const h = parseInt(s.split(":")[0], 10);
  if (!Number.isFinite(h)) return "";
  if (h < 10) return "早";
  if (h < 15) return "中";
  return "晚";
}

function timeBiasC(hhmm) {
  const s = String(hhmm || "").trim();
  const h = parseInt(s.split(":")[0], 10);
  if (!Number.isFinite(h)) return 0;
  if (h <= 8) return -MORNING_BIAS_C;
  if (h >= 17) return -EVENING_BIAS_C;
  return 0;
}

function wearFromFeelsC(f) {
  if (!Number.isFinite(f)) return "未知";
  if (f >= 34) return "超薄短袖/背心";
  if (f >= 30) return "短袖（排汗）";
  if (f >= 26) return "短袖";
  if (f >= 22) return "薄長袖";
  if (f >= 18) return "薄外套";
  if (f >= 14) return "毛衣+薄外套";
  if (f >= 10) return "厚外套";
  if (f >= 5) return "羽絨";
  return "全副武裝";
}

function parseCwaTimeToMs(s) {
  if (!s) return NaN;
  let t = String(s).trim();
  if (t.includes(" ") && !t.includes("T")) t = t.replace(" ", "T");
  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(t);
  if (!hasTz) t = t + TZ_OFFSET;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : NaN;
}

function parseSkyFromDesc(desc) {
  const s = String(desc || "");
  const sunny = s.includes("晴");
  const cloudy = s.includes("陰") || s.includes("多雲");
  const rainy = s.includes("雨") || s.includes("雷") || s.includes("陣雨");
  return { sunny, cloudy, rainy };
}

function comfortAdjust(desc) {
  const d = String(desc || "");
  if (d.includes("非常悶熱")) return +2.5;
  if (d.includes("悶熱")) return +HUMID_FEEL_BONUS;
  if (d.includes("舒適")) return 0;
  if (d.includes("稍涼") || d.includes("偏涼")) return -0.5;
  if (d.includes("寒冷") || d.includes("冷")) return -1.5;
  return 0;
}

function windChillLikeC(tempC, windMs) {
  if (!Number.isFinite(tempC)) return NaN;
  if (!Number.isFinite(windMs) || windMs <= 1.5) return tempC;
  if (tempC > 12) return tempC;
  const drop = Math.min(5, (windMs - 1.5) * 0.4);
  return tempC - Math.max(0, drop);
}

function calcFeelsC({ tempC, windMs, comfortDesc, wxDesc, hhmm }) {
  let feels = tempC;
  feels = windChillLikeC(feels, windMs);
  feels += comfortAdjust(comfortDesc);

  const { sunny, rainy, cloudy } = parseSkyFromDesc(wxDesc);
  if (sunny && Number.isFinite(feels) && feels >= 28) feels += 1.0;
  if (cloudy && Number.isFinite(feels) && feels >= 26) feels -= 0.3;
  if (rainy && Number.isFinite(feels)) feels -= 0.5;

  feels += timeBiasC(hhmm);
  return feels;
}

function outfitAdvice({ tempC, windMs, popPct, wxDesc, comfortDesc, popTh, hhmm }) {
  const { sunny, rainy } = parseSkyFromDesc(wxDesc);
  const feels = calcFeelsC({ tempC, windMs, comfortDesc, wxDesc, hhmm });
  const wear = wearFromFeelsC(feels);

  let rain = null;
  if (Number.isFinite(popPct)) rain = popPct >= popTh;
  else if (typeof wxDesc === "string") rain = rainy;

  const extras = [];
  if (rain === true) extras.push("雨具/防水外層");
  if (sunny && Number.isFinite(feels) && feels >= 26) extras.push("帽子/防曬");
  if (Number.isFinite(windMs) && windMs >= WIND_STRONG_MS && Number.isFinite(feels) && feels <= 22) extras.push("防風外層");
  if (String(wxDesc || "").includes("雷")) extras.push("注意雷雨");

  return { wear, rain, extras, feels_like_c: Number.isFinite(feels) ? Math.round(feels * 10) / 10 : null };
}

// ================= Series helpers =================
function flattenPointSeries_(arr, timeKey, valueKey) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  for (const x of a) {
    const ms = parseCwaTimeToMs(x?.[timeKey]);
    const v = Number(x?.[valueKey]);
    if (Number.isFinite(ms) && Number.isFinite(v)) out.push({ ms, v });
  }
  out.sort((p, q) => p.ms - q.ms);
  return out;
}

function flattenComfortSeries_(arr) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  for (const x of a) {
    const ms = parseCwaTimeToMs(x?.DataTime);
    const d = x?.ComfortIndexDescription;
    if (Number.isFinite(ms) && typeof d === "string") out.push({ ms, d });
  }
  out.sort((p, q) => p.ms - q.ms);
  return out;
}

function flattenIntervalSeries_(arr, startKey, endKey, valueKey) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  for (const x of a) {
    const s = parseCwaTimeToMs(x?.[startKey]);
    const e = parseCwaTimeToMs(x?.[endKey]);
    const v = Number(x?.[valueKey]);
    if (Number.isFinite(s) && Number.isFinite(e)) out.push({ s, e, v: Number.isFinite(v) ? v : NaN });
  }
  out.sort((p, q) => p.s - q.s);
  return out;
}

function flattenIntervalDesc_(arr, startKey, endKey, descKey) {
  const out = [];
  const a = Array.isArray(arr) ? arr : [];
  for (const x of a) {
    const s = parseCwaTimeToMs(x?.[startKey]);
    const e = parseCwaTimeToMs(x?.[endKey]);
    const d = x?.[descKey];
    if (Number.isFinite(s) && Number.isFinite(e) && typeof d === "string") out.push({ s, e, d });
  }
  out.sort((p, q) => p.s - q.s);
  return out;
}

function pickAtOrBefore_(points, targetMs) {
  if (!points.length || !Number.isFinite(targetMs)) return NaN;
  let best = NaN;
  for (const p of points) {
    if (p.ms <= targetMs) best = p.v;
    else break;
  }
  return Number.isFinite(best) ? best : points[0].v;
}

function pickDescAtOrBefore_(points, targetMs) {
  if (!points.length || !Number.isFinite(targetMs)) return null;
  let best = null;
  for (const p of points) {
    if (p.ms <= targetMs) best = p.d;
    else break;
  }
  return best ?? points[0].d ?? null;
}

// intervals: cover -> fallback nearest by end-time
function pickIntervalValue_(intervals, targetMs) {
  if (!intervals.length || !Number.isFinite(targetMs)) return NaN;
  for (const it of intervals) if (targetMs >= it.s && targetMs < it.e) return it.v;

  let best = intervals[0];
  let bestDiff = Math.abs(best.e - targetMs);
  for (const it of intervals) {
    const diff = Math.abs(it.e - targetMs);
    if (diff < bestDiff) { best = it; bestDiff = diff; }
  }
  return best.v;
}

function pickIntervalDesc_(intervals, targetMs) {
  if (!intervals.length || !Number.isFinite(targetMs)) return null;
  for (const it of intervals) if (targetMs >= it.s && targetMs < it.e) return it.d;

  let best = intervals[0];
  let bestDiff = Math.abs(best.e - targetMs);
  for (const it of intervals) {
    const diff = Math.abs(it.e - targetMs);
    if (diff < bestDiff) { best = it; bestDiff = diff; }
  }
  return best.d;
}

function overallOutfit({ periods, popTh }) {
  const feels = periods.map(p => Number(p.feels_like_c)).filter(Number.isFinite);
  const minFeels = feels.length ? Math.min(...feels) : NaN;
  const maxFeels = feels.length ? Math.max(...feels) : NaN;
  const swing = (Number.isFinite(minFeels) && Number.isFinite(maxFeels)) ? (maxFeels - minFeels) : NaN;

  const rainAny = periods.some(p => p.rain === true);
  const winds = periods.map(p => Number(p._debug?.windMs)).filter(Number.isFinite);
  const windMax = winds.length ? Math.max(...winds) : NaN;

  const plan = {
    base: null, mid: null, shell: null,
    summary: null,
    tips: [],
    range: Number.isFinite(swing) ? { min_feels_like_c: minFeels, max_feels_like_c: maxFeels } : null
  };

  if (!Number.isFinite(swing)) {
    plan.base = "短袖/薄長袖（擇一）";
    plan.mid = "薄外套（備用）";
    plan.summary = "一套到底：短袖/薄長袖 +（備）薄外套";
    plan.tips.push("資料不足：帶件薄外套最不會出錯");
    return plan;
  }

  plan.base = wearFromFeelsC(maxFeels);

  if (swing > 4 || minFeels <= 22) {
    if (minFeels <= 14) plan.mid = "可脫的保暖中層（薄毛衣/抓絨）";
    else if (minFeels <= 18) plan.mid = "可脫的薄外套/針織";
    else if (minFeels <= 22) plan.mid = "可脫的薄長袖";
    else plan.mid = "可帶一件薄罩衫（備用）";
  }

  if (rainAny) plan.shell = "輕薄防水外層（可收納）";
  else if (Number.isFinite(windMax) && windMax >= WIND_STRONG_MS) plan.shell = "防風薄外套（可收納）";

  plan.summary =
    `一套到底：${plan.base}` +
    (plan.mid ? ` +（可脫）${plan.mid}` : "") +
    (plan.shell ? ` +（備）${plan.shell}` : "");

  if (rainAny) plan.tips.push(`有雨機率 ≥ ${popTh}%：帶雨具/防水外層最省事`);
  if (Number.isFinite(windMax) && windMax >= WIND_STRONG_MS) plan.tips.push("風偏大：外層選防風更舒服");
  plan.tips.push("原則：中午不悶熱、早晚靠可脫層調節");
  return plan;
}

// ================= Utils =================
function todayInTZ(tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extraHeaders },
  });
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "Content-Type,Accept",
  };
}
