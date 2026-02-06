const apiBase = "/api/outfit";
const KEY = "outfit:lastCoords";
const RECENT_KEY = "outfit:recentPlaces";
const DEFAULT_TZ = "Asia/Taipei";
const THEME_KEY = "outfit:theme";

const PLACES = [
  { name: "台北市", lat: 25.032969, lon: 121.565418 },
  { name: "新北市", lat: 25.016983, lon: 121.462787 },
  { name: "桃園市", lat: 24.993681, lon: 121.300000 },
  { name: "台中市", lat: 24.147736, lon: 120.673648 },
  { name: "台南市", lat: 22.999728, lon: 120.227027 },
  { name: "高雄市", lat: 22.627278, lon: 120.301435 },
  { name: "基隆市", lat: 25.131723, lon: 121.744652 },
  { name: "新竹市", lat: 24.813829, lon: 120.967479 },
  { name: "新竹縣", lat: 24.838722, lon: 121.017724 },
  { name: "苗栗縣", lat: 24.560159, lon: 120.821426 },
  { name: "彰化縣", lat: 24.075305, lon: 120.544822 },
  { name: "南投縣", lat: 23.960998, lon: 120.971863 },
  { name: "雲林縣", lat: 23.709203, lon: 120.431337 },
  { name: "嘉義市", lat: 23.480075, lon: 120.449111 },
  { name: "嘉義縣", lat: 23.451842, lon: 120.255461 },
  { name: "屏東縣", lat: 22.551976, lon: 120.548759 },
  { name: "宜蘭縣", lat: 24.702107, lon: 121.737750 },
  { name: "花蓮縣", lat: 23.987158, lon: 121.601571 },
  { name: "台東縣", lat: 22.758587, lon: 121.144605 },
  { name: "澎湖縣", lat: 23.571122, lon: 119.579735 },
  { name: "金門縣", lat: 24.436331, lon: 118.317089 },
  { name: "連江縣", lat: 26.160469, lon: 119.949875 }
];

function qs(id){ return document.getElementById(id); }
function setText(id, txt){ qs(id).textContent = txt; }
function saveCoords(lat, lon, name){
  localStorage.setItem(KEY, JSON.stringify({ lat, lon, name: name || "", t: Date.now() }));
}
function loadCoords(){
  try{ return JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ return null; }
}

function loadRecent(){
  try{ return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }catch(e){ return []; }
}
function saveRecent(list){
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}
function addRecent(place){
  if(!place || !place.name) return;
  const list = loadRecent();
  const filtered = list.filter(p => p.name !== place.name);
  filtered.unshift({ name: place.name, lat: place.lat, lon: place.lon });
  saveRecent(filtered.slice(0, 10));
}
function removeRecent(name){
  const list = loadRecent().filter(p => p.name !== name);
  saveRecent(list);
  renderRecent();
}

function findPlace(input){
  const q = String(input || "").trim();
  if(!q) return null;
  const exact = PLACES.find(p => p.name === q);
  if(exact) return exact;
  const loose = PLACES.find(p => p.name.includes(q));
  return loose || null;
}

function renderTimeline(periods){
  const el = qs("timeline");
  el.innerHTML = (periods || []).map(p => {
    const feels = (p.feels_like_c != null) ? `${p.feels_like_c}°C` : "—";
    const rain = (p.rain === true) ? "有雨" : (p.rain === false ? "降雨低" : "雨?" );
    return `<div class="time-card"><div class="time-label">${p.label || p.time}</div><div>${p.wear}</div><div class="time-note">體感 ${feels} · ${rain}</div></div>`;
  }).join("");
}

function renderTips(overall){
  const list = qs("tips");
  const tips = (overall && Array.isArray(overall.tips)) ? overall.tips : [];
  list.innerHTML = tips.length ? tips.map(t => `<li>${t}</li>`).join("") : "<li>沒有額外提醒</li>";
}

