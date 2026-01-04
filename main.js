// =====================
// 設定
// =====================
const PROGRESS_KEY = 'vocabProgress_v3';
const INTERVALS = { 0: 1, 1: 3, 2: 7, 3: 14, 4: 30 };
const LEARNED_LEVEL_THRESHOLD = 3;

// =====================
// DOM
// =====================
const modeSelect = document.getElementById('modeSelect');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

const setupStatus = document.getElementById('setupStatus');
const sessionStatus = document.getElementById('sessionStatus');
const promptEl = document.getElementById('prompt');

const showAnswerBtn = document.getElementById('showAnswerBtn');
const answerBox = document.getElementById('answerBox');

const answerWord = document.getElementById('answerWord');
const answerPos = document.getElementById('answerPos');
const answerPhonetic = document.getElementById('answerPhonetic');
const answerMeaning = document.getElementById('answerMeaning');
const answerExample = document.getElementById('answerExample');
const answerPosition = document.getElementById('answerPosition');
const answerExtra = document.getElementById('answerExtra');

const okBtn = document.getElementById('okBtn');
const ngBtn = document.getElementById('ngBtn');
const messageEl = document.getElementById('message');

const learnedCountEl = document.getElementById('learnedCount');
const totalCountEl = document.getElementById('totalCount');
const learnedPctEl = document.getElementById('learnedPct');

// =====================
// 状態
// =====================
let words = [];
let progress = {};
let queue = [];
let idx = -1;

// =====================
// 日付（ローカル/JST）
// =====================
function pad2(n) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

// =====================
// 発音（音声データ不要）
// =====================
function speakWord(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  u.pitch = 1.0;
  window.speechSynthesis.speak(u);
}

