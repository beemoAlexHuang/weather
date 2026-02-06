const apiBase = "/api/outfit";
const KEY = "outfit:lastCoords";

function qs(id){ return document.getElementById(id); }
function setText(id, txt){ qs(id).textContent = txt; }
function saveCoords(lat, lon){
  localStorage.setItem(KEY, JSON.stringify({ lat, lon, t: Date.now() }));
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
  setText("meta", `${data.place?.ctyName||""}${data.place?.townName||""} ${data.date} ${data.timezone}`);
  const p = data.periods || [];
  qs("periods").innerHTML = p.map(x => {
    const rain = (x.rain === true) ? "會下雨" : (x.rain === false ? "不太會下雨" : "雨未知");
    const extras = (x.extras && x.extras.length) ? ("｜" + x.extras.join("、")) : "";
    const feels = (x.feels_like_c != null) ? `（體感 ${x.feels_like_c}°C）` : "";
    return `<div style="margin-top:8px"><b>${x.label || x.time}</b>：${x.wear} ${feels}｜${rain}${extras}</div>`;
  }).join("");

  // 同步 mini 連結（帶座標）
  const lat = data.location?.lat, lon = data.location?.lon;
  if(Number.isFinite(lat) && Number.isFinite(lon)){
    history.replaceState(null, "", `/?lat=${lat}&lon=${lon}&debug=${qs("debug").checked?1:0}`);
  }
}

async function callApi(lat, lon){
  const debug = qs("debug").checked ? "1" : "0";
  const url = `${apiBase}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&debug=${debug}`;
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
  callApi(lat, lon).catch(e => render({ ok:false, error:String(e) }));
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
      callApi(lat, lon).catch(e => render({ ok:false, error:String(e) }));
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
