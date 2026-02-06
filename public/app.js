const apiBase = "/api/outfit";
const KEY = "outfit:lastCoords";

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

function populatePlaces(){
  const list = qs("placeList");
  list.innerHTML = PLACES.map(p => `<option value="${p.name}"></option>`).join("");
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
  setText("raw", JSON.stringify(data, null, 2));
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

async function callApi(lat, lon){
  const debug = qs("debug").checked ? "1" : "0";
  const url = `${apiBase}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&debug=${debug}`;
  const res = await fetch(url, { headers: { "Accept": "application/json" }});
  const data = await res.json();
  render(data);
  return data;
}

function applyPlace(place){
  if(!place) return;
  saveCoords(place.lat, place.lon, place.name);
  callApi(place.lat, place.lon).catch(e => render({ ok:false, error:String(e) }));
}

populatePlaces();

qs("searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = qs("placeSearch").value.trim();
  const place = findPlace(q);
  if(!place) return alert("找不到該縣市，請從清單選擇。");
  applyPlace(place);
});

qs("btnGeo").onclick = () => {
  if(!navigator.geolocation) return alert("此瀏覽器不支援定位");
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = Number(pos.coords.latitude.toFixed(6));
      const lon = Number(pos.coords.longitude.toFixed(6));
      saveCoords(lat, lon, "目前位置");
      callApi(lat, lon).catch(e => render({ ok:false, error:String(e) }));
    },
    err => alert("定位失敗：" + err.message),
    { enableHighAccuracy:false, timeout:10000, maximumAge:60000 }
  );
};

qs("btnTaipei101").onclick = () => {
  applyPlace({ name: "台北101", lat: 25.0330, lon: 121.5654 });
};

// 進來先用：URL座標 > localStorage座標
const params = new URLSearchParams(location.search);
const pLat = params.get("lat"), pLon = params.get("lon");
if(pLat && pLon){
  qs("debug").checked = params.get("debug") === "1";
  saveCoords(Number(pLat), Number(pLon), "");
  callApi(pLat, pLon).catch(e => render({ ok:false, error:String(e) }));
} else {
  const last = loadCoords();
  if(last && last.lat && last.lon){
    callApi(last.lat, last.lon).catch(e => render({ ok:false, error:String(e) }));
    if(last.name) qs("placeSearch").value = last.name;
  }
}

// Register SW (best effort)
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("/sw.js").catch(()=>{});
}