function renderAlert(periods){
  const alert = qs("alert");
  const rainAny = (periods || []).some(p => p.rain === true);
  if(rainAny){
    alert.textContent = "今天有明顯降雨機率，建議帶雨具或防水外層。";
    alert.style.display = "block";
  } else {
    alert.textContent = "";
    alert.style.display = "none";
  }
}

function render(data){
  if(!data || !data.ok){
    setText("summary", "查詢失敗");
    setText("meta", data && data.error ? data.error : "");
    qs("periods").innerHTML = "";
    qs("timeline").innerHTML = "";
    renderTips(null);
    renderAlert([]);
    return;
  }
  setText("summary", data.overall?.summary || "（無 overall）");
  setText("meta", `${data.place?.ctyName||""}${data.place?.townName||""} ${data.date} ${data.timezone}`);
  const p = data.periods || [];
  qs("periods").innerHTML = p.map(x => {
    const rain = (x.rain === true) ? "會下雨" : (x.rain === false ? "不太會下雨" : "雨未知");
    const extras = (x.extras && x.extras.length) ? ("｜" + x.extras.join("、")) : "";
    const feels = (x.feels_like_c != null) ? `（體感 ${x.feels_like_c}°C）` : "";
    return `<div style="margin-top:8px"><b>${x.label || x.time}</b>：${x.wear} ${feels}｜${rain}${extras}</div>`;
  }).join("");

  renderTimeline(p);
  renderTips(data.overall);
  renderAlert(p);
}

function dateByOffset(days){
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

async function callApi(lat, lon, dayOffset){
  const date = dateByOffset(dayOffset || 0);
  const url = `${apiBase}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&date=${encodeURIComponent(date)}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  const data = await res.json();
  render(data);
  return data;
}

let currentPlace = null;
let currentDay = 0;

function applyPlace(place){
  if(!place) return;
  currentPlace = place;
  saveCoords(place.lat, place.lon, place.name);
  addRecent(place);
  renderRecent();
  callApi(place.lat, place.lon, currentDay).catch(e => render({ ok:false, error:String(e) }));
}

renderRecent();

function renderRecent(){
  const el = qs("recentPlaces");
  const list = loadRecent();
  if(!list.length){
    el.innerHTML = "<span class=\"label\">尚無紀錄</span>";
    return;
  }
  el.innerHTML = list.map(p => (
    `<span class=\"chip-btn\" data-name=\"${p.name}\">${p.name}` +
    `<button class=\"chip-del\" type=\"button\" aria-label=\"刪除\" data-del=\"${p.name}\">×</button></span>`
  )).join("");
}

function normalize(s){
  return String(s || "").replace(/\s+/g, "").toLowerCase();
}
function matchPlaces(query){
  const q = normalize(query);
  if(!q) return [];
  const ranked = PLACES.map(p => {
    const name = normalize(p.name);
    const starts = name.startsWith(q);
    const includes = name.includes(q);
    const score = starts ? 2 : (includes ? 1 : 0);
    return { p, score };
  }).filter(x => x.score > 0);
  ranked.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
  return ranked.map(x => x.p).slice(0, 8);
}

function renderSuggestions(list){
  const box = qs("suggestions");
  if(!list.length){
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }
  box.innerHTML = list.map(p => `<button type=\"button\" data-place=\"${p.name}\">${p.name}</button>`).join("");
  box.style.display = "block";
}

qs("placeSearch").addEventListener("input", (e) => {
  const list = matchPlaces(e.target.value);
  renderSuggestions(list);
});
qs("placeSearch").addEventListener("focus", (e) => {
  const list = matchPlaces(e.target.value);
  renderSuggestions(list);
});
document.addEventListener("click", (e) => {
  if(!e.target.closest("#placeSearch") && !e.target.closest("#suggestions")){
    qs("suggestions").style.display = "none";
  }
});