// =====================
// 進捗
// =====================
function loadProgress() {
  try {
    progress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    progress = {};
  }
}
function saveProgress() {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

// =====================
// words 正規化（新フィールド対応）
// =====================
function normalizeWords(raw) {
  const out = [];
  for (const w of raw) {
    if (!w) continue;
    const word = String(w.word ?? '').trim();
    if (!word) continue;

    out.push({
      word,
      pos: String(w.pos ?? '').trim(),
      phonetic: String(w.phonetic ?? '').trim(),
      meaning: String(w.meaning ?? '').trim(),
      example: String(w.example ?? '').trim(),
      position: (w.position === null || w.position === undefined || w.position === '') ? null : Number(w.position),

      // ★追加フィールド（今回のヘッダ）
      collocation: String(w.collocation ?? '').trim(),
      roots: String(w.roots ?? '').trim(),
      inflection: String(w.inflection ?? '').trim(),
      related: String(w.related ?? '').trim(),

      // 将来の拡張
      extra: (w.extra && typeof w.extra === 'object') ? w.extra : {}
    });
  }
  return out;
}

function mergeProgress() {
  const t = todayStr();
  for (const w of words) {
    if (!progress[w.word]) {
      progress[w.word] = { level: 0, nextDue: t, lastReviewed: null, streakForgot: 0 };
    } else {
      if (typeof progress[w.word].streakForgot !== 'number') progress[w.word].streakForgot = 0;
      if (typeof progress[w.word].level !== 'number') progress[w.word].level = 0;
      if (!progress[w.word].nextDue) progress[w.word].nextDue = t;
    }
  }
  saveProgress();
}

// =====================
// 覚えた単語（Lv>=3）カウント
// =====================
function updateStats() {
  const total = words.length;
  let learned = 0;
  for (const w of words) {
    const p = progress[w.word];
    const lv = (p && typeof p.level === 'number') ? p.level : 0;
    if (lv >= LEARNED_LEVEL_THRESHOLD) learned += 1;
  }
  learnedCountEl.textContent = String(learned);
  totalCountEl.textContent = String(total);
  learnedPctEl.textContent = String(total > 0 ? Math.round((learned / total) * 100) : 0);
}

// =====================
// データロード
// =====================
async function loadWordsJson() {
  setupStatus.textContent = 'words.json 読み込み中...';
  try {
    const res = await fetch('words.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    words = normalizeWords(Array.isArray(data) ? data : []);
    setupStatus.textContent = `準備完了：${words.length}語（GitHubの最新 words.json）`;
  } catch (e) {
    console.error(e);
    words = [];
    setupStatus.textContent = 'words.json の読み込みに失敗しました。Actionsで生成できているか確認してください。';
  }
}

// =====================
// 出題キュー（優先＋同順位ランダム）
// =====================
function buildQueue() {
  const t = todayStr();
  const due = words.filter(w => {
    const p = progress[w.word];
    if (!p || !p.nextDue) return true;
    return p.nextDue <= t;
  });

  const withRand = due.map(w => {
    const p = progress[w.word] || {};
    const streak = (typeof p.streakForgot === 'number') ? p.streakForgot : 0;
    return { w, streak, r: Math.random() };
  });

  withRand.sort((a, b) => {
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.r - b.r;
  });

  return withRand.map(x => x.w);
}

// =====================
// UI
// =====================
function resetQuizUI() {
  promptEl.textContent = '';
  answerBox.style.display = 'none';
  messageEl.textContent = '';
  showAnswerBtn.disabled = true;
  okBtn.disabled = true;
  ngBtn.disabled = true;
}

function enableQuestionButtons() {
  showAnswerBtn.disabled = false;
  okBtn.disabled = true;
  ngBtn.disabled = true;
}

function showQuestion() {
  answerBox.style.display = 'none';
  messageEl.textContent = '';

  if (idx < 0 || idx >= queue.length) {
    sessionStatus.textContent = 'セッション終了（今日の復習対象はすべて完了）';
    resetQuizUI();
    return;
  }

  const q = queue[idx];
  sessionStatus.textContent = `復習対象：${queue.length}語（${idx + 1}/${queue.length}）`;

  promptEl.textContent =
    modeSelect.value === 'en-to-meaning'
      ? q.word
      : (q.meaning || '(意味未設定)');

  enableQuestionButtons();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ★新フィールド＋extraを「順番固定」で表示
function renderAllExtra(q) {
  if (!answerExtra) return;

  const items = [];

  function addKV(label, value) {
    const v = String(value ?? '').trim();
    if (!v) return;
    items.push(`<div class="kv-item"><span class="kv-key">${escapeHtml(label)}:</span> ${escapeHtml(v)}</div>`);
  }

  // 新ヘッダの順で表示
  addKV("常见搭配", q.collocation);
  addKV("词根词缀/词尾", q.roots);
  addKV("单词变形", q.inflection);
  addKV("相关词", q.related);

  // 既知以外の extra（将来増えた列）
  if (q.extra && typeof q.extra === 'object') {
    const keys = Object.keys(q.extra).sort((a, b) => a.localeCompare(b, 'zh'));
    for (const k of keys) addKV(k, q.extra[k]);
  }

  if (items.length === 0) {
    answerExtra.style.display = 'none';
    answerExtra.innerHTML = '';
    return;
  }

  answerExtra.style.display = '';
  answerExtra.innerHTML = items.join('');
}

// 答え表示＋自動発音（ボタン発音も残す）
function showAnswer() {
  if (idx < 0 || idx >= queue.length) return;
  const q = queue[idx];

  answerWord.innerHTML = `単語: <b id="wordTap">${escapeHtml(q.word)}</b> <button id="speakBtn">🔊</button>`;
  answerPos.textContent = q.pos ? `词性: ${q.pos}` : '';
  answerPhonetic.textContent = q.phonetic ? `音标: ${q.phonetic}` : '';
  answerMeaning.textContent = q.meaning ? `词义: ${q.meaning}` : '';
  answerExample.textContent = q.example ? `例句或情景: ${q.example}` : '';
  answerPosition.textContent = (q.position !== null && !Number.isNaN(q.position)) ? `单词量: ${q.position}` : '';

  answerPos.style.display = q.pos ? '' : 'none';
  answerPhonetic.style.display = q.phonetic ? '' : 'none';
  answerMeaning.style.display = q.meaning ? '' : 'none';
  answerExample.style.display = q.example ? '' : 'none';
  answerPosition.style.display = (q.position !== null && !Number.isNaN(q.position)) ? '' : 'none';

  renderAllExtra(q);

  answerBox.style.display = 'block';

  setTimeout(() => {
    const btn = document.getElementById('speakBtn');
    const wordTap = document.getElementById('wordTap');
    if (btn) btn.onclick = () => speakWord(q.word);
    if (wordTap) wordTap.onclick = () => speakWord(q.word);
  }, 0);

  okBtn.disabled = false;
  ngBtn.disabled = false;

  speakWord(q.word);
}

// =====================
// SRS 更新
// =====================
function markOK() {
  if (idx < 0 || idx >= queue.length) return;
  const q = queue[idx];
  const t = todayStr();
  const p = progress[q.word] || { level: 0, nextDue: t, lastReviewed: null, streakForgot: 0 };

  const prev = typeof p.level === 'number' ? p.level : 0;
  const nextLevel = Math.min(prev + 1, 4);

  p.level = nextLevel;
  p.lastReviewed = t;
  p.nextDue = addDays(t, INTERVALS[nextLevel]);
  p.streakForgot = 0;

  progress[q.word] = p;
  saveProgress();

  messageEl.textContent = `OK：レベル ${prev} → ${nextLevel}（次回 ${p.nextDue}）`;
  updateStats();

  idx += 1;
  showQuestion();
}

function markNG() {
  if (idx < 0 || idx >= queue.length) return;
  const q = queue[idx];
  const t = todayStr();
  const p = progress[q.word] || { level: 0, nextDue: t, lastReviewed: null, streakForgot: 0 };

  p.level = 0;
  p.lastReviewed = t;

  // レベル0は同日中でも due
  p.nextDue = t;

  const cur = (typeof p.streakForgot === 'number') ? p.streakForgot : 0;
  p.streakForgot = cur + 1;

  progress[q.word] = p;
  saveProgress();

  messageEl.textContent = `NG：レベル 0（同日中も再出題対象） / 连続忘れ: ${p.streakForgot}`;
  updateStats();

  idx += 1;
  showQuestion();
}

// =====================
// セッション開始
// =====================
function startSession() {
  if (!words || words.length === 0) {
    setupStatus.textContent = '単語データがありません。data/words.xlsx をアップしてActionsで words.json を生成してください。';
    return;
  }
  mergeProgress();
  updateStats();

  queue = buildQueue();
  idx = 0;

  if (queue.length === 0) {
    sessionStatus.textContent = '今日は復習期限の単語がありません（新規も含め0）';
    resetQuizUI();
    return;
  }

  showQuestion();
}

// =====================
// 進捗リセット
// =====================
function resetProgress() {
  if (!confirm('この端末の復習履歴（level/次回日付/连続忘れ）をすべて削除します。よろしいですか？')) return;
  localStorage.removeItem(PROGRESS_KEY);
  loadProgress();
  mergeProgress();
  updateStats();
  sessionStatus.textContent = '準備完了（復習履歴をリセットしました）';
  resetQuizUI();
}

// =====================
// イベント
// =====================
startBtn.addEventListener('click', startSession);
resetBtn.addEventListener('click', resetProgress);
showAnswerBtn.addEventListener('click', showAnswer);
okBtn.addEventListener('click', markOK);
ngBtn.addEventListener('click', markNG);

// =====================
// 初期化
// =====================
(async function init() {
  loadProgress();
  await loadWordsJson();
  mergeProgress();
  updateStats();
  sessionStatus.textContent = words.length > 0 ? '準備完了（セッション開始できます）' : '単語データなし';
  resetQuizUI();
})();
