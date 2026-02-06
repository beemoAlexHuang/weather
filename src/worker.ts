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

type FetcherLike = { fetch: (request: Request) => Promise<Response> };
interface Env {
  CWA_ENDPOINT?: string;
  CWA_GQL_QUERY?: string;
  CWA_AUTH?: string;
  TIMES?: string;
  TZ?: string;
  POP_RAIN_THRESHOLD?: string | number;
  ASSETS?: FetcherLike;
}

// ================= ROUTER =================
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // API
    if (url.pathname === "/api/outfit") return handleApi(request, env, ctx);

    // Apple touch icon (kept in Worker to avoid binary assets in repo)
    if (url.pathname === "/apple-touch-icon.png") return appleTouchIconResponse();

    // Static assets (frontend)
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      if (url.pathname === "/" || url.pathname === "/ui") {
        const indexUrl = new URL(request.url);
        indexUrl.pathname = "/index.html";
        return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
      }
      if (url.pathname === "/mini") {
        const miniUrl = new URL(request.url);
        miniUrl.pathname = "/mini.html";
        return env.ASSETS.fetch(new Request(miniUrl.toString(), request));
      }
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) return assetResponse;
    }

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
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  },
};

// ================= Frontend assets =================
// HTML/CSS/JS/manifest/sw/icon.svg are served from /public via Workers Assets.

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
async function handleApi(request: Request, env: Env, ctx: ExecutionContext) {
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
  const morningBias = Number(url.searchParams.get("morningBias") ?? url.searchParams.get("mb"));
  const eveningBias = Number(url.searchParams.get("eveningBias") ?? url.searchParams.get("eb"));
  const bias = {
    morning: Number.isFinite(morningBias) ? morningBias : MORNING_BIAS_C,
    evening: Number.isFinite(eveningBias) ? eveningBias : EVENING_BIAS_C,
  };

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

  let town = payload?.data?.town as any;
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

    const advice = outfitAdvice({ tempC, windMs, popPct, wxDesc, comfortDesc, popTh, hhmm: hh, bias });

    const item: any = {
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
function labelOfTime(hhmm: string) {
  const s = String(hhmm || "").trim();
  const h = parseInt(s.split(":")[0], 10);
  if (!Number.isFinite(h)) return "";
  if (h < 10) return "早";
  if (h < 15) return "中";
  return "晚";
}

function timeBiasC(hhmm: string, bias?: { morning: number; evening: number }) {
  const s = String(hhmm || "").trim();
  const h = parseInt(s.split(":")[0], 10);
  if (!Number.isFinite(h)) return 0;
  if (h <= 8) return -(bias?.morning ?? MORNING_BIAS_C);
  if (h >= 17) return -(bias?.evening ?? EVENING_BIAS_C);
  return 0;
}

function wearFromFeelsC(f: number) {
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

function parseCwaTimeToMs(s: string) {
  if (!s) return NaN;
  let t = String(s).trim();
  if (t.includes(" ") && !t.includes("T")) t = t.replace(" ", "T");
  const hasTz = /Z$|[+-]\d{2}:\d{2}$/.test(t);
  if (!hasTz) t = t + TZ_OFFSET;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : NaN;
}

function parseSkyFromDesc(desc: string | null | undefined) {
  const s = String(desc || "");
  const sunny = s.includes("晴");
  const cloudy = s.includes("陰") || s.includes("多雲");
  const rainy = s.includes("雨") || s.includes("雷") || s.includes("陣雨");
  return { sunny, cloudy, rainy };
}

function comfortAdjust(desc: string | null | undefined) {
  const d = String(desc || "");
  if (d.includes("非常悶熱")) return +2.5;
  if (d.includes("悶熱")) return +HUMID_FEEL_BONUS;
  if (d.includes("舒適")) return 0;
  if (d.includes("稍涼") || d.includes("偏涼")) return -0.5;
  if (d.includes("寒冷") || d.includes("冷")) return -1.5;
  return 0;
}

function windChillLikeC(tempC: number, windMs: number) {
  if (!Number.isFinite(tempC)) return NaN;
  if (!Number.isFinite(windMs) || windMs <= 1.5) return tempC;
  if (tempC > 12) return tempC;
  const drop = Math.min(5, (windMs - 1.5) * 0.4);
  return tempC - Math.max(0, drop);
}

function calcFeelsC({ tempC, windMs, comfortDesc, wxDesc, hhmm, bias }: {
  tempC: number;
  windMs: number;
  comfortDesc: string | null | undefined;
  wxDesc: string | null | undefined;
  hhmm: string;
  bias?: { morning: number; evening: number };
}) {
  let feels = tempC;
  feels = windChillLikeC(feels, windMs);
  feels += comfortAdjust(comfortDesc);

  const { sunny, rainy, cloudy } = parseSkyFromDesc(wxDesc);
  if (sunny && Number.isFinite(feels) && feels >= 28) feels += 1.0;
  if (cloudy && Number.isFinite(feels) && feels >= 26) feels -= 0.3;
  if (rainy && Number.isFinite(feels)) feels -= 0.5;

  feels += timeBiasC(hhmm, bias);
  return feels;
}

function outfitAdvice({ tempC, windMs, popPct, wxDesc, comfortDesc, popTh, hhmm, bias }: {
  tempC: number;
  windMs: number;
  popPct: number;
  wxDesc: string | null | undefined;
  comfortDesc: string | null | undefined;
  popTh: number;
  hhmm: string;
  bias?: { morning: number; evening: number };
}) {
  const { sunny, rainy } = parseSkyFromDesc(wxDesc);
  const feels = calcFeelsC({ tempC, windMs, comfortDesc, wxDesc, hhmm, bias });
  const wear = wearFromFeelsC(feels);

  let rain: boolean | null = null;
  if (Number.isFinite(popPct)) rain = popPct >= popTh;
  else if (typeof wxDesc === "string") rain = rainy;

  const extras: string[] = [];
  if (rain === true) extras.push("雨具/防水外層");
  if (sunny && Number.isFinite(feels) && feels >= 26) extras.push("帽子/防曬");
  if (Number.isFinite(windMs) && windMs >= WIND_STRONG_MS && Number.isFinite(feels) && feels <= 22) extras.push("防風外層");
  if (String(wxDesc || "").includes("雷")) extras.push("注意雷雨");

  return { wear, rain, extras, feels_like_c: Number.isFinite(feels) ? Math.round(feels * 10) / 10 : null };
}

// ================= Series helpers =================
function flattenPointSeries_(arr: any[], timeKey: string, valueKey: string) {
  const out: { ms: number; v: number }[] = [];
  const a = Array.isArray(arr) ? arr : [];
  for (const x of a) {
    const ms = parseCwaTimeToMs(x?.[timeKey]);
    const v = Number(x?.[valueKey]);
    if (Number.isFinite(ms) && Number.isFinite(v)) out.push({ ms, v });
  }
  out.sort((p, q) => p.ms - q.ms);
  return out;
}

function flattenComfortSeries_(arr: any[]) {
  const out: { ms: number; d: string }[] = [];
  const a = Array.isArray(arr) ? arr : [];
  for (const x of a) {
    const ms = parseCwaTimeToMs(x?.DataTime);
    const d = x?.ComfortIndexDescription;
    if (Number.isFinite(ms) && typeof d === "string") out.push({ ms, d });
  }
  out.sort((p, q) => p.ms - q.ms);
  return out;
}

function flattenIntervalSeries_(arr: any[], startKey: string, endKey: string, valueKey: string) {
  const out: { s: number; e: number; v: number }[] = [];
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

function flattenIntervalDesc_(arr: any[], startKey: string, endKey: string, descKey: string) {
  const out: { s: number; e: number; d: string }[] = [];
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

function pickAtOrBefore_(points: { ms: number; v: number }[], targetMs: number) {
  if (!points.length || !Number.isFinite(targetMs)) return NaN;
  let best = NaN;
  for (const p of points) {
    if (p.ms <= targetMs) best = p.v;
    else break;
  }
  return Number.isFinite(best) ? best : points[0].v;
}

function pickDescAtOrBefore_(points: { ms: number; d: string }[], targetMs: number) {
  if (!points.length || !Number.isFinite(targetMs)) return null;
  let best: string | null = null;
  for (const p of points) {
    if (p.ms <= targetMs) best = p.d;
    else break;
  }
  return best ?? points[0].d ?? null;
}

// intervals: cover -> fallback nearest by end-time
function pickIntervalValue_(intervals: { s: number; e: number; v: number }[], targetMs: number) {
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

function pickIntervalDesc_(intervals: { s: number; e: number; d: string }[], targetMs: number) {
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

function overallOutfit({ periods, popTh }: { periods: any[]; popTh: number }) {
  const feels = periods.map(p => Number(p.feels_like_c)).filter(Number.isFinite);
  const minFeels = feels.length ? Math.min(...feels) : NaN;
  const maxFeels = feels.length ? Math.max(...feels) : NaN;
  const swing = (Number.isFinite(minFeels) && Number.isFinite(maxFeels)) ? (maxFeels - minFeels) : NaN;

  const rainAny = periods.some(p => p.rain === true);
  const winds = periods.map(p => Number(p._debug?.windMs)).filter(Number.isFinite);
  const windMax = winds.length ? Math.max(...winds) : NaN;

  const plan = {
    base: null as string | null,
    mid: null as string | null,
    shell: null as string | null,
    summary: null as string | null,
    tips: [] as string[],
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
  if (swing > 4 || minFeels <= 22) {
    plan.tips.push("溫差明顯或早晚偏冷：可脫層更好調節");
  }
  return plan;
}

// ================= Utils =================
function todayInTZ(tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
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
