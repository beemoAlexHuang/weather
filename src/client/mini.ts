const KEY = "outfit:lastCoords";
const apiBase = "/api/outfit";

type ApiResponse = {
  ok: boolean;
  error?: string;
  date: string;
  place?: { ctyName?: string; townName?: string };
  overall?: { summary?: string };
  periods?: { label?: string; time?: string; wear: string; rain: boolean | null }[];
};

function getParams() {
  const q = new URLSearchParams(location.search);
  return { lat: q.get("lat"), lon: q.get("lon") };
}
function loadCoords(): { lat: number; lon: number } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
function set(id: string, t: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = t;
}

async function run() {
  let { lat, lon } = getParams();
  if (!lat || !lon) {
    const last = loadCoords();
    if (last && last.lat && last.lon) { lat = String(last.lat); lon = String(last.lon); }
  }
  if (!lat || !lon) {
    set("s", "請先到主頁設定座標");
    set("m", "→ " + location.origin + "/");
    return;
  }
  const url = `${apiBase}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const res = await fetch(url);
  const data = await res.json() as ApiResponse;
  if (!data.ok) {
    set("s", "查詢失敗");
    set("m", data.error || "");
    return;
  }
  set("s", data.overall?.summary || "（無 summary）");
  set("m", `${data.place?.ctyName || ""}${data.place?.townName || ""}  ${data.date}`);
  const lines = (data.periods || []).map(x => {
    const rain = (x.rain === true) ? "雨" : (x.rain === false ? "" : "雨?");
    return `${x.label || x.time}：${x.wear}${rain ? (" · " + rain) : ""}`;
  });
  set("p", lines.join("｜"));
}

run().catch(e => {
  set("s", "錯誤");
  const m = document.getElementById("m");
  if (m) {
    m.textContent = String(e);
    m.className = "row row-mini err";
  }
});

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

enablePullToRefresh();
