// =====================
// 設定
// =====================
const PROGRESS_KEY = 'vocabProgress_v3';

// レベル→次回までの日数
const INTERVALS = { 0: 1, 1: 3, 2: 7, 3: 14, 4: 30 };

// 覚えた判定：レベル3以上（2週間以上）
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
// ユーティリティ
// =====================
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

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
// words 正規化
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
      position: (w.position === null || w.position === undefined || w.position === '') ? null : Number(w.position)
    });
  }
  return out;
}

/**
 * progress を words と整合させる（新規単語の初期化 + 旧データの拡張）
 * - streakForgot: 連続で「忘れてた」が押された回数（覚えてたで0に戻す）
 */
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

  if (learnedCountEl) learnedCountEl.textContent = String(learned);
  if (totalCountEl) totalCountEl.textContent = String(total);
  if (learnedPctEl) learnedPctEl.textContent = String(total > 0 ? Math.round((learned / total) * 100) : 0);
}

// =====================
// データロード（words.json）
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
// 出題キュー構築
// - due（nextDue<=今日）のみ
// - streakForgot が多いほど優先
// - 同点はランダム
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

// ★答え表示と同時に自動発音（ボタン発音も残す）
function showAnswer() {
  if (idx < 0 || idx >= queue.length) return;
  const q = queue[idx];

  answerWord.innerHTML = `単語: <b id="wordTap">${q.word}</b> <button id="speakBtn">🔊</button>`;
  answerPos.textContent = q.pos ? `词性: ${q.pos}` : '';
  answerPhonetic.textContent = q.phonetic ? `音标: ${q.phonetic}` : '';
  answerMeaning.textContent = q.meaning ? `词义: ${q.meaning}` : '';
  answerExample.textContent = q.example ? `例句: ${q.example}` : '';
  answerPosition.textContent = (q.position !== null && !Number.isNaN(q.position)) ? `单词量位置: ${q.position}` : '';

  answerPos.style.display = q.pos ? '' : 'none';
  answerPhonetic.style.display = q.phonetic ? '' : 'none';
  answerMeaning.style.display = q.meaning ? '' : 'none';
  answerExample.style.display = q.example ? '' : 'none';
  answerPosition.style.display = (q.position !== null && !Number.isNaN(q.position)) ? '' : 'none';

  answerBox.style.display = 'block';

  // ボタン/タップでの発音も維持
  setTimeout(() => {
    const btn = document.getElementById('speakBtn');
    const wordTap = document.getElementById('wordTap');
    if (btn) btn.onclick = () => speakWord(q.word);
    if (wordTap) wordTap.onclick = () => speakWord(q.word);
  }, 0);

  okBtn.disabled = false;
  ngBtn.disabled = false;

  // 自動発音（「答えを表示」クリックの直後なので通りやすい）
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

  // 一度「覚えてた」を押したら連続忘れ回数をリセット
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

  // 忘れたらレベル0
  p.level = 0;
  p.lastReviewed = t;

  // ★要求：レベル0は同日中でも出る
  // nextDue を「今日」にすることで、同日中も due 条件(nextDue<=today)を満たす
  p.nextDue = t;

  // ★連続忘れ回数を加算（優先出題に使う）
  const cur = (typeof p.streakForgot === 'number') ? p.streakForgot : 0;
  p.streakForgot = cur + 1;

  progress[q.word] = p;
  saveProgress();

  messageEl.textContent = `NG：レベル 0（同日中も再出題） / 連続忘れ: ${p.streakForgot}`;

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
  if (!confirm('この端末の復習履歴（level/次回日付/連続忘れ）をすべて削除します。よろしいですか？')) return;
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
