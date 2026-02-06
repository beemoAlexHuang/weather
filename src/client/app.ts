const apiBase = "/api/outfit";
const KEY = "outfit:lastCoords";
const RECENT_KEY = "outfit:recentPlaces";
const DEFAULT_TZ = "Asia/Taipei";
const THEME_KEY = "outfit:theme";
const MORNING_KEY = "outfit:morningBias";
const EVENING_KEY = "outfit:eveningBias";

type Place = {
  name: string;
  lat: number;
  lon: number;
  type?: string;
  county?: string;
  town?: string;
};

type Period = {
  label?: string;
  time?: string;
  wear: string;
  rain: boolean | null;
  extras?: string[];
  feels_like_c?: number | null;
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  date: string;
  timezone?: string;
  location?: { lat: number; lon: number };
  place?: { ctyName?: string; townName?: string };
  periods?: Period[];
  overall?: { summary?: string; tips?: string[] };
};

const PLACES: Place[] = [
  { name: "台北市", lat: 25.032969, lon: 121.565418, type: "county" },
  { name: "新北市", lat: 25.016983, lon: 121.462787, type: "county" },
  { name: "桃園市", lat: 24.993681, lon: 121.3, type: "county" },
  { name: "台中市", lat: 24.147736, lon: 120.673648, type: "county" },
  { name: "台南市", lat: 22.999728, lon: 120.227027, type: "county" },
  { name: "高雄市", lat: 22.627278, lon: 120.301435, type: "county" },
  { name: "基隆市", lat: 25.131723, lon: 121.744652, type: "county" },
  { name: "新竹市", lat: 24.813829, lon: 120.967479, type: "county" },
  { name: "新竹縣", lat: 24.838722, lon: 121.017724, type: "county" },
  { name: "苗栗縣", lat: 24.560159, lon: 120.821426, type: "county" },
  { name: "彰化縣", lat: 24.075305, lon: 120.544822, type: "county" },
  { name: "南投縣", lat: 23.960998, lon: 120.971863, type: "county" },
  { name: "雲林縣", lat: 23.709203, lon: 120.431337, type: "county" },
  { name: "嘉義市", lat: 23.480075, lon: 120.449111, type: "county" },
  { name: "嘉義縣", lat: 23.451842, lon: 120.255461, type: "county" },
  { name: "屏東縣", lat: 22.551976, lon: 120.548759, type: "county" },
  { name: "宜蘭縣", lat: 24.702107, lon: 121.73775, type: "county" },
  { name: "花蓮縣", lat: 23.987158, lon: 121.601571, type: "county" },
  { name: "台東縣", lat: 22.758587, lon: 121.144605, type: "county" },
  { name: "澎湖縣", lat: 23.571122, lon: 119.579735, type: "county" },
  { name: "金門縣", lat: 24.436331, lon: 118.317089, type: "county" },
  { name: "連江縣", lat: 26.160469, lon: 119.949875, type: "county" }
];
let SEARCH_PLACES: Place[] = [...PLACES];

