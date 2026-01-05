// --- Configuration ---
const API_URL = '/api/spots';

// 軸の定義
const CATEGORIES = ["おもてなし", "黙認・境界", "転用", "侵入"];
// 公共性の値のマッピングルール
const PUB_MAPPING = {
  "プラスな面が大きい": "plus",
  "中立的である": "neutral",
  "マイナスな面がある": "minus"
};

// --- Main Logic ---
async function initMatrix() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();

    document.getElementById('loading').style.display = 'none';
    document.getElementById('matrixGrid').style.opacity = '1';

    renderMatrix(data);

  } catch (err) {
    console.error(err);
    document.getElementById('loading').textContent = 'Error loading data.';
  }
}

function normalizeText(v) {
  return String(v ?? "").trim();
}

function renderMatrix(spots) {
  spots.forEach(spot => {
    // 1. カテゴリーの判定
    const catRaw = normalizeText(spot.category);
    // 配列のインデックスを探す (0:おもてなし ... 3:侵入)
    const colIndex = CATEGORIES.indexOf(catRaw);

    // 2. 公共性の判定
    const pubRaw = normalizeText(spot.publicness);
    const pubKey = PUB_MAPPING[pubRaw]; // plus, neutral, minus

    // 該当なしデータはスキップ
    if (colIndex === -1 || !pubKey) return;

    // 3. マスの特定
    // HTML側のIDルール: cell-{colIndex}-{rowIndex}
    // rowIndex -> plus:0, neutral:1, minus:2
    let rowIndex = 1; // default neutral
    if (pubKey === 'plus') rowIndex = 0;
    if (pubKey === 'minus') rowIndex = 2;

    const cellId = `cell-${colIndex}-${rowIndex}`;
    const cell = document.getElementById(cellId);

    if (cell) {
      createPin(cell, spot);
    }
  });
}

function createPin(container, spot) {
  // ピンのコンテナ (位置決め用)
  const pinWrap = document.createElement('div');
  pinWrap.className = 'scatter-pin';

  // ランダムな位置 (ジッター)
  // 枠からはみ出さないように 10% ~ 90% の範囲に収める
  const top = 10 + Math.random() * 80;
  const left = 10 + Math.random() * 80;
  
  pinWrap.style.top = `${top}%`;
  pinWrap.style.left = `${left}%`;

  // ピンのデザイン (style.cssのクラスを再利用)
  const markerWrap = document.createElement('div');
  markerWrap.className = 'marker-wrap'; // マップと同じクラス

  const iconEl = document.createElement('div');
  iconEl.className = 'custom-marker';
  
  // アイコン画像
  let iconUrl = 'icons/default.png';
  if (spot.icon_file && String(spot.icon_file).trim() !== '') {
    iconUrl = `icons/${String(spot.icon_file).trim()}`;
  }
  iconEl.style.backgroundImage = `url('${iconUrl}')`;

  markerWrap.appendChild(iconEl);
  pinWrap.appendChild(markerWrap);
  container.appendChild(pinWrap);

  // クリックイベント (詳細表示)
  markerWrap.addEventListener('click', (e) => {
    e.stopPropagation(); // マス自体のクリックイベント等があれば防ぐ
    showDetail(spot);
  });
}


// --- UI Logic (Copied & Simplified from script.js) ---

const infoPanel = document.getElementById('infoPanel');
const panelContent = document.getElementById('panelContent');
const panelCloseBtn = document.getElementById('panelCloseBtn');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCloseBtn = document.getElementById('lightboxCloseBtn');

// HTMLエスケープ
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function closePanel() {
  infoPanel.classList.remove('active');
  setTimeout(() => { panelContent.scrollTop = 0; }, 300);
}

function openLightbox(url) {
  if (!url) return;
  lightboxImg.src = url;
  lightbox.classList.add('active');
}

function closeLightbox() {
  lightbox.classList.remove('active');
  setTimeout(() => { lightboxImg.src = ''; }, 200);
}

// Event Listeners
panelCloseBtn.addEventListener('click', closePanel);
lightboxCloseBtn.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

// マス以外の背景クリックでパネルを閉じる（簡易実装）
document.addEventListener('click', (e) => {
  // ピンやパネル内部のクリックでなければ閉じる
  if (!e.target.closest('.marker-wrap') && !e.target.closest('.info-panel')) {
    closePanel();
  }
});


function showDetail(spot) {
  const safeTitle = escapeHtml(spot.title);
  const safeDate = spot.date ? new Date(spot.date).toLocaleDateString('ja-JP') : "";
  const safeRecorder = escapeHtml(spot.recorder);
  const safeCategory = escapeHtml(spot.category || "");
  const safeObjects = escapeHtml(spot.objects || "");
  const safePublicness = escapeHtml(spot.publicness);
  const safeEvidence = escapeHtml(spot.evidence);
  const safeLocNote = escapeHtml(spot.location_note);

  const formatTags = (str) => {
    if (!str) return "";
    return escapeHtml(str)
      .split(/,|、/)
      .map(s => s.trim())
      .filter(s => s)
      .map(s => `<span class="multi-tag">${s}</span>`)
      .join('');
  };

  const safeFunctions = formatTags(spot.functions);
  const safeBehavior = formatTags(spot.behavior);
  const safeSituation = formatTags(spot.situation);
  const safePhotoUrl = spot.photo_url ? spot.photo_url.replace(/[\"<>]/g, "") : null;

  const html = `
    ${safePhotoUrl ? `<img src="${safePhotoUrl}" class="panel-img" id="detailPanelImg">` : ''}
    <div class="panel-header">
      <h2 class="panel-title">${safeTitle}</h2>
      <div class="panel-meta">
        ${safeCategory ? `<span class="badge badge-cat">${safeCategory}</span>` : ''}
        <span class="badge badge-date">${safeDate}</span>
        <span class="recorder-info">by ${safeRecorder}</span>
      </div>
    </div>
    <div class="panel-body">
      <div class="info-section"><span class="section-label">モノ・構成要素</span><div class="section-text">${safeObjects}</div></div>
      ${safeFunctions ? `<div class="info-section"><span class="section-label">機能</span><div class="section-text">${safeFunctions}</div></div>` : ''}
      ${safeBehavior ? `<div class="info-section"><span class="section-label">人のふるまい</span><div class="section-text">${safeBehavior}</div></div>` : ''}
      ${safeSituation ? `<div class="info-section"><span class="section-label">状況</span><div class="section-text">${safeSituation}</div></div>` : ''}
      <div class="info-section"><span class="section-label">公共性</span><div class="section-text">${safePublicness}</div></div>
      ${safeEvidence ? `<div class="info-section"><span class="section-label">根拠・メモ</span><div class="section-text" style="color:#666;">${safeEvidence}</div></div>` : ''}
      ${safeLocNote ? `<div class="info-section"><span class="section-label">位置情報メモ</span><div class="section-text" style="color:#666;">${safeLocNote}</div></div>` : ''}
    </div>
  `;

  panelContent.innerHTML = html;
  
  if (safePhotoUrl) {
    const imgEl = document.getElementById('detailPanelImg');
    if (imgEl) {
      imgEl.addEventListener('click', () => openLightbox(safePhotoUrl));
    }
  }

  infoPanel.classList.add('active');
}

// Start
initMatrix();