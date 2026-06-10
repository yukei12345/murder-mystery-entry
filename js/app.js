// ── Firebase 初期化 ───────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyA5lVqe566PsDFm9R-VTORM6doHPm1lG_k",
  authDomain: "murder-mystery-entry.firebaseapp.com",
  databaseURL: "https://murder-mystery-entry-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "murder-mystery-entry",
  storageBucket: "murder-mystery-entry.firebasestorage.app",
  messagingSenderId: "350564784867",
  appId: "1:350564784867:web:104183a27bd5106e9243d6"
};

firebase.initializeApp(firebaseConfig);
const db      = firebase.database();
const rootRef = db.ref('mm');

// ── デフォルトデータ ──────────────────────────────────────
const DEFAULT_CATEGORIES = ['初回の方向け', '複数回経験済み'];

const WORKS = [
  { id: 'w1', title: '九頭竜館の殺人',            defaultCat: '初回の方向け',    players: '7〜9名', time: '約120分', capacity: 9, author: 'Group SNE', tags: ['Level★☆☆', '館', 'ホラー', 'GM不要'] },
  { id: 'w2', title: '人狼村の祝祭',              defaultCat: '初回の方向け',    players: '7〜8名', time: '約120分', capacity: 8, author: 'Group SNE', tags: ['Level★☆☆', 'ファンタジー', 'GM不要'] },
  { id: 'w3', title: '最果亭の災禍',              defaultCat: '初回の方向け',    players: '6〜8名', time: '約180分', capacity: 8, author: 'Group SNE', tags: ['Level★☆☆', 'ファンタジー', 'GM不要'] },
  { id: 'w4', title: '何度だって青い月に火を灯した', defaultCat: '複数回経験済み', players: '6〜7名', time: '約150分', capacity: 7, author: 'Group SNE', tags: ['Level★★☆', 'マフィア', '群像劇', 'GM不要'] },
  { id: 'w5', title: 'ダークユールに贖いを',        defaultCat: '複数回経験済み', players: '7〜9名', time: '約180分', capacity: 9, author: 'Group SNE', tags: ['Level★★★', '吸血鬼', 'ロールプレイ', 'GM不要'] },
];

const ADMIN_PASS = 'mystery'; // ← パスワードをここで変更

// ── Firebase 状態（リアルタイム同期） ────────────────────
let fbState = { entries: {}, categories: null, workcats: {}, workinfo: {}, deleted: [], customWorks: {}, workOrder: [] };
let fbReady = false;

// Firebase は配列をオブジェクトとして返すことがあるため正規化
function toArr(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v);
}

rootRef.on('value', (snapshot) => {
  const data          = snapshot.val() || {};
  fbState.entries     = data.entries    || {};
  fbState.categories  = data.categories || null;
  fbState.workcats    = data.workcats   || {};
  fbState.workinfo    = data.workinfo   || {};
  fbState.deleted     = toArr(data.deleted);
  fbState.workOrder   = toArr(data.workOrder);
  fbState.catMerged   = !!(data.meta && data.meta.catMerged);
  // customWorks の tags も配列に正規化
  const rawCW = data.customWorks || {};
  fbState.customWorks = {};
  Object.entries(rawCW).forEach(([id, w]) => {
    fbState.customWorks[id] = { ...w, tags: toArr(w.tags) };
  });
  fbReady = true;
  setSyncOnline(true);
  render();
  if (isAdmin && document.getElementById('adminView').innerHTML) renderAdmin();
  migrateCategoriesToTags();
});

db.ref('.info/connected').on('value', (snap) => {
  if (fbReady) setSyncOnline(snap.val() === true);
});

function setSyncOnline(online) {
  const bar  = document.getElementById('syncBar');
  const text = document.getElementById('syncText');
  bar.classList.toggle('offline', !online);
  text.textContent = online
    ? 'リアルタイム同期中 — 他の人の操作もすぐ反映されます'
    : 'オフライン — インターネット接続を確認してください';
}

// ── Firebase 書き込みヘルパー ─────────────────────────────
function fbSet(path, value) { return rootRef.child(path).set(value); }

// ── データアクセサ ────────────────────────────────────────
function getDeleted()    { return fbState.deleted; }
function getWorks() {
  const del    = getDeleted();
  const base   = WORKS.filter(w => !del.includes(w.id));
  const custom = Object.entries(fbState.customWorks)
    .filter(([id]) => !del.includes(id))
    .map(([id, w]) => ({ ...w, id }));
  const all    = [...base, ...custom];
  const order  = fbState.workOrder;
  if (!order.length) return all;
  // workOrder に従って並べ、未登録のものは末尾に追加
  const ordered = order.map(id => all.find(w => w.id === id)).filter(Boolean);
  const rest    = all.filter(w => !order.includes(w.id));
  return [...ordered, ...rest];
}
function getCategories() { return fbState.categories || [...DEFAULT_CATEGORIES]; }
function getWorkCat(w)   { return fbState.workcats[w.id] || w.defaultCat || getCategories()[0] || ''; }

function guessCapacity(playersText) {
  const nums = String(playersText).match(/\d+/g);
  if (!nums || !nums.length) return 0;
  return Math.max(...nums.map(Number));
}