function qs<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element: ${id}`);
  return el as T;
}
function setText(id: string, txt: string) {
  qs<HTMLElement>(id).textContent = txt;
}
function saveCoords(lat: number, lon: number, name: string) {
  localStorage.setItem(KEY, JSON.stringify({ lat, lon, name: name || "", t: Date.now() }));
}
function loadCoords(): { lat: number; lon: number; name?: string } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

function loadRecent(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveRecent(list: Place[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}
function addRecent(place: Place) {
  if (!place || !place.name) return;
  const list = loadRecent();
  const filtered = list.filter(p => p.name !== place.name);
  filtered.unshift({ name: place.name, lat: place.lat, lon: place.lon });
  saveRecent(filtered.slice(0, 10));
}
function removeRecent(name: string) {
  const list = loadRecent().filter(p => p.name !== name);
  saveRecent(list);
  renderRecent();
}

function normalize(s: string) {
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}

function findPlace(input: string): Place | null {
  const q = String(input || "").trim();
  if (!q) return null;
  const norm = normalize(q);
  const exact = SEARCH_PLACES.find(p => normalize(p.name) === norm);
  if (exact) return exact;
  const townExact = SEARCH_PLACES.find(p => p.town && normalize(p.town) === norm);
  if (townExact) return townExact;
  const loose = SEARCH_PLACES.find(p => normalize(p.name).includes(norm));
  return loose || null;
}

function renderTimeline(periods: Period[]) {
  const el = qs<HTMLDivElement>("timeline");
  el.innerHTML = (periods || []).map(p => {
    const feels = (p.feels_like_c != null) ? `${p.feels_like_c}°C` : "—";
    const rain = (p.rain === true) ? "有雨" : (p.rain === false ? "降雨低" : "雨?" );
    return `<div class="time-card"><div class="time-label">${p.label || p.time || ""}</div><div>${wearIcon(p.wear)} ${p.wear}</div><div class="time-note">${weatherIcon(p)} 體感 ${feels} · ${rain}</div></div>`;
  }).join("");
}

function renderTips(overall?: ApiResponse["overall"]) {
  const list = qs<HTMLUListElement>("tips");
  const tips = (overall && Array.isArray(overall.tips)) ? overall.tips : [];
  list.innerHTML = tips.length ? tips.map(t => `<li>${t}</li>`).join("") : "<li>沒有額外提醒</li>";
}

function renderAlert(periods: Period[]) {
  const alert = qs<HTMLDivElement>("alert");
  const rainAny = (periods || []).some(p => p.rain === true);
  if (rainAny) {
    alert.textContent = "今天有明顯降雨機率，建議帶雨具或防水外層。";
    alert.style.display = "block";
  } else {
    alert.textContent = "";
    alert.style.display = "none";
  }
}

function formatDateWithWeekday(dateStr: string, tz?: string) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T00:00:00+08:00`);
  const weekday = new Intl.DateTimeFormat("zh-Hant", { weekday: "short", timeZone: tz || DEFAULT_TZ }).format(date);
  return `${dateStr} ${weekday}`;
}

function render(data: ApiResponse) {
  if (!data || !data.ok) {
    setText("summary", "查詢失敗");
    setText("meta", data && data.error ? data.error : "");
    qs<HTMLDivElement>("periods").innerHTML = "";
    qs<HTMLDivElement>("timeline").innerHTML = "";
    renderTips(undefined);
    renderAlert([]);
    return;
  }
  setText("summary", data.overall?.summary || "（無 overall）");
  const dateLabel = formatDateWithWeekday(data.date, data.timezone || DEFAULT_TZ);
  setText("meta", `${data.place?.ctyName || ""}${data.place?.townName || ""} ${dateLabel} ${data.timezone || DEFAULT_TZ}`);
  const p = data.periods || [];
  qs<HTMLDivElement>("periods").innerHTML = p.map(x => {
    const rain = (x.rain === true) ? "會下雨" : (x.rain === false ? "不太會下雨" : "雨未知");
    const extras = (x.extras && x.extras.length) ? ("｜" + x.extras.join("、")) : "";
    const feels = (x.feels_like_c != null) ? `（體感 ${x.feels_like_c}°C）` : "";
    return `<div style="margin-top:8px"><b>${x.label || x.time || ""}</b>：${wearIcon(x.wear)} ${x.wear} ${feels}｜${weatherIcon(x)} ${rain}${extras}</div>`;
  }).join("");

  renderTimeline(p);
  renderTips(data.overall);
  renderAlert(p);

  if (currentPlace && currentPlace.name === "目前位置") {
    const name = `${data.place?.ctyName || ""}${data.place?.townName || ""}`.trim();
    if (name && data.location) {
      currentPlace = { name, lat: data.location.lat, lon: data.location.lon };
      saveCoords(currentPlace.lat, currentPlace.lon, currentPlace.name);
      removeRecent("目前位置");
      addRecent(currentPlace);
      renderRecent();
      qs<HTMLInputElement>("placeSearch").value = currentPlace.name;
    }
  }
}

