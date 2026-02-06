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
  let { lat, lon } = getParams();
  if(!lat || !lon){
    const last = loadCoords();
    if(last && last.lat && last.lon){ lat = last.lat; lon = last.lon; }
  }
  if(!lat || !lon){
    set("s", "請先到主頁設定座標");
    set("m", "→ " + location.origin + "/");
    return;
  }
  const url = `${apiBase}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url);
  const data = await res.json();
  if(!data.ok){
    set("s", "查詢失敗");
    set("m", data.error || "");
    return;
  }
  set("s", data.overall?.summary || "（無 summary）");
  set("m", `${data.place?.ctyName||""}${data.place?.townName||""}  ${data.date}`);
  const lines = (data.periods||[]).map(x => {
    const rain = (x.rain===true) ? "雨" : (x.rain===false ? "" : "雨?");
    return `${x.label||x.time}：${x.wear}${rain?(" · "+rain):""}`;
  });
  set("p", lines.join("｜"));
}

run().catch(e => {
  document.getElementById("s").textContent = "錯誤";
  const m = document.getElementById("m");
  m.textContent = String(e);
  m.className = "row row-mini err";
});