function getInfo(w) {
  const saved   = fbState.workinfo[w.id] || {};
  const players = saved.players ?? w.players ?? '';
  return {
    title:       saved.title       ?? w.title    ?? '',
    players:     players,
    time:        saved.time        ?? w.time     ?? '',
    author:      saved.author      ?? w.author   ?? '',
    price:       saved.price       ?? w.price    ?? '',
    tags:        toArr(saved.tags  ?? w.tags),
    capacity:    (saved.capacity   ?? w.capacity ?? guessCapacity(players)) || 0,
    status:      saved.status      ?? 'recruiting',
    scheduledAt: saved.scheduledAt ?? '',
    venue:       saved.venue       ?? '',
    thumbnail:   saved.thumbnail   ?? w.thumbnail   ?? '',
    url:         saved.url         ?? w.url         ?? '',
  };
}

function isCustomWork(w) { return !!fbState.customWorks[w.id]; }

function saveInfo(id, patch) {
  const w = getWorks().find(x => x.id === id);
  return fbSet(`workinfo/${id}`, { ...getInfo(w), ...patch });
}

// ── 自分のエントリーをブラウザに記憶 ─────────────────────
function getMyEntries() {
  try { return JSON.parse(localStorage.getItem('mm_my_entries') || '{}'); } catch { return {}; }
}
function setMyEntry(workId, name) {
  const d = getMyEntries(); d[workId] = name;
  localStorage.setItem('mm_my_entries', JSON.stringify(d));
}
function clearMyEntry(workId) {
  const d = getMyEntries(); delete d[workId];
  localStorage.setItem('mm_my_entries', JSON.stringify(d));
}
function getMyEntry(workId, entries) {
  const name = getMyEntries()[workId];
  if (!name) return null;
  if (!entries.includes(name)) { clearMyEntry(workId); return null; }
  return name;
}

// ── SVG アイコン ──────────────────────────────────────────
const ICON = {
  person: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  clock:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  author: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  price:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" focusable="false"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
};

// ── メイン描画 ────────────────────────────────────────────
let activePlayerFilter = 'all'; // 'all' or a capacity number
let showArchived = false;
let activeSearch = '';

// 旧カテゴリを各作品のタグへ統合する一度きりの移行（冪等・追加のみ）
function migrateCategoriesToTags() {
  if (fbState.catMerged) return;
  const updates = {};
  getWorks().forEach(w => {
    const cat  = getWorkCat(w);
    const tags = getInfo(w).tags;
    if (cat && !tags.includes(cat)) updates[`workinfo/${w.id}/tags`] = [...tags, cat];
  });
  updates['meta/catMerged'] = true;
  rootRef.update(updates).catch(() => {});
}

// タグ・作品名のテキスト検索（スペース区切りでAND）
function setSearch(v) { activeSearch = (v || '').trim(); render(); }
function matchesSearch(w) {
  if (!activeSearch) return true;
  const info = getInfo(w);
  const hay  = [info.title, ...info.tags].join(' ').toLowerCase();
  return activeSearch.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t));
}

function getPlayerOptions() {
  const caps = getWorks()
    .filter(w => getInfo(w).status === 'recruiting')
    .map(w => getInfo(w).capacity)
    .filter(c => c > 0);
  return [...new Set(caps)].sort((a, b) => a - b);
}

function matchesPlayerFilter(w) {
  if (activePlayerFilter === 'all') return true;
  return getInfo(w).capacity === activePlayerFilter;
}

function setPlayerFilter(val) { activePlayerFilter = val; render(); }
function toggleArchived() { showArchived = !showArchived; render(); }

function renderFilterBar() {
  const works   = getWorks();
  const playerOpts = getPlayerOptions();

  const matchesStatus = w => {
    const s = getInfo(w).status;
    return showArchived ? s !== 'recruiting' : s === 'recruiting';
  };

  const playerCountOf = cap =>
    works.filter(w => getInfo(w).capacity === cap && matchesStatus(w) && matchesSearch(w)).length;

  const playerSection = playerOpts.length ? [
    `<button class="filter-chip ${activePlayerFilter==='all'?'active':''}" aria-pressed="${activePlayerFilter==='all'}" onclick="setPlayerFilter('all')">すべて</button>`,
    ...playerOpts.map(cap =>
      `<button class="filter-chip ${activePlayerFilter===cap?'active':''}" aria-pressed="${activePlayerFilter===cap}" onclick="setPlayerFilter(${cap})">${cap}名<span class="filter-count">${playerCountOf(cap)}</span></button>`
    ),
  ].join('') : '';

  const archivedCount = getWorks().filter(w => ['confirmed','done'].includes(getInfo(w).status)).length;
  const archivedSection = `<div class="filter-section" style="justify-content:flex-end">
      <button class="archived-toggle-btn ${showArchived ? 'active' : ''}"
              onclick="toggleArchived()"
              aria-pressed="${showArchived}">
        ${showArchived ? '✓ 開催確定・済みを表示中' : `開催確定・済みを表示${archivedCount > 0 ? `（${archivedCount}件）` : ''}`}
      </button>
     </div>`;

  document.getElementById('filterBar').innerHTML =
    `<div class="filter-section" style="${playerSection ? '' : 'visibility:hidden;pointer-events:none'}"><span class="filter-section-label">最大人数</span>${playerSection}</div>` +
    archivedSection;
}