function dateByOffset(days: number) {
  const base = new Date();
  const target = new Date(base.getTime() + days * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(target);
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function currentBias() {
  const m = Number(localStorage.getItem(MORNING_KEY));
  const e = Number(localStorage.getItem(EVENING_KEY));
  return {
    morning: Number.isFinite(m) ? m : 0,
    evening: Number.isFinite(e) ? e : 0
  };
}

async function callApi(lat: number, lon: number, dayOffset: number) {
  const date = dateByOffset(dayOffset || 0);
  const bias = currentBias();
  const url = `${apiBase}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&date=${encodeURIComponent(date)}` +
    `&morningBias=${encodeURIComponent(bias.morning)}&eveningBias=${encodeURIComponent(bias.evening)}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  const data = await res.json() as ApiResponse;
  render(data);
  return data;
}

let currentPlace: Place | null = null;
let currentDay = 0;

function applyPlace(place: Place) {
  if (!place) return;
  currentPlace = place;
  saveCoords(place.lat, place.lon, place.name);
  addRecent(place);
  renderRecent();
  callApi(place.lat, place.lon, currentDay).catch(e => render({ ok: false, error: String(e), date: "", periods: [] }));
}

function renderRecent() {
  const el = qs<HTMLDivElement>("recentPlaces");
  const list = loadRecent();
  if (!list.length) {
    el.innerHTML = "<span class=\"label\">尚無紀錄</span>";
    return;
  }
  el.innerHTML = list.map(p => (
    `<span class=\"chip-btn\" data-name=\"${p.name}\">${p.name}` +
    `<button class=\"chip-del\" type=\"button\" aria-label=\"刪除\" data-del=\"${p.name}\">×</button></span>`
  )).join("");
}

function matchPlaces(query: string) {
  const q = normalize(query);
  if (!q) return [] as Place[];
  const ranked = SEARCH_PLACES.map(p => {
    const name = normalize(p.name);
    const town = p.town ? normalize(p.town) : "";
    const county = p.county ? normalize(p.county) : "";
    const score =
      (name.startsWith(q) ? 3 : 0) +
      (name.includes(q) ? 2 : 0) +
      (town && town.startsWith(q) ? 2 : 0) +
      (town && town.includes(q) ? 1 : 0) +
      (county && county.startsWith(q) ? 1 : 0);
    return { p, score };
  }).filter(x => x.score > 0);
  ranked.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return ranked.map(x => x.p).slice(0, 8);
}

function displayLabel(p: Place) {
  if (p.town && p.county) return `${p.county}${p.town}`;
  return p.name;
}

function renderSuggestions(list: Place[]) {
  const box = qs<HTMLDivElement>("suggestions");
  if (!list.length) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  box.innerHTML = list.map(p => {
    const label = displayLabel(p);
    const meta = (p.town && p.county) ? `<span class=\"suggest-meta\">${p.county}</span>` : "";
    return `<button type=\"button\" data-place=\"${label}\">${label}${meta}</button>`;
  }).join("");
  box.style.display = "block";
}

qs<HTMLInputElement>("placeSearch").addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement;
  const list = matchPlaces(target.value);
  renderSuggestions(list);
});
qs<HTMLInputElement>("placeSearch").addEventListener("focus", (e) => {
  const target = e.target as HTMLInputElement;
  const list = matchPlaces(target.value);
  renderSuggestions(list);
});
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest("#placeSearch") && !target.closest("#suggestions")) {
    qs<HTMLDivElement>("suggestions").style.display = "none";
  }
});

qs<HTMLDivElement>("suggestions").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest("button[data-place]") as HTMLButtonElement | null;
  if (!btn) return;
  const name = btn.getAttribute("data-place") || "";
  const place = findPlace(name) || SEARCH_PLACES.find(p => displayLabel(p) === name);
  if (place) {
    qs<HTMLInputElement>("placeSearch").value = displayLabel(place);
    qs<HTMLDivElement>("suggestions").style.display = "none";
    applyPlace(place);
  }
});

qs<HTMLFormElement>("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = qs<HTMLInputElement>("placeSearch").value.trim();
  const place = findPlace(q) || matchPlaces(q)[0];
  if (!place) return alert("找不到該縣市，請改用其他關鍵字。");
  qs<HTMLInputElement>("placeSearch").value = displayLabel(place);
  applyPlace(place);
});

qs<HTMLButtonElement>("btnGeo").onclick = () => {
  if (!navigator.geolocation) return alert("此瀏覽器不支援定位");
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lon = Number(pos.coords.longitude.toFixed(6));
      const place: Place = { name: "目前位置", lat, lon };
      saveCoords(lat, lon, place.name);
      addRecent(place);
      renderRecent();
      currentPlace = place;
      callApi(lat, lon, currentDay).catch(e => render({ ok: false, error: String(e), date: "", periods: [] }));
    },
    err => alert("定位失敗：" + err.message),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
};

