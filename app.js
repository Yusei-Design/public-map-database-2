// --- 1. Utilities ---
document.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('touchstart', function (event) {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

document.addEventListener('touchmove', function (event) {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

document.addEventListener('touchend', function (event) {
  if (event.touches.length > 1) event.preventDefault();
});

function normalizeText(v) {
  return (v ?? '').toString().trim();
}

function escapeHTML(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// --- 2. Config ---
const GOOGLE_FORM_URL = "YOUR_GOOGLE_FORM_URL";

// 3D：谷は使わず「全部山」
// -1 -> 1, -0.5 -> 2, 0.5 -> 3, 1 -> 4 の要望に対応：ここでは関係性カテゴリを 1..4 に固定
const HEIGHT_LEVEL = {
  '侵入': 1,
  '転用': 2,
  '黙認・境界': 3,
  'おもてなし': 4,
};

const MOUND = {
  rings: 12,          // 滑らかさ（増やすと重くなる）
  maxRadiusM: 220,    // 山の広がり（メートル）
  heightUnitM: 90,    // 1レベルの高さ（メートル）
  segments: 64,
};

const SRC_MOUNDS = 'social-mounds';
const LYR_MOUNDS = 'social-mounds-fill';

// --- 3. State ---
let spots = [];
let markerStore = []; // { marker, element, spot }
let activeFilterLabel = "すべて";
let is3D = false;
let btn3d = null;

// --- 4. Map init ---
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/bright',
  center: [135.7681, 35.0116],
  zoom: 12,
  pitch: 0,
  bearing: 0,
  antialias: true,
  attributionControl: true,
  dragRotate: false,
  touchPitch: false,
  touchZoomRotate: false,
});

// PCだけナビ（あなたの添付版の挙動を維持）
if (!('ontouchstart' in window)) {
  map.addControl(new maplibregl.NavigationControl(), 'top-left');
}

// --- 5. UI: filters + 3D button ---
const FILTER_LABELS = ["すべて", "おもてなし", "黙認・境界", "転用", "侵入"];

function setVisibleCount(n) {
  const el = document.getElementById('visibleCount');
  if (el) el.textContent = String(n);
}

function applyFilterToMarkers() {
  let visible = 0;

  for (const item of markerStore) {
    const cat = normalizeText(item.spot.category);
    const show = (activeFilterLabel === 'すべて') || (cat === activeFilterLabel);
    item.element.style.display = show ? '' : 'none';
    if (show) visible++;
  }

  setVisibleCount(visible);

  // 3DがONのときだけ、山もフィルタに追従
  if (is3D) refreshMoundsLayer();
}

function buildFilterUI() {
  const container = document.getElementById("categoryFilter");
  if (!container) return;

  container.innerHTML = "";

  FILTER_LABELS.forEach(label => {
    const btn = document.createElement("button");
    btn.className = "filter-chip";
    btn.textContent = label;
    if (label === activeFilterLabel) btn.classList.add("is-active");

    btn.addEventListener("click", () => {
      activeFilterLabel = label;
      container.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      applyFilterToMarkers();
    });

    container.appendChild(btn);
  });

  // 3Dボタン（フィルタとは独立）
  btn3d = document.createElement('button');
  btn3d.type = 'button';
  btn3d.id = 'btn3d';
  btn3d.className = 'filter-chip filter-chip--3d';
  btn3d.textContent = '3D';
  btn3d.classList.toggle('is-active', is3D);

  btn3d.addEventListener('click', () => {
    if (is3D) disable3D();
    else enable3D();
  });

  container.appendChild(btn3d);
}

// --- 6. Markers (HTML marker) ---
function makeMarkerElement(iconFile) {
  const markerWrap = document.createElement('div');
  markerWrap.className = 'marker-wrap';

  const markerEl = document.createElement('div');
  markerEl.className = 'custom-marker';

  const iconEl = document.createElement('div');
  iconEl.className = 'marker-icon';

  const safeFile = normalizeText(iconFile) || 'default.png';
  iconEl.style.backgroundImage = `url(/icons/${encodeURIComponent(safeFile)})`;

  markerEl.appendChild(iconEl);
  markerWrap.appendChild(markerEl);

  return { markerWrap, markerEl };
}

function popupHTML(spot) {
  const title = normalizeText(spot.title) || '（無題）';
  const date = normalizeText(spot.date);
  const recorder = normalizeText(spot.recorder);
  const cat = normalizeText(spot.category);
  const objects = normalizeText(spot.objects);

  return `
    <div style="min-width:220px">
      <div style="font-weight:700; margin-bottom:6px">${escapeHTML(title)}</div>
      <div style="font-size:12px; line-height:1.5; color:#444">
        ${date ? `日付：${escapeHTML(date)}<br>` : ''}
        ${recorder ? `記録者：${escapeHTML(recorder)}<br>` : ''}
        ${cat ? `関係性：${escapeHTML(cat)}<br>` : ''}
        ${objects ? `オブジェクト：${escapeHTML(objects)}` : ''}
      </div>
    </div>
  `;
}

function renderMarkers() {
  // remove existing
  for (const it of markerStore) it.marker.remove();
  markerStore = [];

  for (const spot of spots) {
    const lat = Number(spot.lat);
    const lng = Number(spot.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const iconFile = spot.icon_file || 'default.png';
    const { markerWrap, markerEl } = makeMarkerElement(iconFile);

    const marker = new maplibregl.Marker({ element: markerWrap, anchor: 'center' })
      .setLngLat([lng, lat])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupHTML(spot)))
      .addTo(map);

    markerEl.addEventListener('click', () => openPanel(spot));

    markerStore.push({ marker, element: markerWrap, spot });
  }

  applyFilterToMarkers();
}

// --- 7. 3D Mounds (fill-extrusion overlay) ---
function getLevelByCategory(spot) {
  const cat = normalizeText(spot.category);
  const lvl = HEIGHT_LEVEL[cat];
  return Number.isFinite(lvl) ? lvl : 0;
}

function metersToLngLatDelta(meters, lat) {
  const dLat = meters / 111320;
  const dLng = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { dLng, dLat };
}

function circleCoords(lng, lat, radiusM, segments) {
  const { dLng, dLat } = metersToLngLatDelta(radiusM, lat);
  const coords = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    coords.push([lng + Math.cos(t) * dLng, lat + Math.sin(t) * dLat]);
  }
  return coords;
}

function ringPolygon(lng, lat, rOuterM, rInnerM, segments) {
  const outer = circleCoords(lng, lat, rOuterM, segments);
  if (rInnerM <= 0) return [outer];
  const inner = circleCoords(lng, lat, rInnerM, segments).reverse();
  return [outer, inner];
}

function buildMoundsGeoJSON(spotsArr) {
  const features = [];

  for (const s of spotsArr) {
    const lat = Number(s.lat);
    const lng = Number(s.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const lvl = getLevelByCategory(s);
    if (lvl <= 0) continue;

    const totalH = lvl * MOUND.heightUnitM;

    for (let i = 0; i < MOUND.rings; i++) {
      const rOuter = (MOUND.maxRadiusM * (i + 1)) / MOUND.rings;
      const rInner = (MOUND.maxRadiusM * i) / MOUND.rings;
      const h = Math.max(0, totalH * (1 - i / MOUND.rings));

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: ringPolygon(lng, lat, rOuter, rInner, MOUND.segments),
        },
        properties: { h },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

function firstSymbolLayerId() {
  const layers = map.getStyle()?.layers || [];
  const sym = layers.find(l => l.type === 'symbol');
  return sym?.id || undefined;
}

function refreshMoundsLayer() {
  if (!is3D) return;

  const subset = (activeFilterLabel === 'すべて')
    ? spots
    : spots.filter(s => normalizeText(s.category) === activeFilterLabel);

  const geojson = buildMoundsGeoJSON(subset);

  const src = map.getSource(SRC_MOUNDS);
  if (src) src.setData(geojson);
}

function enable3D() {
  is3D = true;
  btn3d?.classList.toggle('is-active', true);

  // 3D操作を許可（2D時の挙動は維持）
  map.dragRotate.enable();
  map.touchPitch.enable();
  map.touchZoomRotate.enableRotation();

  map.easeTo({ pitch: 62, bearing: -20, duration: 520 });

  const subset = (activeFilterLabel === 'すべて')
    ? spots
    : spots.filter(s => normalizeText(s.category) === activeFilterLabel);

  const geojson = buildMoundsGeoJSON(subset);

  if (!map.getSource(SRC_MOUNDS)) {
    map.addSource(SRC_MOUNDS, { type: 'geojson', data: geojson });
  } else {
    map.getSource(SRC_MOUNDS).setData(geojson);
  }

  if (!map.getLayer(LYR_MOUNDS)) {
    const beforeId = firstSymbolLayerId();
    map.addLayer({
      id: LYR_MOUNDS,
      type: 'fill-extrusion',
      source: SRC_MOUNDS,
      paint: {
        // 重要：灰色フィルタっぽくならないよう、かなり薄く
        'fill-extrusion-color': '#2c2c2c',
        'fill-extrusion-opacity': 0.08,
        'fill-extrusion-height': ['to-number', ['get', 'h'], 0],
        'fill-extrusion-base': 0,
        'fill-extrusion-vertical-gradient': true,
      },
    }, beforeId);
  }
}

function disable3D() {
  is3D = false;
  btn3d?.classList.toggle('is-active', false);

  map.easeTo({ pitch: 0, bearing: 0, duration: 450 });

  // 2D時の挙動に戻す
  map.dragRotate.disable();
  map.touchPitch.disable();
  map.touchZoomRotate.disableRotation();

  if (map.getLayer(LYR_MOUNDS)) map.removeLayer(LYR_MOUNDS);
  if (map.getSource(SRC_MOUNDS)) map.removeSource(SRC_MOUNDS);
}

// --- 8. Panel + lightbox (あなたの添付版のまま) ---
const panel = document.getElementById("infoPanel");
const panelContent = document.getElementById("panelContent");

function openPanel(spot) {
  if (!panel || !panelContent) return;

  const imageUrl = normalizeText(spot.image_url);

  panelContent.innerHTML = `
    <div style="font-weight:800; margin-bottom:10px">${escapeHTML(normalizeText(spot.title) || '（無題）')}</div>
    <div style="font-size:12px; line-height:1.6; color:#333">
      ${spot.date ? `日付：${escapeHTML(spot.date)}<br>` : ''}
      ${spot.recorder ? `記録者：${escapeHTML(spot.recorder)}<br>` : ''}
      ${spot.category ? `関係性：${escapeHTML(spot.category)}<br>` : ''}
      ${spot.objects ? `オブジェクト：${escapeHTML(spot.objects)}<br>` : ''}
      ${spot.location ? `位置：${escapeHTML(spot.location)}<br>` : ''}
    </div>
    ${imageUrl ? `
      <div style="margin-top:12px">
        <img src="${escapeHTML(imageUrl)}" alt="現場写真" style="width:100%; border-radius:12px; cursor:zoom-in" onclick="openLightbox('${escapeHTML(imageUrl)}')" />
      </div>
    ` : ''}
  `;

  panel.style.display = 'block';
}

function closePanel() {
  if (!panel) return;
  panel.style.display = 'none';
}

const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');

function openLightbox(url) {
  if (!lightbox || !lightboxImg) return;
  lightboxImg.src = url;
  lightbox.style.display = 'flex';
}

function closeLightbox() {
  if (!lightbox || !lightboxImg) return;
  lightbox.style.display = 'none';
  lightboxImg.src = '';
}

// --- 9. FAB ---
const fabBtn = document.getElementById('fabBtn');
if (fabBtn) {
  fabBtn.addEventListener('click', () => {
    if (GOOGLE_FORM_URL && GOOGLE_FORM_URL !== 'YOUR_GOOGLE_FORM_URL') {
      window.open(GOOGLE_FORM_URL, '_blank', 'noopener');
    } else {
      alert('GoogleフォームURLが未設定です（GOOGLE_FORM_URL）');
    }
  });
}

// --- 10. Fetch spots + boot ---
async function fetchSpots() {
  const res = await fetch('/api/spots', { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('spots json is not an array');

  return data.map((row, i) => ({
    rowId: row.rowId ?? i,
    title: row.title ?? '',
    date: row.date ?? '',
    recorder: row.recorder ?? '',
    category: row.category ?? '',
    objects: row.objects ?? '',
    location: row.location ?? '',
    lat: row.lat,
    lng: row.lng,
    icon_file: row.icon_file ?? 'default.png',
    image_url: row.image_url ?? '',
  }));
}

async function main() {
  buildFilterUI();

  spots = await fetchSpots();

  setVisibleCount(0);

  map.on('load', () => {
    renderMarkers();

    // 3DのON/OFFを後から行ってもピンは常に生きるようにする
    // （初期はOFF）
  });
}

main().catch(err => {
  console.error(err);
  alert('読み込みに失敗しました。Console を確認してください。');
});

// inline onclick から呼べるように公開
window.openPanel = openPanel;
window.closePanel = closePanel;
window.openLightbox = openLightbox;
window.closeLightbox = closeLightbox;