function render() {
  if (!fbReady) return;
  const entries = fbState.entries;
  const works   = getWorks();

  renderFilterBar();

  const filtered = works.filter(w => {
    const s = getInfo(w).status;
    return matchesPlayerFilter(w) && matchesSearch(w) && (
      showArchived ? s !== 'recruiting' : s === 'recruiting'
    );
  });

  document.getElementById('works').innerHTML = filtered.length
    ? `<div class="works">${filtered.map(w => renderWork(w, entries[w.id] || [])).join('')}</div>`
    : '<p class="no-result">該当する作品がありません</p>';
}

function renderWork(w, entries) {
  const info     = getInfo(w);
  const cap      = info.capacity;
  const isFull   = cap > 0 && entries.length >= cap;
  const status   = info.status; // 'recruiting' | 'confirmed' | 'done'
  const isDone   = status === 'done';
  const isConfirmed = status === 'confirmed';
  const entryOpen   = status === 'recruiting' && !isFull;

  const myName = getMyEntry(w.id, entries);
  const myIdx  = myName ? entries.indexOf(myName) : -1;
  const chips  = myName
    ? `<span class="entry-chip">${esc(myName)}<button class="chip-remove" title="エントリーを取り消す" aria-label="${esc(myName)} のエントリーを取り消す" onclick="removeOwnEntry('${w.id}',${myIdx})">×</button></span>`
    : entries.length
      ? '<span class="entry-empty">名前は非公開です</span>'
      : '<span class="entry-empty">まだ誰もエントリーしていません</span>';

  const tagHtml = info.tags.length ? info.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('') : '';

  // 定員バッジ
  let badge, badgeClass = 'work-badge';
  if (isFull && !isConfirmed && !isDone) { badge = '満員'; badgeClass += ' work-badge-full'; }
  else if (cap > 0) { badge = `${entries.length}/${cap}名`; }
  else              { badge = `${entries.length}名エントリー中`; }

  // ステータスバッジ
  const statusBadge = isConfirmed
    ? `<span class="status-badge status-confirmed">📅 開催確定</span>`
    : isDone
      ? `<span class="status-badge status-done">開催済み</span>`
      : '';

  // 開催日時・場所バー（確定時のみ）
  const scheduleBar = isConfirmed && (info.scheduledAt || info.venue) ? `
    <div class="work-schedule">
      ${info.scheduledAt ? `<span class="work-schedule-item">🗓 ${esc(info.scheduledAt)}</span>` : ''}
      ${info.venue       ? `<span class="work-schedule-item">📍 ${esc(info.venue)}</span>`       : ''}
    </div>` : '';

  // エントリーフォーム
  let formHtml;
  if (isDone) {
    formHtml = `<p class="full-notice">この作品は開催済みです。</p>`;
  } else if (isConfirmed) {
    formHtml = `<p class="full-notice">開催が確定しました。エントリーの受付は終了しています。</p>`;
  } else if (isFull) {
    formHtml = `<p class="full-notice">定員に達したため、現在エントリーを受け付けていません。</p>`;
  } else {
    formHtml = `<div class="entry-form">
          <input class="entry-input" id="input-${w.id}" placeholder="名前を入力" maxlength="20"
                 aria-label="${esc(info.title)} に参加する名前を入力"
                 onkeydown="if(event.key==='Enter') doEntry('${w.id}')" />
          <button class="btn btn-primary" onclick="doEntry('${w.id}')">エントリー</button>
        </div>`;
  }

  const cardClass = ['work', isFull && !isConfirmed && !isDone ? 'is-full' : '', isDone ? 'is-done' : ''].filter(Boolean).join(' ');

  const urlLink = info.url
    ? `<a href="${esc(info.url)}" target="_blank" rel="noopener noreferrer" class="work-url-link">
         <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
         作品ページ
       </a>` : '';

  const thumbHtml = info.thumbnail
    ? `<img src="${esc(info.thumbnail)}" alt="${esc(info.title)}" loading="lazy"
           onerror="this.outerHTML='<div class=work-no-image>No Image</div>'" />`
    : `<div class="work-no-image">No Image</div>`;

  return `
    <div class="${cardClass}" data-id="${w.id}">
      <div class="work-header">
        <span class="work-title">${esc(info.title)}</span>
        <span class="${badgeClass}">${badge}</span>
        ${statusBadge}
      </div>
      <div class="work-columns">
        <div class="work-thumb-col">${thumbHtml}</div>
        <div class="work-detail-col">
          <div class="work-picto">
            <div class="picto-item">
              <span class="sr-only">参加人数</span>${ICON.person}
              <span class="picto-label" aria-hidden="true">Players</span>
              <span class="picto-value">${esc(info.players)}</span>
            </div>
            <div class="picto-sep" aria-hidden="true"></div>
            <div class="picto-item">
              <span class="sr-only">所要時間</span>${ICON.clock}
              <span class="picto-label" aria-hidden="true">Time</span>
              <span class="picto-value">${esc(info.time)}</span>
            </div>
            ${info.price ? `
            <div class="picto-sep" aria-hidden="true"></div>
            <div class="picto-item">
              <span class="sr-only">金額</span>${ICON.price}
              <span class="picto-label" aria-hidden="true">Price</span>
              <span class="picto-value">${esc(info.price)}</span>
            </div>` : ''}
          </div>
          ${(info.author || urlLink) ? `
          <div class="work-submeta">
            ${info.author ? `<span class="info-item"><span class="sr-only">作者</span>${ICON.author} ${esc(info.author)}</span>` : ''}
            ${(info.author && urlLink) ? `<span class="info-sep" aria-hidden="true">·</span>` : ''}
            ${urlLink}
          </div>` : ''}
          ${scheduleBar}
          ${tagHtml ? `<div class="work-tags">${tagHtml}</div>` : ''}
          <div class="work-bottom">
            ${entries.length ? `<div class="entries-label">エントリー済み: ${entries.length}名${myName ? '（あなたを含む）' : ''}</div>` : ''}
            <div class="entry-list">${chips}</div>
            ${formHtml}
            <p class="msg" id="msg-${w.id}" role="status" aria-live="polite"></p>
          </div>
        </div>
      </div>
    </div>`;
}