qs<HTMLDivElement>("quickPlaces").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest("button[data-place]") as HTMLButtonElement | null;
  if (!btn) return;
  const name = btn.getAttribute("data-place") || "";
  const place = findPlace(name);
  if (place) applyPlace(place);
});

qs<HTMLDivElement>("recentPlaces").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const del = target.closest("button[data-del]") as HTMLButtonElement | null;
  if (del) {
    removeRecent(del.getAttribute("data-del") || "");
    return;
  }
  const chip = target.closest("span[data-name]") as HTMLSpanElement | null;
  if (chip) {
    const name = chip.getAttribute("data-name") || "";
    const place = findPlace(name) || loadRecent().find(p => p.name === name) || null;
    if (place) applyPlace(place);
  }
});

function renderQuickPlaces() {
  const list = ["台北市", "台中市", "高雄市"];
  qs<HTMLDivElement>("quickPlaces").innerHTML = list.map(name =>
    `<button class=\"chip-btn\" type=\"button\" data-place=\"${name}\">${name}</button>`
  ).join("");
}

function applyTheme(theme: string | null) {
  const root = document.documentElement;
  if (theme === "dark" || theme === "light") {
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  } else {
    root.removeAttribute("data-theme");
    localStorage.removeItem(THEME_KEY);
  }
}
function toggleTheme() {
  const current = localStorage.getItem(THEME_KEY);
  if (current === "dark") applyTheme("light");
  else applyTheme("dark");
}

async function loadTownships() {
  try {
    const res = await fetch("/data/townships.json", { cache: "force-cache" });
    if (!res.ok) return;
    const data = await res.json() as Place[];
    if (Array.isArray(data) && data.length) {
      SEARCH_PLACES = [...PLACES, ...data.map(x => ({
        name: x.name,
        county: x.county,
        town: x.town,
        lat: x.lat,
        lon: x.lon,
        type: x.type
      }))];
    }
  } catch {
    // no-op
  }
}

const settingsPanel = qs<HTMLDivElement>("settingsPanel");
const settingsToggle = qs<HTMLButtonElement>("settingsToggle");
const closeSettings = qs<HTMLButtonElement>("closeSettings");
const resetBias = qs<HTMLButtonElement>("resetBias");
const morningInput = qs<HTMLInputElement>("morningBias");
const eveningInput = qs<HTMLInputElement>("eveningBias");
const morningValue = qs<HTMLSpanElement>("morningBiasValue");
const eveningValue = qs<HTMLSpanElement>("eveningBiasValue");

function openSettings() {
  settingsPanel.classList.add("active");
  settingsPanel.setAttribute("aria-hidden", "false");
}
function closeSettingsPanel() {
  settingsPanel.classList.remove("active");
  settingsPanel.setAttribute("aria-hidden", "true");
}
function syncBiasUI() {
  const bias = currentBias();
  morningInput.value = String(bias.morning);
  eveningInput.value = String(bias.evening);
  morningValue.textContent = bias.morning.toFixed(1);
  eveningValue.textContent = bias.evening.toFixed(1);
}
function updateBias() {
  const m = Number(morningInput.value);
  const e = Number(eveningInput.value);
  localStorage.setItem(MORNING_KEY, String(m));
  localStorage.setItem(EVENING_KEY, String(e));
  morningValue.textContent = m.toFixed(1);
  eveningValue.textContent = e.toFixed(1);
  if (currentPlace) callApi(currentPlace.lat, currentPlace.lon, currentDay).catch(e => render({ ok: false, error: String(e), date: "", periods: [] }));
}

function weatherIcon(p: Period) {
  if (p.rain === true) return iconRain();
  if (p.rain === false) return iconSun();
  return iconCloud();
}

function wearIcon(wear: string) {
  const s = String(wear || "");
  if (s.includes("羽絨") || s.includes("厚外套")) return iconCoat();
  if (s.includes("薄外套") || s.includes("外套")) return iconJacket();
  if (s.includes("毛衣") || s.includes("保暖")) return iconSweater();
  if (s.includes("長袖")) return iconLongSleeve();
  if (s.includes("短袖") || s.includes("背心")) return iconTshirt();
  return iconLayer();
}