qs("suggestions").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-place]");
  if(!btn) return;
  const name = btn.getAttribute("data-place");
  const place = findPlace(name);
  if(place){
    qs("placeSearch").value = place.name;
    qs("suggestions").style.display = "none";
    applyPlace(place);
  }
});

qs("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = qs("placeSearch").value.trim();
  const place = findPlace(q) || matchPlaces(q)[0];
  if(!place) return alert("找不到該縣市，請改用其他關鍵字。");
  qs("placeSearch").value = place.name;
  applyPlace(place);
});

qs("btnGeo").onclick = () => {
  if(!navigator.geolocation) return alert("此瀏覽器不支援定位");
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lon = Number(pos.coords.longitude.toFixed(6));
      const place = { name: "目前位置", lat, lon };
      saveCoords(lat, lon, place.name);
      addRecent(place);
      renderRecent();
      currentPlace = place;
      callApi(lat, lon, currentDay).catch(e => render({ ok:false, error:String(e) }));
    },
    err => alert("定位失敗：" + err.message),
    { enableHighAccuracy:false, timeout:10000, maximumAge:60000 }
  );
};

qs("quickPlaces").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-place]");
  if(!btn) return;
  const name = btn.getAttribute("data-place");
  const place = findPlace(name);
  if(place) applyPlace(place);
});

qs("recentPlaces").addEventListener("click", (e) => {
  const del = e.target.closest("button[data-del]");
  if(del){
    removeRecent(del.getAttribute("data-del"));
    return;
  }
  const chip = e.target.closest("span[data-name]");
  if(chip){
    const name = chip.getAttribute("data-name");
    const place = findPlace(name) || loadRecent().find(p => p.name === name);
    if(place) applyPlace(place);
  }
});

function renderQuickPlaces(){
  const list = ["台北市", "新北市", "桃園市", "台中市", "台南市", "高雄市", "新竹市", "嘉義市"];
  qs("quickPlaces").innerHTML = list.map(name =>
    `<button class=\"chip-btn\" type=\"button\" data-place=\"${name}\">${name}</button>`
  ).join("");
}
renderQuickPlaces();

function applyTheme(theme){
  const root = document.documentElement;
  if(theme === "dark" || theme === "light"){
    root.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  } else {
    root.removeAttribute("data-theme");
    localStorage.removeItem(THEME_KEY);
  }
}
function toggleTheme(){
  const current = localStorage.getItem(THEME_KEY);
  if(current === "dark") applyTheme("light");
  else applyTheme("dark");
}
const savedTheme = localStorage.getItem(THEME_KEY);
if(savedTheme) applyTheme(savedTheme);
const themeBtn = qs("themeToggle");
if(themeBtn) themeBtn.addEventListener("click", toggleTheme);

// 進來先用：URL座標 > localStorage座標
const params = new URLSearchParams(location.search);
const pLat = params.get("lat"), pLon = params.get("lon");
if(pLat && pLon){
  const place = { name: "", lat: Number(pLat), lon: Number(pLon) };
  currentPlace = place;
  saveCoords(place.lat, place.lon, place.name);
  callApi(place.lat, place.lon, currentDay).catch(e => render({ ok:false, error:String(e) }));
} else {
  const last = loadCoords();
  if(last && last.lat && last.lon){
    currentPlace = { name: last.name || "", lat: last.lat, lon: last.lon };
    callApi(last.lat, last.lon, currentDay).catch(e => render({ ok:false, error:String(e) }));
    if(last.name) qs("placeSearch").value = last.name;
  }
}

qs("dayTabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-day]");
  if(!btn) return;
  const day = Number(btn.getAttribute("data-day"));
  if(!Number.isFinite(day)) return;
  currentDay = day;
  qs("dayTabs").querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  if(currentPlace) callApi(currentPlace.lat, currentPlace.lon, currentDay).catch(e => render({ ok:false, error:String(e) }));
});

// Register SW (best effort)
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
}