// ── エントリー ────────────────────────────────────────────
function doEntry(id) {
  const input = document.getElementById(`input-${id}`);
  const name  = input.value.trim();
  const msgEl = document.getElementById(`msg-${id}`);
  if (!name) { showMsg(msgEl, '名前を入力してください', 'err'); return; }

  const list = fbState.entries[id] || [];
  if (list.includes(name)) { showMsg(msgEl, `「${name}」はすでにエントリー済みです`, 'err'); return; }

  const w   = getWorks().find(x => x.id === id);
  const cap = w ? getInfo(w).capacity : 0;
  if (cap > 0 && list.length >= cap) { showMsg(msgEl, '定員に達したためエントリーできません', 'err'); return; }

  const title = w ? getInfo(w).title : '';
  openConfirm({
    title: 'エントリーの確認',
    message: `<strong>${esc(title)}</strong> に<br><strong>${esc(name)}</strong> としてエントリーします。よろしいですか？`,
    okLabel: 'エントリーする', danger: false,
    onConfirm: () => commitEntry(id, name),
  });
}

function commitEntry(id, name) {
  const list = [...(fbState.entries[id] || [])];
  if (list.includes(name)) return;
  const w   = getWorks().find(x => x.id === id);
  const cap = w ? getInfo(w).capacity : 0;
  if (cap > 0 && list.length >= cap) return;
  list.push(name);
  fbSet(`entries/${id}`, list).then(() => {
    setMyEntry(id, name);
    const input = document.getElementById(`input-${id}`);
    if (input) input.value = '';
    showMsg(document.getElementById(`msg-${id}`), `「${name}」でエントリーしました！`, 'ok');
  });
}

function confirmRemoveEntry(id, index, label = '取り消し', afterConfirm = null) {
  const list  = fbState.entries[id] || [];
  const name  = list[index];
  if (name === undefined) return;
  const w     = getWorks().find(x => x.id === id);
  const title = w ? getInfo(w).title : '';
  openConfirm({
    title: `エントリーの${label}`,
    message: `<strong>${esc(title)}</strong> の<br><strong>${esc(name)}</strong> のエントリーを${label}します。よろしいですか？`,
    okLabel: `${label}する`, danger: true,
    onConfirm: () => {
      const cur = [...(fbState.entries[id] || [])];
      const pos = cur[index] === name ? index : cur.indexOf(name);
      if (pos === -1) return;
      cur.splice(pos, 1);
      fbSet(`entries/${id}`, cur.length ? cur : null);
      if (afterConfirm) afterConfirm();
    },
  });
}

function removeOwnEntry(id, index) { confirmRemoveEntry(id, index, '取り消し', () => clearMyEntry(id)); }
function removeEntry(id, index)    { confirmRemoveEntry(id, index, '削除'); }

