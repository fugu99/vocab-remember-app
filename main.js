// =====================
// 定数
// =====================
const STORAGE_KEY = 'vocabProgress_v1';
const INTERVALS = { 0: 1, 1: 3, 2: 7, 3: 14, 4: 30 };

// =====================
// ユーティリティ
// =====================
function today() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function shuffle(arr) {
  return arr.slice().sort(() => Math.random() - 0.5);
}

// =====================
// 発音（Web Speech API）
// =====================
function speakWord(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// =====================
// グローバル状態
// =====================
let words = [];
let progress = {};
let queue = [];
let index = 0;

// =====================
// DOM
// =====================
const modeSelect = document.getElementById('modeSelect');
const maxQ = document.getElementById('maxQuestions');
const posFrom = document.getElementById('posFrom');
const posTo = document.getElementById('posTo');
const startBtn = document.getElementById('startBtn');
const setupStatus = document.getElementById('setupStatus');

const sessionStatus = document.getElementById('sessionStatus');
const prompt = document.getElementById('prompt');
const showAnswerBtn = document.getElementById('showAnswerBtn');
const answerBox = document.getElementById('answerBox');
const answerWord = document.getElementById('answerWord');
const answerPhonetic = document.getElementById('answerPhonetic');
const answerMeaning = document.getElementById('answerMeaning');
const answerExample = document.getElementById('answerExample');
const okBtn = document.getElementById('okBtn');
const ngBtn = document.getElementById('ngBtn');
const message = document.getElementById('message');

// =====================
// 進捗管理
// =====================
function loadProgress() {
  progress = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

// =====================
// 単語ロード
// =====================
async function loadWords() {
  try {
    const res = await fetch('words.json');
    words = await res.json();
    loadProgress();

    const t = today();
    let maxPos = 1;

    words.forEach(w => {
      if (!progress[w.word]) {
        progress[w.word] = { level: 0, next: t };
      }
      if (w.position > maxPos) maxPos = w.position;
    });

    posTo.value = maxPos;
    saveProgress();
    sessionStatus.textContent = '準備完了';
  } catch {
    sessionStatus.textContent = 'words.json 読み込み失敗';
  }
}

// =====================
// セッション開始
// =====================
function startSession() {
  const from = Number(posFrom.value);
  const to = Number(posTo.value);
  const max = Number(maxQ.value);
  const t = today();

  let candidates = words.filter(w =>
    w.position >= from && w.position <= to &&
    progress[w.word].next <= t
  );

  if (candidates.length === 0) {
    candidates = words.filter(w => w.position >= from && w.position <= to);
    setupStatus.textContent = '復習期限の単語なし。範囲内から出題します。';
  }

  queue = shuffle(candidates).slice(0, max);
  index = 0;

  if (queue.length === 0) {
    sessionStatus.textContent = '出題単語なし';
    return;
  }

  next();
}

// =====================
// 出題
// =====================
function next() {
  answerBox.style.display = 'none';
  okBtn.disabled = ngBtn.disabled = true;
  showAnswerBtn.disabled = false;
  message.textContent = '';

  if (index >= queue.length) {
    sessionStatus.textContent = 'セッション終了';
    prompt.textContent = '';
    return;
  }

  const q = queue[index];
  sessionStatus.textContent = `問題 ${index + 1} / ${queue.length}`;

  prompt.textContent =
    modeSelect.value === 'en-to-meaning' ? q.word : q.meaning;
}

// =====================
// 答え表示（発音付き）
// =====================
function showAnswer() {
  const q = queue[index];

  answerWord.innerHTML =
    `単語: <b>${q.word}</b> <button id="speakBtn">🔊</button>`;
  answerPhonetic.textContent = q.phonetic ? `音标: ${q.phonetic}` : '';
  answerMeaning.textContent = q.meaning ? `意义: ${q.meaning}` : '';
  answerExample.textContent = q.example ? `例句: ${q.example}` : '';

  answerBox.style.display = 'block';

  document.getElementById('speakBtn').onclick = () => speakWord(q.word);

  okBtn.disabled = ngBtn.disabled = false;
}

// =====================
// 正解
// =====================
function markOK() {
  const q = queue[index];
  const p = progress[q.word];
  p.level = Math.min(p.level + 1, 4);
  p.next = addDays(today(), INTERVALS[p.level]);
  saveProgress();

  message.textContent = `次回: ${p.next}`;
  index++;
  next();
}

// =====================
// 不正解
// =====================
function markNG() {
  const q = queue[index];
  const p = progress[q.word];
  p.level = 0;
  p.next = addDays(today(), 1);
  saveProgress();

  message.textContent = `翌日再出題`;
  index++;
  next();
}

// =====================
// イベント
// =====================
startBtn.onclick = startSession;
showAnswerBtn.onclick = showAnswer;
okBtn.onclick = markOK;
ngBtn.onclick = markNG;

// =====================
loadWords();