function iconSun() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 3v2M12 19v2M3 12h2M19 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4\"/></svg>";
}
function iconCloud() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 18h9a4 4 0 0 0 0-8 5 5 0 0 0-9-1A4 4 0 0 0 7 18z\"/></svg>";
}
function iconRain() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 14h9a4 4 0 0 0 0-8 5 5 0 0 0-9-1A4 4 0 0 0 7 14z\"/><path d=\"M9 17l-1 2M12 17l-1 2M15 17l-1 2\"/></svg>";
}
function iconTshirt() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 5l2-2h4l2 2 3 2-2 3-2-1v9H9v-9l-2 1-2-3 3-2z\"/></svg>";
}
function iconLongSleeve() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 5l2-2h6l2 2 3 2-2 4-2-1v9H8v-9l-2 1-2-4 3-2z\"/></svg>";
}
function iconSweater() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 5l2-2h4l2 2 3 2-1.5 3.5-2-1v9H8v-9l-2 1L4.5 7 8 5z\"/></svg>";
}
function iconJacket() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 4l2-2h4l2 2 3 2-2 3-2-1v11H9V8L7 9 5 6l3-2z\"/></svg>";
}
function iconCoat() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M8 3l2-1h4l2 1 2 3-2 2-1-1v14H9V7L8 8 6 6l2-3z\"/></svg>";
}
function iconLayer() {
  return "<svg class=\"ico\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 4l8 5-8 5-8-5 8-5zm0 7l8 5-8 5-8-5 8-5z\"/></svg>";
}

function enablePullToRefresh() {
  let startY = 0;
  let pulling = false;
  const threshold = 70;

  window.addEventListener("touchstart", (e) => {
    if (window.scrollY !== 0) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (!pulling) return;
    const currentY = e.touches[0].clientY;
    if (currentY - startY > threshold) {
      pulling = false;
      location.reload();
    }
  }, { passive: true });

  window.addEventListener("touchend", () => {
    pulling = false;
  }, { passive: true });
}

renderQuickPlaces();
renderRecent();
loadTownships();

const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) applyTheme(savedTheme);
const themeBtn = qs<HTMLButtonElement>("themeToggle");
themeBtn.addEventListener("click", toggleTheme);

settingsToggle.addEventListener("click", openSettings);
closeSettings.addEventListener("click", closeSettingsPanel);
settingsPanel.addEventListener("click", (e) => {
  if (e.target === settingsPanel) closeSettingsPanel();
});
morningInput.addEventListener("input", updateBias);
eveningInput.addEventListener("input", updateBias);
resetBias.addEventListener("click", () => {
  localStorage.removeItem(MORNING_KEY);
  localStorage.removeItem(EVENING_KEY);
  syncBiasUI();
  if (currentPlace) callApi(currentPlace.lat, currentPlace.lon, currentDay).catch(e => render({ ok: false, error: String(e), date: "", periods: [] }));
});
syncBiasUI();

const params = new URLSearchParams(location.search);
const pLat = params.get("lat");
const pLon = params.get("lon");
if (pLat && pLon) {
  const place: Place = { name: "", lat: Number(pLat), lon: Number(pLon) };
  currentPlace = place;
  saveCoords(place.lat, place.lon, place.name);
  callApi(place.lat, place.lon, currentDay).catch(e => render({ ok: false, error: String(e), date: "", periods: [] }));
} else {
  const last = loadCoords();
  if (last && last.lat && last.lon) {
    currentPlace = { name: last.name || "", lat: last.lat, lon: last.lon };
    callApi(last.lat, last.lon, currentDay).catch(e => render({ ok: false, error: String(e), date: "", periods: [] }));
    if (last.name) qs<HTMLInputElement>("placeSearch").value = last.name;
  }
}

qs<HTMLDivElement>("dayTabs").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const btn = target.closest("button[data-day]") as HTMLButtonElement | null;
  if (!btn) return;
  const day = Number(btn.getAttribute("data-day"));
  if (!Number.isFinite(day)) return;
  currentDay = day;
  qs<HTMLDivElement>("dayTabs").querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  if (currentPlace) callApi(currentPlace.lat, currentPlace.lon, currentDay).catch(e => render({ ok: false, error: String(e), date: "", periods: [] }));
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

enablePullToRefresh();