function showMsg(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className   = `msg msg-${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'msg'; }, 3000);
}

// ── 管理者 ────────────────────────────────────────────────
let isAdmin = false;
let adminTab = 'recruiting'; // 'recruiting' | 'confirmed' | 'done'

function setAdminTab(tab) { adminTab = tab; renderAdmin(); }

function toggleAdmin() {
  if (isAdmin) { adminLogout(); return; }
  // ログアウト時：サイドバー内のログイン入力欄を開く
  document.getElementById('adminLoginBox').style.display = 'flex';
  document.querySelector('.header-admin-btn').style.display = 'none';
  document.getElementById('adminPass').focus();
}

function closeAdminPanel() {
  document.getElementById('adminLoginBox').style.display = 'none';
  document.querySelector('.header-admin-btn').style.display = '';
  document.getElementById('adminPass').value = '';
  document.getElementById('adminErr').textContent = '';
}

function togglePassVisible() {
  const input = document.getElementById('adminPass');
  const btn   = document.getElementById('passToggle');
  const hide  = input.type === 'password';
  input.type  = hide ? 'text' : 'password';
  btn.textContent = hide ? '隠す' : '表示';
  btn.setAttribute('aria-label', hide ? 'パスワードを隠す' : 'パスワードを表示');
}

function adminLogin() {
  if (document.getElementById('adminPass').value !== ADMIN_PASS) {
    document.getElementById('adminErr').textContent = 'パスワードが違います'; return;
  }
  document.getElementById('adminErr').textContent = '';
  isAdmin = true;
  showAdminUI();
}

function adminLogout() {
  isAdmin = false;
  document.getElementById('adminPass').value = '';
  document.getElementById('adminView').innerHTML = '';
  document.getElementById('adminLoginBox').style.display = 'none';
  document.getElementById('publicView').style.display = '';
  document.getElementById('publicView').classList.remove('admin-mode');
  document.getElementById('adminPanel').classList.remove('open');
  const btn = document.querySelector('.header-admin-btn');
  btn.style.display = '';
  btn.textContent = '管理者ログイン';
  document.getElementById('headerStatus').hidden = true;
  document.getElementById('adminErr').textContent = '';
}

function showAdminUI() {
  document.getElementById('adminLoginBox').style.display = 'none';
  document.getElementById('publicView').style.display = 'none';
  document.getElementById('adminPanel').classList.add('open');
  const btn = document.querySelector('.header-admin-btn');
  btn.style.display = '';
  btn.textContent = '管理者ログアウト';
  document.getElementById('headerStatus').hidden = false;
  renderAdmin();
}

function renderAdmin() {
  if (!isAdmin) { document.getElementById('adminView').innerHTML = ''; return; }
  const entries = fbState.entries;

  const DRAG_HANDLE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/></svg>`;

  // タブごとの件数
  const tabCounts = { recruiting: 0, confirmed: 0, done: 0 };
  getWorks().forEach(w => { const s = getInfo(w).status; if (s in tabCounts) tabCounts[s]++; });

  const cards = getWorks().filter(w => getInfo(w).status === adminTab).map(w => {
    const info   = getInfo(w);
    const list   = entries[w.id] || [];
    const cap    = info.capacity;
    const isFull = cap > 0 && list.length >= cap;
    const isDone      = info.status === 'done';
    const isConfirmed = info.status === 'confirmed';

    let countBadgeClass = 'work-badge';
    let countLabel;
    if (isFull)       { countBadgeClass += ' work-badge-full'; countLabel = `満員 ${list.length}/${cap}名`; }
    else if (cap > 0) { countLabel = `${list.length} / ${cap}名`; }
    else              { countLabel = `${list.length}名エントリー中`; }

    const statusBadge = isConfirmed
      ? `<span class="status-badge status-confirmed">📅 開催確定</span>`
      : isDone
        ? `<span class="status-badge status-done">開催済み</span>`
        : '';

    const tagHtml = info.tags.length
      ? info.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')
      : '';

    const entryHtml = list.length
      ? list.map((n, i) =>
          `<span class="entry-chip">${esc(n)}<button class="chip-remove" title="${esc(n)}を削除" aria-label="${esc(n)}を削除" onclick="removeEntry('${w.id}',${i})">×</button></span>`
        ).join('')
      : `<span style="color:var(--muted);font-size:0.73rem">エントリーなし</span>`;

    const scheduleInfo = (isConfirmed || isDone) && (info.scheduledAt || info.venue)
      ? `<div style="font-size:0.73rem;color:var(--accent-dark);margin-top:0.15rem;display:flex;flex-wrap:wrap;gap:0.3rem 0.7rem">
           ${info.scheduledAt ? `<span>🗓 ${esc(info.scheduledAt)}</span>` : ''}
           ${info.venue       ? `<span>📍 ${esc(info.venue)}</span>`       : ''}
         </div>` : '';

    const rerunBtn = isDone
      ? `<button class="btn-xs btn-muted" onclick="askRerunWork('${w.id}')">🔄 再募集する</button>`
      : '';

    const cardClass = ['admin-card', isFull && !isConfirmed && !isDone ? 'is-full' : '', isDone ? 'is-done' : ''].filter(Boolean).join(' ');

    return `<div class="${cardClass}" data-id="${w.id}"
         draggable="false"
         ondragstart="onAdminDragStart(event,'${w.id}')"
         ondragover="onAdminDragOver(event)"
         ondragleave="onAdminDragLeave(event)"
         ondrop="onAdminDrop(event,'${w.id}')"
         ondragend="onAdminDragEnd(event)">
      ${info.thumbnail ? `<div class="work-thumbnail"><img src="${esc(info.thumbnail)}" alt="" loading="lazy" style="max-height:140px" onerror="this.closest('.work-thumbnail').style.display='none'" /></div>` : ''}
      <div class="admin-card-header">
        <span class="admin-drag-handle" title="ドラッグして並び替え" aria-hidden="true"
              onmousedown="this.closest('.admin-card').draggable=true"
              onmouseup="this.closest('.admin-card').draggable=false">${DRAG_HANDLE_SVG}</span>
        <span class="admin-card-title">${esc(info.title)}</span>
        <span class="${countBadgeClass}" style="flex-shrink:0">${countLabel}</span>
        ${statusBadge}
        <div class="admin-card-actions">
          <button class="btn-xs btn-save" onclick="openEditModal('${w.id}')">✏ 編集</button>
          ${rerunBtn}
          <button class="btn-xs btn-del"  onclick="askDeleteWork('${w.id}')">削除</button>
        </div>
      </div>
      <div class="admin-card-body">
        <div class="admin-card-info">
          ${ICON.person} ${esc(info.players)}
          ${info.time   ? `<span class="info-sep">·</span>${ICON.clock}  ${esc(info.time)}`   : ''}
          ${info.author ? `<span class="info-sep">·</span>${ICON.author} ${esc(info.author)}` : ''}
          ${info.price  ? `<span class="info-sep">·</span>${ICON.price}  ${esc(info.price)}`  : ''}
        </div>
        ${scheduleInfo}
        ${tagHtml ? `<div class="admin-card-tags">${tagHtml}</div>` : ''}
        <div class="admin-card-entries-row">
          <span class="admin-card-entries-label">エントリー</span>
          <div class="admin-card-entry-names">${entryHtml}</div>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('adminView').innerHTML = `
    <div class="admin-section">
      <p class="admin-section-title">新規作品を追加</p>
      <div class="field-row"><span class="field-label">作品名</span><input class="a-input fill" id="new-title"    placeholder="作品名（必須）" maxlength="40" /></div>
      <div class="field-row"><span class="field-label">作者</span>  <input class="a-input fill" id="new-author"   placeholder="作者・サークル名" maxlength="40" /></div>
      <div class="field-row"><span class="field-label">金額</span>  <input class="a-input fill" id="new-price"    placeholder="例：2,000円" maxlength="20" /></div>
      <div class="field-row"><span class="field-label">人数</span>  <input class="a-input fill" id="new-players"  placeholder="例：4〜6名" maxlength="20" /></div>
      <div class="field-row"><span class="field-label">定員</span>  <input class="a-input" id="new-capacity" type="number" min="0" max="99" value="0" style="width:5rem" /><span class="field-hint">名（0で無制限）</span></div>
      <div class="field-row"><span class="field-label">時間</span>  <input class="a-input fill" id="new-time"     placeholder="例：約120分" maxlength="20" /></div>
      <div class="field-row"><span class="field-label">タグ</span>  <input class="a-input fill" id="new-tags"     placeholder="カンマ区切りで入力（旧カテゴリもタグで）" maxlength="100" /></div>
      <div class="field-row" style="margin-top:0.4rem">
        <button class="btn-xs btn-save" onclick="addNewWork()">作品を追加</button>
      </div>
      <p class="msg" id="msg-new-work" role="status" aria-live="polite"></p>
    </div>
    <div class="admin-section">
      <p class="admin-section-title">作品・エントリー管理</p>
      <div class="admin-tabs" role="tablist">
        <button class="admin-tab ${adminTab==='recruiting'?'active':''}" role="tab"
                aria-selected="${adminTab==='recruiting'}" onclick="setAdminTab('recruiting')">
          募集中<span class="admin-tab-count">${tabCounts.recruiting}</span>
        </button>
        <button class="admin-tab ${adminTab==='confirmed'?'active':''}" role="tab"
                aria-selected="${adminTab==='confirmed'}" onclick="setAdminTab('confirmed')">
          開催確定<span class="admin-tab-count">${tabCounts.confirmed}</span>
        </button>
        <button class="admin-tab ${adminTab==='done'?'active':''}" role="tab"
                aria-selected="${adminTab==='done'}" onclick="setAdminTab('done')">
          開催済み<span class="admin-tab-count">${tabCounts.done}</span>
        </button>
      </div>
      ${cards.length
        ? `<div class="admin-list">${cards}</div>`
        : `<p style="color:var(--muted);font-size:0.85rem;padding:1.5rem 0;text-align:center">該当する作品はありません</p>`
      }
      ${adminTab === 'recruiting'
        ? `<button class="reset-btn" onclick="clearAll()">全エントリーをリセット</button>`
        : ''}
    </div>`;
}

// ── 編集モーダル ───────────────────────────────────────────
let editModalWorkId = null;

function openEditModal(id) {
  const w = getWorks().find(x => x.id === id);
  if (!w) return;
  const info = getInfo(w);
  editModalWorkId = id;

  document.getElementById('editModalHeading').textContent = `「${info.title}」を編集`;
  document.getElementById('editModal-title').value       = info.title;
  document.getElementById('editModal-players').value     = info.players;
  document.getElementById('editModal-capacity').value    = info.capacity;
  document.getElementById('editModal-time').value        = info.time;
  document.getElementById('editModal-author').value      = info.author;
  document.getElementById('editModal-price').value       = info.price;
  document.getElementById('editModal-tags').value        = info.tags.join(',');
  document.getElementById('editModal-status').value      = info.status;
  document.getElementById('editModal-scheduledAt').value = info.scheduledAt;
  document.getElementById('editModal-venue').value       = info.venue;
  document.getElementById('editModal-url').value             = info.url;
  document.getElementById('editModal-thumbnail').value       = info.thumbnail;
  document.getElementById('editModal-thumbnail-file').value  = '';
  document.getElementById('editModal-upload-status').textContent = '';
  document.getElementById('editModal-msg').textContent       = '';
  updateThumbnailPreview(info.thumbnail);
  document.getElementById('editModalOverlay').classList.add('open');
  document.getElementById('editModal-title').focus();
}

function closeEditModal() {
  document.getElementById('editModalOverlay').classList.remove('open');
  editModalWorkId = null;
}

function saveEditModal() {
  const id = editModalWorkId;
  if (!id) return;
  const title    = document.getElementById('editModal-title').value.trim();
  const players  = document.getElementById('editModal-players').value.trim();
  const capacity = Math.max(0, parseInt(document.getElementById('editModal-capacity').value, 10) || 0);
  const time     = document.getElementById('editModal-time').value.trim();
  const author   = document.getElementById('editModal-author').value.trim();
  const price    = document.getElementById('editModal-price').value.trim();
  const tags     = document.getElementById('editModal-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const status      = document.getElementById('editModal-status').value;
  const scheduledAt = document.getElementById('editModal-scheduledAt').value.trim();
  const venue       = document.getElementById('editModal-venue').value.trim();
  const url         = document.getElementById('editModal-url').value.trim();
  const thumbnail   = document.getElementById('editModal-thumbnail').value.trim();
  const msgEl       = document.getElementById('editModal-msg');

  if (!title) { showMsg(msgEl, '作品名は必須です', 'err'); return; }

  const commit = () => {
    saveInfo(id, { title, players, time, author, price, tags, capacity, status, scheduledAt, venue, url, thumbnail });
    closeEditModal();
  };

  const current = (fbState.entries[id] || []).length;
  if (capacity > 0 && capacity < current) {
    openConfirm({
      title: '定員の確認',
      message: `現在のエントリー数（<strong>${current}名</strong>）より定員（<strong>${capacity}名</strong>）が少なくなっています。<br>超過している参加者は手動で取り消す必要があります。保存しますか？`,
      okLabel: '保存する', danger: false, onConfirm: commit,
    });
    return;
  }
  commit();
}

// ── サムネイルアップロード ────────────────────────────────
function updateThumbnailPreview(url) {
  const preview = document.getElementById('editModal-thumbnail-preview');
  const img     = document.getElementById('editModal-thumbnail-img');
  if (url && url.trim()) {
    img.src = url.trim();
    preview.style.display = 'block';
  } else {
    img.src = '';
    preview.style.display = 'none';
  }
}

function clearThumbnail() {
  document.getElementById('editModal-thumbnail').value = '';
  document.getElementById('editModal-thumbnail-file').value = '';
  updateThumbnailPreview('');
}

function handleThumbnailUpload(input) {
  const file = input.files[0];
  if (!file) return;

  const statusEl = document.getElementById('editModal-upload-status');
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = '処理中...';

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // 幅480pxにリサイズ（縦横比維持）
      const MAX_W = 480;
      const scale = img.width > MAX_W ? MAX_W / img.width : 1;
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      document.getElementById('editModal-thumbnail').value = dataUrl;
      updateThumbnailPreview(dataUrl);
      statusEl.style.color = 'var(--green)';
      statusEl.textContent = `✓ 完了（${Math.round(dataUrl.length / 1024)}KB）`;
      setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = ''; }, 4000);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// モーダル外クリック・Escで閉じる
document.getElementById('editModalOverlay').addEventListener('click', e => {
  if (e.target.id === 'editModalOverlay') closeEditModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('editModalOverlay').classList.contains('open')) closeEditModal();
});

// ── 作品情報操作 ──────────────────────────────────────────
function saveWorkInfo(id) {
  const title    = document.getElementById(`i-title-${id}`).value.trim();
  const players  = document.getElementById(`i-players-${id}`).value.trim();
  const time     = document.getElementById(`i-time-${id}`).value.trim();
  const author   = document.getElementById(`i-author-${id}`).value.trim();
  const price    = document.getElementById(`i-price-${id}`).value.trim();
  const tags     = document.getElementById(`i-tags-${id}`).value.split(',').map(t => t.trim()).filter(Boolean);
  const capacity = Math.max(0, parseInt(document.getElementById(`i-capacity-${id}`).value, 10) || 0);
  if (!title) return;

  const commit  = () => saveInfo(id, { title, players, time, author, price, tags, capacity }).then(() => clearDirty(id));
  const current = (fbState.entries[id] || []).length;
  if (capacity > 0 && capacity < current) {
    openConfirm({
      title: '定員の確認',
      message: `現在のエントリー数（<strong>${current}名</strong>）より定員（<strong>${capacity}名</strong>）が少なくなっています。<br>超過している参加者は手動で取り消す必要があります。保存しますか？`,
      okLabel: '保存する', danger: false, onConfirm: commit,
    });
    return;
  }
  commit();
}

function resetWorkInfo(id) {
  const wi = { ...fbState.workinfo };
  delete wi[id];
  fbSet('workinfo', Object.keys(wi).length ? wi : null);
}

function saveWorkCat(id) {
  fbSet('workcats', { ...fbState.workcats, [id]: document.getElementById(`i-cat-${id}`).value });
}

// ── 確認モーダル ──────────────────────────────────────────
let pendingAction = null;

function openConfirm({ title, message, okLabel, onConfirm, danger = true }) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').innerHTML = message;
  const okBtn = document.getElementById('confirmOk');
  okBtn.textContent = okLabel || '削除する';
  okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
  document.querySelector('#confirmModal .modal').classList.toggle('modal-safe', !danger);
  pendingAction = onConfirm;
  document.getElementById('confirmModal').classList.add('open');
  document.getElementById('confirmCancel').focus();
}

function closeConfirm() {
  document.getElementById('confirmModal').classList.remove('open');
  pendingAction = null;
}

document.getElementById('confirmOk').addEventListener('click', () => {
  const action = pendingAction; closeConfirm(); if (action) action();
});
document.getElementById('confirmModal').addEventListener('click', (e) => {
  if (e.target.id === 'confirmModal') closeConfirm();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('confirmModal').classList.contains('open')) closeConfirm();
});

// ── 全エントリーリセット ──────────────────────────────────
function clearAll() {
  openConfirm({
    title: '全エントリーをリセット',
    message: 'すべての作品のエントリーを削除します。<br>この操作は取り消せません。よろしいですか？',
    okLabel: 'リセットする',
    onConfirm: () => fbSet('entries', null),
  });
}

// ── 再募集 ───────────────────────────────────────────────
function askRerunWork(id) {
  const w     = getWorks().find(x => x.id === id);
  if (!w) return;
  const title = getInfo(w).title;
  const count = (fbState.entries[id] || []).length;
  openConfirm({
    title: '再募集の確認',
    message: `<strong>${esc(title)}</strong> を再募集します。<br>現在のエントリー（<strong>${count}名</strong>）は開催履歴として保存され、エントリーはリセットされます。<br>よろしいですか？`,
    okLabel: '再募集する', danger: false,
    onConfirm: () => rerunWork(id),
  });
}

function rerunWork(id) {
  const entries = fbState.entries[id] || [];
  const info    = getInfo(getWorks().find(x => x.id === id));
  // 開催履歴として保存
  const histRef = db.ref(`mm/history/${id}`);
  histRef.once('value').then(snap => {
    const prev = snap.val() ? (Array.isArray(snap.val()) ? snap.val() : Object.values(snap.val())) : [];
    prev.push({ savedAt: Date.now(), scheduledAt: info.scheduledAt, venue: info.venue, entries });
    histRef.set(prev);
  });
  // エントリーリセット・ステータスを募集中に戻す
  fbSet(`entries/${id}`, null);
  saveInfo(id, { ...info, status: 'recruiting', scheduledAt: '', venue: '' });
}

// ── 作品削除 ─────────────────────────────────────────────
function askDeleteWork(id) {
  const w     = getWorks().find(x => x.id === id);
  if (!w) return;
  const title = getInfo(w).title;
  const count = (fbState.entries[id] || []).length;
  const extra = count > 0 ? `<br>エントリー済みの <strong>${count}名</strong> の情報も一緒に削除されます。` : '';
  openConfirm({
    title: '作品を削除',
    message: `<strong>${esc(title)}</strong> を一覧から削除します。${extra}<br>この操作は取り消せません。よろしいですか？`,
    okLabel: '削除する', onConfirm: () => deleteWork(id),
  });
}

function deleteWork(id) {
  const wi = { ...fbState.workinfo }; delete wi[id];
  const wc = { ...fbState.workcats }; delete wc[id];
  fbSet(`entries/${id}`, null);
  fbSet('workinfo', Object.keys(wi).length ? wi : null);
  fbSet('workcats', Object.keys(wc).length ? wc : null);
  if (isCustomWork({ id })) {
    // カスタム作品は Firebase から完全削除
    fbSet(`customWorks/${id}`, null);
  } else {
    // デフォルト作品は削除済みリストに追加
    const del = [...getDeleted()]; if (!del.includes(id)) del.push(id);
    fbSet('deleted', del);
  }
}

// ── 新規作品追加 ──────────────────────────────────────────
function addNewWork() {
  const title    = document.getElementById('new-title').value.trim();
  const author   = document.getElementById('new-author').value.trim();
  const price    = document.getElementById('new-price').value.trim();
  const players  = document.getElementById('new-players').value.trim();
  const time     = document.getElementById('new-time').value.trim();
  const tags     = document.getElementById('new-tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const capacity = Math.max(0, parseInt(document.getElementById('new-capacity').value, 10) || 0);
  const msgEl    = document.getElementById('msg-new-work');

  if (!title) { showMsg(msgEl, '作品名は必須です', 'err'); return; }

  const id = 'cw_' + Date.now();
  const newWork = { title, author, price, players, time, tags, capacity };

  fbSet(`customWorks/${id}`, newWork).then(() => {
    // フォームをリセット
    ['new-title','new-author','new-price','new-players','new-time','new-tags'].forEach(k => document.getElementById(k).value = '');
    document.getElementById('new-capacity').value = '0';
    showMsg(msgEl, `「${title}」を追加しました`, 'ok');
  });
}

// ── ドラッグ&ドロップ並び替え ────────────────────────────
let adminDragSrcId = null;

function onAdminDragStart(e, id) {
  adminDragSrcId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.currentTarget.classList.add('dragging'), 0);
}

function onAdminDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const row = e.currentTarget;
  if (row.dataset.id !== adminDragSrcId) row.classList.add('drag-over');
}

function onAdminDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onAdminDragEnd(e) {
  e.currentTarget.draggable = false;
  document.querySelectorAll('#adminView .admin-card').forEach(el => {
    el.classList.remove('dragging', 'drag-over');
    el.draggable = false;
  });
}

function onAdminDrop(e, targetId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!adminDragSrcId || adminDragSrcId === targetId) return;

  const works = getWorks();
  const ids   = works.map(w => w.id);
  const from  = ids.indexOf(adminDragSrcId);
  const to    = ids.indexOf(targetId);
  if (from === -1 || to === -1) return;

  ids.splice(from, 1);
  ids.splice(to, 0, adminDragSrcId);
  fbSet('workOrder', ids);
}

// ── utils ─────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── 初期化 ────────────────────────────────────────────────
document.getElementById('headerPass').textContent = ADMIN_PASS;
