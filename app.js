(() => {
  'use strict';

  /* =========================================================
     常量与本地存储
     ========================================================= */

  const STORAGE = {
    settings: 'vocablab.settings.v1',
    progress: 'vocablab.progress.v1',
    customUnits: 'vocablab.customUnits.v1'
  };

  const DIR_LABELS = {
    en2zh: '英文 → 中文',
    zh2en: '中文 → 英文',
    fill: '句子填空',
    listen: '🔊 听音拼写'
  };

  const DEFAULT_SETTINGS = {
    theme: (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light',
    autoSpeak: false,
    sound: true,
    hideExamples: false,
    fontScale: 1,
    unitId: '',
    direction: 'en2zh',
    scope: 'all'
  };

  const els = {};
  let units = [];
  let wordMap = new Map();
  let customRawUnits = [];
  let settings = { ...DEFAULT_SETTINGS };
  let progress = { wrong: {}, mastered: {}, hard: {}, slashed: {} };
  let confirmResolver = null;
  let audioCtx = null;

  const state = {
    mode: 'normal',            // normal | speed | cards
    queue: [],
    qIndex: 0,
    score: 0,
    attempted: 0,
    answered: false,
    current: null,
    rating: null,
    ratingSnapshot: null,
    round: null,
    lastAnswerCorrect: null,
    history: [],
    currentSnapshot: null,
    currentSnapshotPushed: false,
    sessionWrong: new Set(),
    sessionLabel: '',
    startTime: 0,
    elapsedMs: 0,
    timerId: null,
    speedTimer: null,
    finished: false,
    finishWasSpeed: false,
    isEmpty: false,
    emptyAction: 'resetAll',
    pendingRestart: false,
    cardQueue: [],
    cardIndex: 0,
    cardKnown: 0,
    cardForgot: 0,
    cardFlipped: false,
    cardDone: false,
    cardForgotKeys: new Set(),
    lastSpokenCard: -1,
    browseOpen: false,
    browseShowSlashed: false,
    preBrowseMode: 'normal'
  };

  /* =========================================================
     工具函数
     ========================================================= */

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function normalizeKey(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .trim()
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, ' ');
  }

  function normalizeAnswer(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .trim()
      .replace(/[’‘]/g, "'")
      .replace(/[()]/g, '')
      .replace(/['"]/g, '')
      .replace(/[.,!?;:，。！？；：“”]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanWord(value) {
    return String(value == null ? '' : value)
      .replace(/\uFEFF/g, '')
      .trim()
      .replace(/^[-•·]\s*/, '')
      .replace(/^\d+[.)、]\s*/, '')
      .trim();
  }

  function deriveBlank(word) {
    return String(word).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim() || String(word).trim();
  }

  function clamp(number, min, max) {
    return Math.min(max, Math.max(min, number));
  }

  function blurActive() {
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') {
      active.blur();
    }
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function dateStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function csvEscape(value) {
    const text = String(value == null ? '' : value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function highlightText(text, target) {
    const source = String(text == null ? '' : text);
    const needle = String(target == null ? '' : target).trim();
    if (!needle) return escapeHtml(source);
    const parts = source.split(new RegExp(`(${escapeRegExp(needle)})`, 'ig'));
    return parts.map((part, index) => (
      index % 2 === 1 ? `<em>${escapeHtml(part)}</em>` : escapeHtml(part)
    )).join('');
  }

  function canFill(word) {
    if (!word.ex) return false;
    const target = word.blank || word.word;
    return word.ex.toLowerCase().includes(String(target).toLowerCase());
  }

  /* =========================================================
     词库构建
     ========================================================= */

  function mergeSettings(raw, base) {
    const result = { ...base };
    if (!raw || typeof raw !== 'object') return result;
    if (raw.theme === 'light' || raw.theme === 'dark') result.theme = raw.theme;
    ['autoSpeak', 'sound', 'hideExamples'].forEach(key => {
      if (typeof raw[key] === 'boolean') result[key] = raw[key];
    });
    if (Number.isFinite(Number(raw.fontScale))) {
      result.fontScale = clamp(Number(raw.fontScale), 0.85, 1.3);
    }
    if (typeof raw.unitId === 'string') result.unitId = raw.unitId;
    if (['en2zh', 'zh2en', 'fill', 'listen'].includes(raw.direction)) result.direction = raw.direction;
    if (['all', 'first', 'second', 'wrong', 'hard', 'cards'].includes(raw.scope)) result.scope = raw.scope;
    return result;
  }

  function sanitizeProgress(raw) {
    const out = { wrong: {}, mastered: {}, hard: {}, slashed: {} };
    if (!raw || typeof raw !== 'object') return out;
    if (raw.wrong && typeof raw.wrong === 'object') {
      Object.entries(raw.wrong).forEach(([key, value]) => {
        const count = Number(value);
        if (key && Number.isFinite(count) && count > 0) out.wrong[key] = Math.floor(count);
      });
    }
    ['mastered', 'hard', 'slashed'].forEach(category => {
      if (!raw[category] || typeof raw[category] !== 'object') return;
      Object.entries(raw[category]).forEach(([key, value]) => {
        if (key && value) out[category][key] = true;
      });
    });
    return out;
  }

  function prepareWord(raw, unitId, unitTitle, index) {
    if (!raw || typeof raw !== 'object') return null;
    let word = cleanWord(raw.word);
    let pos = String(raw.pos == null ? '' : raw.pos).replace(/^\(|\)$/g, '').trim();
    const ch = String(raw.ch == null ? '' : raw.ch).trim() ||
      String(raw.chinese == null ? '' : raw.chinese).trim();

    if (!pos) {
      const trailingPos = word.match(/^(.*?)\s*\(([a-zA-Z. ]+)\)\s*$/);
      if (trailingPos) {
        word = trailingPos[1].trim();
        pos = trailingPos[2].trim();
      }
    }
    if (!word || !ch) return null;

    const syn = String(raw.syn == null ? '' : raw.syn).trim() ||
      String(raw.synonym == null ? '' : raw.synonym).trim();
    const ex = String(raw.ex == null ? '' : raw.ex).trim() ||
      String(raw.example == null ? '' : raw.example).trim();
    const exCn = String(raw.exCn == null ? '' : raw.exCn).trim() ||
      String(raw.example_cn == null ? '' : raw.example_cn).trim() ||
      String(raw.exampleCn == null ? '' : raw.exampleCn).trim();
    const blank = String(raw.blank == null ? '' : raw.blank).trim() || deriveBlank(word);
    const alts = Array.isArray(raw.alts)
      ? raw.alts.map(item => String(item).trim()).filter(Boolean)
      : [];

    return {
      word,
      pos,
      syn,
      ch,
      ex,
      exCn,
      blank,
      alts,
      unitId,
      unitTitle,
      index,
      key: `${unitId}::${normalizeKey(word)}`
    };
  }

  function normalizeRawUnit(raw, index, isCustom) {
    const unitId = String(raw.id || `unit-${index + 1}`);
    const title = String(raw.title || `单元 ${index + 1}`).trim() || `单元 ${index + 1}`;
    const words = [];
    const usedKeys = new Set();

    (Array.isArray(raw.words) ? raw.words : []).forEach((rawWord, wordIndex) => {
      const word = prepareWord(rawWord, unitId, title, wordIndex);
      if (!word) return;
      let key = word.key;
      let suffix = 2;
      while (usedKeys.has(key)) {
        key = `${word.key}#${suffix}`;
        suffix++;
      }
      word.key = key;
      usedKeys.add(key);
      words.push(word);
    });

    return {
      id: unitId,
      title,
      subtitle: `${words.length} 个生词`,
      custom: !!isCustom,
      words
    };
  }

  function rebuildUnits() {
    const builtin = Array.isArray(window.VOCAB_UNITS) ? window.VOCAB_UNITS : [];
    const raws = [
      ...builtin.map((unit, index) => ({
        ...unit,
        id: String(unit.id || `unit-${index + 1}`),
        custom: false
      })),
      ...customRawUnits.map((unit, index) => ({
        ...unit,
        id: String(unit.id || `custom-${index + 1}`),
        custom: true
      }))
    ];

    const usedIds = new Set();
    units = raws.map((raw, index) => {
      let id = String(raw.id || `unit-${index + 1}`);
      if (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      return normalizeRawUnit({ ...raw, id }, index, !!raw.custom);
    });

    wordMap = new Map();
    units.forEach(unit => {
      unit.words.forEach(word => wordMap.set(word.key, word));
    });
  }

  function ensureValidSelection() {
    if (!units.length) {
      settings.unitId = '';
      return;
    }
    if (settings.unitId === 'all') {
      if (units.length < 2) settings.unitId = units[0].id;
    } else if (!units.some(unit => unit.id === settings.unitId)) {
      settings.unitId = units[0].id;
    }
    if (!['en2zh', 'zh2en', 'fill', 'listen'].includes(settings.direction)) {
      settings.direction = 'en2zh';
    }
    if (!['all', 'first', 'second', 'wrong', 'hard', 'cards'].includes(settings.scope)) {
      settings.scope = 'all';
    }
  }

  function activeUnits() {
    if (settings.unitId === 'all') return units;
    return units.filter(unit => unit.id === settings.unitId);
  }

  function allWords() {
    return units.flatMap(unit => unit.words);
  }

  function activeWords() {
    return activeUnits()
      .flatMap(unit => unit.words)
      .filter(word => !progress.slashed[word.key]);
  }

  function buildQueue() {
    let words = activeWords().slice();
    const scope = settings.scope;

    if (scope === 'first' || scope === 'second') {
      const half = Math.ceil(words.length / 2);
      words = scope === 'first' ? words.slice(0, half) : words.slice(half);
    }

    if (scope === 'wrong') {
      words = words.filter(word => (progress.wrong[word.key] || 0) > 0);
      words.sort((a, b) => {
        const diff = (progress.wrong[b.key] || 0) - (progress.wrong[a.key] || 0);
        return diff || Math.random() - 0.5;
      });
    } else if (scope === 'hard') {
      words = words.filter(word => progress.hard[word.key]);
      shuffle(words);
    } else {
      shuffle(words);
    }

    if (settings.direction === 'fill') {
      words = words.filter(canFill);
    }

    return words;
  }

  function speedPool() {
    return shuffle(buildQueue());
  }

  function cloneProgressState(source) {
    return {
      wrong: { ...source.wrong },
      mastered: { ...source.mastered },
      hard: { ...source.hard },
      slashed: { ...source.slashed }
    };
  }

  function cloneRoundState(round) {
    if (!round) return null;
    const copy = new Map();
    round.forEach((entry, key) => {
      copy.set(key, {
        word: entry.word,
        streak: entry.streak,
        done: entry.done
      });
    });
    return copy;
  }

  function captureSessionSnapshot(question) {
    return {
      queue: state.queue.slice(),
      qIndex: state.qIndex,
      score: state.score,
      attempted: state.attempted,
      sessionWrong: Array.from(state.sessionWrong),
      round: cloneRoundState(state.round),
      progress: cloneProgressState(progress),
      question
    };
  }

  function restoreSessionSnapshot(snapshot) {
    state.queue = snapshot.queue.slice();
    state.qIndex = snapshot.qIndex;
    state.score = snapshot.score;
    state.attempted = snapshot.attempted;
    state.sessionWrong = new Set(snapshot.sessionWrong);
    state.round = cloneRoundState(snapshot.round);
    progress = cloneProgressState(snapshot.progress);
    state.finished = false;
    state.finishWasSpeed = false;
    state.isEmpty = false;
    state.answered = false;
    state.current = null;
    state.rating = null;
    state.ratingSnapshot = null;
    state.lastAnswerCorrect = null;
    state.currentSnapshot = null;
    state.currentSnapshotPushed = false;
    saveProgress();
  }

  function rememberCurrentQuestion() {
    if (state.mode !== 'normal' || state.currentSnapshotPushed || !state.currentSnapshot) return;
    state.history.push(state.currentSnapshot);
    state.currentSnapshotPushed = true;
    updatePrevButton();
  }

  function updatePrevButton() {
    const enabled = state.mode === 'normal' && !state.isEmpty && state.history.length > 0;
    if (els.btnPrev) els.btnPrev.disabled = !enabled;
  }

  function updateRuleBar() {
    if (!els.ruleBar) return;
    els.ruleBar.hidden = !(state.mode === 'normal' && !state.finished && !state.isEmpty);
  }

  function goToPreviousQuestion() {
    if (state.mode !== 'normal' || !state.history.length) return;
    clearSpeedTimer();
    const snapshot = state.history.pop();
    restoreSessionSnapshot(snapshot);
    showQuizView();
    syncControls();
    showQuestion(snapshot.question);
    updatePrevButton();
  }

  function allRoundDone() {
    return !!state.round && Array.from(state.round.values()).every(entry => entry.done);
  }

  function requeueWord(word) {
    if (!state.round || !state.round.has(word.key)) return;
    for (let i = state.qIndex + 1; i < state.queue.length; i++) {
      if (state.queue[i].key === word.key) return;
    }
    state.queue.push(word);
  }

  function removePendingWord(key) {
    for (let i = state.queue.length - 1; i > state.qIndex; i--) {
      if (state.queue[i].key === key) state.queue.splice(i, 1);
    }
  }

  function doneRoundCount() {
    if (!state.round) return 0;
    let count = 0;
    state.round.forEach(entry => {
      if (entry.done) count++;
    });
    return count;
  }

  /* =========================================================
     存档
     ========================================================= */

  function saveSettings() {
    writeJson(STORAGE.settings, settings);
  }

  function saveProgress() {
    writeJson(STORAGE.progress, progress);
  }

  function saveCustomUnits() {
    writeJson(STORAGE.customUnits, customRawUnits);
  }

  /* =========================================================
     初始化
     ========================================================= */

  function cacheEls() {
    [
      'brandSub', 'btnFontMinus', 'btnFontPlus', 'btnTheme', 'btnSound', 'btnExample',
      'btnBrowse', 'btnWrongBook', 'btnSpeed', 'btnSpeedHelp', 'btnSettings', 'unitChips', 'btnAddUnit',
      'directionSelect', 'scopeSelect', 'poolNote', 'scoreLabel', 'remainingLabel',
      'accuracyLabel', 'timeLabel', 'progressFill', 'ruleBar', 'btnRuleHelp', 'quizView', 'wordCard', 'questionTag',
      'btnHard', 'btnSlash', 'wordDisplay', 'synDisplay', 'btnSpeak', 'wordMeta', 'exampleDisplay',
      'exampleCnDisplay', 'stageHint', 'optionsGrid', 'listenPanel', 'answerInput',
      'btnReplay', 'btnSubmitAnswer', 'inputFeedback', 'resultPanel', 'resultMark',
      'resultText', 'resultDetail', 'rateRow', 'rateHint', 'btnForgot', 'btnKnown', 'btnNext',
      'emptyState', 'emptyTitle', 'emptyText', 'btnEmptyReset', 'finishPanel', 'finishIcon',
      'finishTitle', 'finishSub', 'finishStats', 'btnFinishAgain', 'btnFinishWrong',
      'btnFinishBrowse', 'browseView', 'browseSub', 'btnCloseBrowse', 'browseSearch',
      'browseShowSlashed', 'browseList', 'cardView', 'cardMetaLeft', 'cardMetaRight',
      'flipCard', 'cardFrontWord', 'cardFrontPos', 'btnCardSpeak', 'cardBackCh',
      'cardBackSyn', 'cardBackEx', 'cardBackExCn', 'cardRate', 'btnCardForgot',
      'btnCardKnown', 'cardDone', 'cardDoneStats', 'btnCardAgain', 'btnCardReviewForgot',
      'btnCardExit', 'footer', 'shortcutHint', 'btnPrev', 'btnRestart', 'modalOverlay', 'modalTitle',
      'modalBody', 'modalClose', 'confirmOverlay', 'confirmTitle', 'confirmText',
      'confirmOk', 'confirmCancel', 'toastWrap', 'importFile'
    ].forEach(id => {
      els[id] = byId(id);
    });
  }

  function init() {
    cacheEls();

    settings = mergeSettings(readJson(STORAGE.settings, {}), DEFAULT_SETTINGS);
    progress = sanitizeProgress(readJson(STORAGE.progress, {}));

    const rawCustom = readJson(STORAGE.customUnits, []);
    customRawUnits = Array.isArray(rawCustom)
      ? rawCustom.filter(isValidCustomRawUnit).map((unit, index) => ({
        ...unit,
        id: String(unit.id || `custom-${index + 1}`)
      }))
      : [];

    rebuildUnits();
    ensureValidSelection();
    applyTheme();
    applyScale();

    renderUnitChips();
    syncControls();
    updateBrand();
    updateSoundBtn();
    updateExampleBtn();
    bindEvents();

    if (settings.scope === 'cards') startCards();
    else startSession();
  }

  function isValidCustomRawUnit(unit) {
    return !!unit && typeof unit === 'object' &&
      typeof unit.title === 'string' &&
      Array.isArray(unit.words);
  }

  /* =========================================================
     界面同步
     ========================================================= */

  function updateBrand() {
    if (!units.length) {
      els.brandSub.textContent = '龙氏集团单词训练室 · 词库为空，请导入单元';
      document.title = 'BEN GEGE';
      return;
    }
    if (settings.unitId === 'all') {
      const total = units.reduce((sum, unit) => sum + unit.words.length, 0);
      els.brandSub.textContent = `龙氏集团单词训练室 · 全部单元 · ${total} 个生词`;
      document.title = `全部单元 · BEN GEGE`;
      return;
    }
    const unit = units.find(item => item.id === settings.unitId) || units[0];
    els.brandSub.textContent = `龙氏集团单词训练室 · ${unit.title} · ${unit.words.length} 个生词`;
    document.title = `${unit.title} · BEN GEGE`;
  }

  function renderUnitChips() {
    els.unitChips.innerHTML = '';
    if (!units.length) {
      const empty = document.createElement('span');
      empty.className = 'strip-label';
      empty.textContent = '暂无单元';
      els.unitChips.appendChild(empty);
      return;
    }

    const makeChip = (id, title, count) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'unit-chip' + (settings.unitId === id ? ' active' : '');
      button.dataset.unitId = id;
      button.innerHTML = `<span>${escapeHtml(title)}</span><span class="count">${count}</span>`;
      els.unitChips.appendChild(button);
    };

    if (units.length > 1) {
      makeChip('all', '全部单元', units.reduce((sum, unit) => sum + unit.words.length, 0));
    }
    units.forEach(unit => makeChip(unit.id, unit.title, unit.words.length));
  }

  function applyTheme() {
    const dark = settings.theme === 'dark';
    document.body.classList.toggle('dark', dark);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = dark ? '#111614' : '#f4f1e9';
    updateThemeBtn();
  }

  function applyScale() {
    document.documentElement.style.setProperty('--scale', String(settings.fontScale));
  }

  function updateThemeBtn() {
    const dark = settings.theme === 'dark';
    els.btnTheme.innerHTML = dark ? '☀️ <span>浅色</span>' : '🌙 <span>深色</span>';
    els.btnTheme.title = dark ? '切换到浅色模式' : '切换到深色模式';
    els.btnTheme.setAttribute('aria-label', els.btnTheme.title);
    els.btnTheme.classList.toggle('active', dark);
  }

  function updateSoundBtn() {
    els.btnSound.innerHTML = settings.autoSpeak ? '🔊 <span>发音</span>' : '🔇 <span>发音</span>';
    els.btnSound.classList.toggle('active', settings.autoSpeak);
    els.btnSound.title = settings.autoSpeak ? '自动发音：开' : '自动发音：关';
  }

  function updateExampleBtn() {
    els.btnExample.innerHTML = `${settings.hideExamples ? '🚫' : '💡'} <span>提示</span>`;
    els.btnExample.classList.toggle('active', settings.hideExamples);
    els.btnExample.title = settings.hideExamples
      ? '答题时已隐藏 synonym 和例句（点击恢复）'
      : '答题时显示 synonym 和例句（点击隐藏）';
    els.btnExample.setAttribute('aria-label', els.btnExample.title);
  }

  function syncControls() {
    els.directionSelect.value = settings.direction;
    els.scopeSelect.value = settings.scope;

    const speed = state.mode === 'speed';
    const cards = state.mode === 'cards';

    els.directionSelect.disabled = speed || cards;
    els.scopeSelect.disabled = speed;
    els.btnAddUnit.disabled = speed;
    els.unitChips.querySelectorAll('.unit-chip').forEach(chip => {
      chip.disabled = speed;
    });

    els.btnSpeed.disabled = cards;
    els.btnSpeed.classList.toggle('active', speed);
    els.btnSpeed.innerHTML = speed
      ? '⏹ <span>退出速通</span>'
      : '⚡ <span>速通</span>';

    els.btnBrowse.classList.toggle('active', state.browseOpen);

    els.btnFontMinus.disabled = settings.fontScale <= 0.851;
    els.btnFontPlus.disabled = settings.fontScale >= 1.299;

    document.body.classList.toggle('speed-mode', speed);
    document.body.classList.toggle('cards-mode', cards);

    updateRuleBar();
    updateSoundBtn();
    updateThemeBtn();
    updateExampleBtn();
    updatePrevButton();
  }

  function adjustFont(delta) {
    const next = clamp(Math.round((settings.fontScale + delta) * 100) / 100, 0.85, 1.3);
    if (next === settings.fontScale) return;
    settings.fontScale = next;
    saveSettings();
    applyScale();
    syncControls();
    requestAnimationFrame(fitWordDisplay);
    const label = byId('fontScaleLabel');
    if (label) label.textContent = `${Math.round(settings.fontScale * 100)}%`;
  }

  function applyExampleVisibility() {
    if (!state.current || state.mode !== 'normal') return;
    const dir = state.current.direction;
    els.wordCard.classList.toggle(
      'hide-extra',
      settings.hideExamples && (dir === 'en2zh' || dir === 'zh2en')
    );
  }

  function updateStats() {
    const scoreCaption = els.scoreLabel.nextElementSibling;
    if (scoreCaption) {
      scoreCaption.textContent = state.mode === 'cards' ? '学会' : '答对';
    }
    if (state.mode === 'cards') {
      const rated = state.cardKnown + state.cardForgot;
      els.scoreLabel.textContent = String(state.cardKnown);
      els.remainingLabel.textContent = String(Math.max(0, state.cardQueue.length - state.cardIndex));
      els.accuracyLabel.textContent = rated ? `${Math.round(state.cardKnown / rated * 100)}%` : '—';
    } else if (state.mode === 'speed') {
      els.scoreLabel.textContent = String(state.score);
      let remaining = 0;
      if (!state.finished && !state.isEmpty) {
        remaining = Math.max(
          0,
          state.queue.length - state.qIndex - (state.answered ? 1 : 0)
        );
      }
      els.remainingLabel.textContent = String(remaining);
      els.accuracyLabel.textContent = state.attempted
        ? `${Math.round(state.score / state.attempted * 100)}%`
        : '—';
    } else {
      const total = state.round ? state.round.size : 0;
      const done = doneRoundCount();
      const remaining = (state.finished || state.isEmpty)
        ? 0
        : Math.max(0, total - done);
      els.scoreLabel.textContent = String(state.score);
      els.remainingLabel.textContent = String(remaining);
      els.accuracyLabel.textContent = state.attempted
        ? `${Math.round(state.score / state.attempted * 100)}%`
        : '—';
    }
    updateTimerLabel();
  }

  function updateTimerLabel() {
    if (!state.startTime || state.isEmpty) {
      els.timeLabel.textContent = '0:00';
      return;
    }
    const ms = state.finished ? state.elapsedMs : Date.now() - state.startTime;
    els.timeLabel.textContent = formatTime(ms);
  }

  function updateProgress() {
    let percent = 0;
    if (state.isEmpty) {
      percent = 0;
    } else if (state.mode === 'cards') {
      percent = state.cardQueue.length
        ? Math.round(state.cardIndex / state.cardQueue.length * 100)
        : 0;
    } else if (state.mode === 'speed') {
      if (state.queue.length) {
        const done = Math.min(
          state.qIndex + (state.answered ? 1 : 0),
          state.queue.length
        );
        percent = Math.round(done / state.queue.length * 100);
      }
    } else {
      const total = state.round ? state.round.size : 0;
      percent = total ? Math.round(doneRoundCount() / total * 100) : 0;
    }
    if (state.finished && !state.isEmpty) percent = 100;

    els.progressFill.style.width = `${percent}%`;
    const bar = els.progressFill.parentElement;
    if (bar) bar.setAttribute('aria-valuenow', String(percent));
  }

  function updatePoolNote() {
    if (state.mode === 'cards') {
      els.poolNote.textContent = `🃏 ${state.cardQueue.length} 张卡`;
      return;
    }
    if (state.mode === 'speed') {
      els.poolNote.textContent = state.queue.length
        ? `本轮 ${state.queue.length} 词${state.sessionLabel ? ` · ${state.sessionLabel}` : ''}`
        : `本范围 ${activeWords().length} 词`;
      return;
    }
    const total = state.round ? state.round.size : 0;
    els.poolNote.textContent = total
      ? `本轮 ${total} 词${state.sessionLabel ? ` · ${state.sessionLabel}` : ''}`
      : `本范围 ${activeWords().length} 词`;
  }

  function updateFooterHint() {
    const kbd = key => `<kbd>${key}</kbd>`;
    let hint;
    if (state.mode === 'cards') {
      hint = `空格 / 点击翻面 · ${kbd('1')} 没记住 · ${kbd('2')} 学会了 · ${kbd('S')} 发音`;
    } else if (state.mode === 'speed') {
      const canSpeak = settings.direction === 'en2zh' || settings.direction === 'listen';
      hint = `⚡ 速通中：${kbd('1')}–${kbd('4')} 选择 · 答完自动下一题${canSpeak ? ` · ${kbd('S')} 发音` : ''}`;
    } else if (settings.direction === 'listen') {
      hint = `输入答案后按 ${kbd('Enter')} 提交 · ${kbd('←')} 上一题 · ${kbd('S')} 重听发音`;
    } else {
      const canSpeak = settings.direction === 'en2zh';
      hint = `快捷键：${kbd('1')}–${kbd('4')} 选择 · ${kbd('Enter')} 下一题 · ${kbd('←')} 上一题${canSpeak ? ` · ${kbd('S')} 发音` : ''} · ${kbd('H')} 标记难词`;
    }
    els.shortcutHint.innerHTML = hint;
    els.btnRestart.textContent = state.mode === 'cards'
      ? '重开翻卡'
      : state.mode === 'speed' ? '重开速通' : '重开本轮';
  }

  function showQuizView() {
    state.browseOpen = false;
    els.browseView.hidden = true;
    els.cardView.hidden = true;
    els.quizView.hidden = false;
    document.body.classList.remove('browse-open');
    document.body.classList.remove('cards-mode');
    els.btnBrowse.classList.remove('active');
  }

  function showCardView() {
    state.browseOpen = false;
    els.browseView.hidden = true;
    els.quizView.hidden = true;
    els.cardView.hidden = false;
    document.body.classList.remove('browse-open');
    document.body.classList.add('cards-mode');
    els.btnBrowse.classList.remove('active');
  }

  /* =========================================================
     计时与模式
     ========================================================= */

  function startTimer() {
    stopTimer();
    state.timerId = setInterval(updateTimerLabel, 1000);
  }

  function stopTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function clearSpeedTimer() {
    if (state.speedTimer) {
      clearTimeout(state.speedTimer);
      state.speedTimer = null;
    }
  }

  function scheduleSpeedNext(delay) {
    clearSpeedTimer();
    state.speedTimer = setTimeout(() => {
      state.speedTimer = null;
      if (state.mode !== 'speed' || state.finished) return;
      if (overlayOpen() || state.browseOpen) return;
      nextQuestion();
    }, delay);
  }

  function resumeSpeedIfNeeded() {
    if (state.mode !== 'speed' || !state.answered || state.finished || state.isEmpty) return;
    if (overlayOpen() || state.browseOpen) return;
    if (!state.speedTimer) scheduleSpeedNext(700);
  }

  function overlayOpen() {
    return els.modalOverlay.classList.contains('open') ||
      els.confirmOverlay.classList.contains('open');
  }

  function pauseSpeedTimer() {
    clearSpeedTimer();
  }

  function startSession(options) {
    const opts = options || {};
    clearSpeedTimer();
    stopTimer();

    if (settings.scope === 'cards') {
      settings.scope = 'all';
      saveSettings();
    }

    state.mode = 'normal';
    state.queue = opts.words ? shuffle(opts.words.slice()) : buildQueue();
    state.round = new Map();
    state.queue.forEach(word => {
      if (!state.round.has(word.key)) {
        state.round.set(word.key, { word, streak: 0, done: false });
      }
    });
    state.history = [];
    state.currentSnapshot = null;
    state.currentSnapshotPushed = false;
    state.lastAnswerCorrect = null;
    state.qIndex = 0;
    state.score = 0;
    state.attempted = 0;
    state.answered = false;
    state.current = null;
    state.rating = null;
    state.ratingSnapshot = null;
    state.sessionWrong = new Set();
    state.sessionLabel = opts.label || '';
    state.startTime = Date.now();
    state.elapsedMs = 0;
    state.finished = false;
    state.finishWasSpeed = false;
    state.isEmpty = false;
    state.emptyAction = 'resetAll';
    state.pendingRestart = false;

    showQuizView();
    syncControls();
    updateFooterHint();
    els.finishPanel.hidden = true;
    els.emptyState.hidden = true;
    els.resultPanel.hidden = true;
    els.listenPanel.hidden = true;
    els.optionsGrid.innerHTML = '';

    if (!state.queue.length) {
      showEmpty();
      return;
    }

    startTimer();
    updateStats();
    updateProgress();
    updatePoolNote();
    updateBrand();
    showQuestion();

    if (window.scrollY > 60) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function startSpeed() {
    if (state.mode === 'speed') {
      startSession();
      toast('已退出速通');
      return;
    }
    clearSpeedTimer();
    stopTimer();

    state.mode = 'speed';
    state.queue = speedPool();
    state.round = null;
    state.history = [];
    state.currentSnapshot = null;
    state.currentSnapshotPushed = false;
    state.lastAnswerCorrect = null;
    state.qIndex = 0;
    state.score = 0;
    state.attempted = 0;
    state.answered = false;
    state.current = null;
    state.rating = null;
    state.ratingSnapshot = null;
    state.sessionWrong = new Set();
    state.sessionLabel = '速通';
    state.startTime = Date.now();
    state.elapsedMs = 0;
    state.finished = false;
    state.finishWasSpeed = false;
    state.isEmpty = false;
    state.pendingRestart = false;

    showQuizView();
    syncControls();
    updateFooterHint();
    els.finishPanel.hidden = true;
    els.emptyState.hidden = true;
    els.resultPanel.hidden = true;
    els.listenPanel.hidden = true;
    els.optionsGrid.innerHTML = '';

    if (!state.queue.length) {
      showEmpty();
      return;
    }

    startTimer();
    updateStats();
    updateProgress();
    updatePoolNote();
    toast('⚡ 速通开始：当前范围，答完自动下一题');

    if (window.scrollY > 60) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    showQuestion();
  }

  function startCards() {
    clearSpeedTimer();
    stopTimer();

    state.mode = 'cards';
    state.cardQueue = shuffle(activeWords().slice());
    state.round = null;
    state.history = [];
    state.currentSnapshot = null;
    state.currentSnapshotPushed = false;
    state.lastAnswerCorrect = null;
    state.cardIndex = 0;
    state.cardKnown = 0;
    state.cardForgot = 0;
    state.cardFlipped = false;
    state.cardDone = false;
    state.cardForgotKeys = new Set();
    state.lastSpokenCard = -1;
    state.startTime = Date.now();
    state.elapsedMs = 0;
    state.finished = false;
    state.finishWasSpeed = false;
    state.isEmpty = false;
    state.pendingRestart = false;
    state.score = 0;
    state.attempted = 0;
    state.sessionWrong = new Set();
    state.sessionLabel = '';
    state.current = null;

    showCardView();
    syncControls();
    updateFooterHint();

    els.cardDone.hidden = true;
    els.flipCard.hidden = false;
    els.cardRate.hidden = true;
    els.flipCard.classList.remove('flipped');

    if (!state.cardQueue.length) {
      showCardEmpty();
      return;
    }

    startTimer();
    renderCard();
    updateStats();
    updateProgress();
    updatePoolNote();
    updateBrand();

    if (window.scrollY > 60) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function restartForSelection() {
    if (settings.scope === 'cards') startCards();
    else startSession();
  }

  /* =========================================================
     题目
     ========================================================= */

  function makeQuestion(word) {
    const direction = settings.direction;
    const type = direction === 'en2zh' ? 'chinese' : 'english';
    const optionText = item => (type === 'chinese' ? item.ch : (item.blank || item.word));
    const correct = optionText(word);
    const localCandidates = activeWords().map(optionText);

    let distractors = pickDistractors(correct, localCandidates, 3);
    if (distractors.length < 3) {
      const already = new Set(distractors.map(normalizeKey));
      const globalCandidates = allWords()
        .map(optionText)
        .filter(item => !already.has(normalizeKey(item)));
      const extra = pickDistractors(correct, globalCandidates, 3 - distractors.length);
      distractors = distractors.concat(extra);
    }

    const options = shuffle([correct, ...distractors]);
    return {
      word,
      direction,
      options,
      correctIndex: options.indexOf(correct)
    };
  }

  function pickDistractors(correct, candidates, count) {
    const seen = new Set([normalizeKey(correct)]);
    const picked = [];
    for (const candidate of shuffle(candidates.slice())) {
      const text = String(candidate == null ? '' : candidate).trim();
      const key = normalizeKey(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      picked.push(text);
      if (picked.length >= count) break;
    }
    return picked;
  }

  function showQuestion(restoredQuestion) {
    if (state.mode === 'cards') return;
    clearSpeedTimer();
    blurActive();
    cancelSpeech();

    if (!state.queue.length) {
      showEmpty();
      return;
    }
    if (state.qIndex >= state.queue.length) {
      finishSession();
      return;
    }

    const word = restoredQuestion ? restoredQuestion.word : state.queue[state.qIndex];
    const question = restoredQuestion || makeQuestion(word);
    state.current = question;
    state.answered = false;
    state.rating = null;
    state.ratingSnapshot = null;
    state.lastAnswerCorrect = null;
    state.currentSnapshot = captureSessionSnapshot(question);
    state.currentSnapshotPushed = false;
    state.isEmpty = false;

    els.wordCard.hidden = false;
    els.optionsGrid.innerHTML = '';
    els.optionsGrid.hidden = false;
    els.listenPanel.hidden = true;
    els.resultPanel.hidden = true;
    els.finishPanel.hidden = true;
    els.emptyState.hidden = true;
    els.inputFeedback.textContent = '';
    els.inputFeedback.className = 'feedback';
    els.answerInput.value = '';
    els.answerInput.disabled = false;
    els.btnSubmitAnswer.disabled = false;
    els.btnHard.disabled = false;
    els.btnSlash.disabled = false;
    els.btnSpeak.hidden = false;
    updatePrevButton();
    updateRuleBar();

    els.questionTag.textContent = state.mode === 'speed'
      ? `⚡ 速通 · ${DIR_LABELS[question.direction]}`
      : DIR_LABELS[question.direction];

    renderQuestionContent(question);
    updateHardButton();
    requestAnimationFrame(fitWordDisplay);

    els.wordCard.classList.remove('enter');
    void els.wordCard.offsetWidth;
    els.wordCard.classList.add('enter');

    if (question.direction === 'listen') {
      els.optionsGrid.hidden = true;
      els.listenPanel.hidden = false;
      updateStats();
      updateProgress();
      updatePoolNote();
      updateFooterHint();
      setTimeout(() => {
        if (state.current === question && !state.answered) {
          els.answerInput.focus({ preventScroll: true });
          speak(word.word);
        }
      }, 160);
    } else {
      renderOptions(question);
      els.listenPanel.hidden = true;
      updateStats();
      updateProgress();
      updatePoolNote();
      updateFooterHint();
      if (settings.autoSpeak && question.direction === 'en2zh') {
        setTimeout(() => {
          if (state.current === question && !state.answered) speak(word.word);
        }, 220);
      }
    }
  }

  function renderQuestionContent(question) {
    const word = question.word;
    const direction = question.direction;

    els.wordDisplay.className = 'word-display';
    els.wordDisplay.style.fontSize = '';
    els.wordDisplay.style.whiteSpace = '';
    els.wordDisplay.style.maxWidth = '';
    els.synDisplay.hidden = true;
    els.synDisplay.innerHTML = '';
    els.synDisplay.style.fontSize = '';
    els.exampleDisplay.hidden = false;
    els.exampleCnDisplay.hidden = false;
    els.exampleDisplay.textContent = '';
    els.exampleCnDisplay.textContent = '';
    els.stageHint.className = 'stage-hint';

    const posHtml = word.pos ? `<span class="pos-badge">${escapeHtml(word.pos)}</span>` : '';
    els.wordMeta.innerHTML = `${posHtml}<span class="unit-badge">${escapeHtml(word.unitTitle)}</span>`;

    if (direction === 'en2zh') {
      els.wordDisplay.textContent = word.word;
      if (word.syn) {
        els.synDisplay.innerHTML = `<span class="syn-label">近义</span>${escapeHtml(word.syn)}`;
        els.synDisplay.hidden = false;
      }
      if (word.ex) {
        els.exampleDisplay.innerHTML = highlightText(word.ex, word.word);
      } else {
        els.exampleDisplay.hidden = true;
      }
      els.exampleCnDisplay.hidden = true;
      els.stageHint.textContent = '请选择正确的中文意思';
      els.btnSpeak.hidden = false;
    } else if (direction === 'zh2en') {
      els.wordDisplay.textContent = word.ch;
      els.wordDisplay.classList.add('chinese');
      els.exampleDisplay.hidden = true;
      if (word.exCn) {
        els.exampleCnDisplay.innerHTML = `例句：${highlightText(word.exCn, word.ch)}`;
      } else {
        els.exampleCnDisplay.hidden = true;
      }
      els.stageHint.textContent = '请选择对应的英文单词';
      els.btnSpeak.hidden = true;
    } else if (direction === 'fill') {
      els.wordDisplay.innerHTML = blankSentence(word);
      els.wordDisplay.classList.add('sentence');
      els.exampleDisplay.hidden = true;
      els.exampleCnDisplay.hidden = true;
      els.stageHint.textContent = '根据句意，选择正确的单词';
      els.btnSpeak.hidden = true;
    } else {
      els.wordDisplay.textContent = '🔊';
      els.wordDisplay.classList.add('chinese');
      els.exampleDisplay.hidden = true;
      els.exampleCnDisplay.hidden = true;
      els.stageHint.textContent = '听发音，拼写你听到的单词';
      els.btnSpeak.hidden = true;
    }

    applyExampleVisibility();
  }

  function blankSentence(word) {
    const target = word.blank || word.word;
    const source = word.ex || '';
    const parts = source.split(new RegExp(`(${escapeRegExp(target)})`, 'i'));
    if (parts.length >= 3) {
      return parts.map((part, index) => (
        index === 1 ? '<span class="blank">____</span>' : escapeHtml(part)
      )).join('');
    }
    return `${escapeHtml(source)} <span class="blank">____</span>`;
  }

  function fitWordDisplay() {
    if (!state.current || state.mode !== 'normal' || els.quizView.hidden) return;

    const el = els.wordDisplay;
    el.style.fontSize = '';
    el.style.whiteSpace = '';
    el.style.maxWidth = '';

    if (state.current.direction !== 'en2zh') {
      els.synDisplay.style.fontSize = '';
      return;
    }

    const text = el.textContent.trim();
    if (!text) return;

    const hasSpace = /\s/.test(text);
    el.style.whiteSpace = hasSpace ? 'normal' : 'nowrap';

    const line = el.parentElement;
    const gap = parseFloat(getComputedStyle(line).columnGap) || 0;
    const speakerGap = els.btnSpeak.hidden ? 0 : els.btnSpeak.offsetWidth + gap;
    const available = Math.max(90, line.clientWidth - speakerGap);
    el.style.maxWidth = `${available}px`;

    if (!hasSpace) {
      let size = parseFloat(getComputedStyle(el).fontSize);
      let guard = 0;
      while (el.scrollWidth > available && size > 20 && guard < 50) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        guard++;
      }
    }

    const wordSize = parseFloat(getComputedStyle(el).fontSize) || 42;
    els.synDisplay.style.fontSize = `${Math.max(15, Math.round(wordSize * 0.6))}px`;
  }

  function renderOptions(question) {
    const letters = ['A', 'B', 'C', 'D'];
    els.optionsGrid.innerHTML = question.options.map((option, index) => `
      <button type="button" class="option-btn" data-index="${index}">
        <span class="option-key">${letters[index] || index + 1}</span>
        <span class="option-text">${escapeHtml(option)}</span>
      </button>
    `).join('');
    els.optionsGrid.hidden = false;
    els.optionsGrid.querySelectorAll('.option-btn').forEach((button, index) => {
      button.addEventListener('click', () => selectOption(index));
    });
  }

  function updateHardButton() {
    const word = state.current && state.current.word;
    const isHard = !!(word && progress.hard[word.key]);
    els.btnHard.textContent = isHard ? '★' : '☆';
    els.btnHard.classList.toggle('active', isHard);
    els.btnHard.title = isHard ? '取消难词标记' : '标记为难词';
    els.btnHard.setAttribute('aria-label', isHard ? '取消难词标记' : '标记为难词');
    els.btnHard.disabled = !word;
    els.btnSlash.disabled = !word;
  }

  /* =========================================================
     作答
     ========================================================= */

  function selectOption(index) {
    if (state.mode === 'cards' || state.finished || state.answered || !state.current) return;
    if (state.current.direction === 'listen') return;
    if (!Number.isInteger(index) || index < 0 || index >= state.current.options.length) return;

    const question = state.current;
    const word = question.word;
    const buttons = Array.from(els.optionsGrid.querySelectorAll('.option-btn'));
    if (!buttons.length) return;

    rememberCurrentQuestion();
    state.answered = true;
    state.attempted++;

    const isCorrect = index === question.correctIndex;
    state.lastAnswerCorrect = isCorrect;
    buttons.forEach((button, buttonIndex) => {
      button.disabled = true;
      if (buttonIndex === question.correctIndex) button.classList.add('correct');
      else if (buttonIndex === index) button.classList.add('wrong');
      else button.classList.add('dim');
    });
    blurActive();

    if (isCorrect) {
      state.score++;
      playCorrect();
    } else {
      addWrong(word);
      playWrong();
    }

    saveProgress();
    updateStats();
    updateProgress();

    if (state.mode === 'speed') {
      els.stageHint.className = `stage-hint ${isCorrect ? 'good' : 'bad'}`;
      els.stageHint.textContent = isCorrect
        ? '✓ 正确'
        : `✗ 正确答案：${word.word}（${word.ch}）`;
      if (settings.autoSpeak && !isCorrect) {
        setTimeout(() => speak(word.word), 320);
      }
      scheduleSpeedNext(900);
    } else {
      revealResult(isCorrect);
    }
  }

  function submitTyped() {
    if (state.mode === 'cards' || state.answered || !state.current) return;
    if (state.current.direction !== 'listen') return;

    const value = els.answerInput.value.trim();
    if (!value) {
      els.inputFeedback.textContent = '先输入答案再提交';
      els.inputFeedback.className = 'feedback bad';
      return;
    }

    const question = state.current;
    const word = question.word;
    const expected = acceptedAnswers(word);
    const normalized = normalizeAnswer(value);
    const isCorrect = expected.some(answer => normalizeAnswer(answer) === normalized);

    rememberCurrentQuestion();
    state.answered = true;
    state.attempted++;
    state.lastAnswerCorrect = isCorrect;
    els.answerInput.disabled = true;
    els.btnSubmitAnswer.disabled = true;
    blurActive();

    els.inputFeedback.className = `feedback ${isCorrect ? 'good' : 'bad'}`;
    els.inputFeedback.textContent = isCorrect
      ? `✓ 正确：${word.word}`
      : `✗ 正确答案：${word.word}`;

    if (isCorrect) {
      state.score++;
      playCorrect();
    } else {
      addWrong(word);
      playWrong();
    }

    saveProgress();
    updateStats();
    updateProgress();

    if (state.mode === 'speed') {
      els.stageHint.className = `stage-hint ${isCorrect ? 'good' : 'bad'}`;
      els.stageHint.textContent = isCorrect
        ? '✓ 正确'
        : `✗ 正确答案：${word.word}（${word.ch}）`;
      scheduleSpeedNext(1100);
    } else {
      revealResult(isCorrect);
    }
  }

  function acceptedAnswers(word) {
    const values = new Set();
    [word.word, word.blank, ...(word.alts || [])].forEach(item => {
      if (item) values.add(String(item));
    });
    return Array.from(values);
  }

  function addWrong(word) {
    state.sessionWrong.add(word.key);
    progress.wrong[word.key] = (progress.wrong[word.key] || 0) + 1;
    delete progress.mastered[word.key];
  }

  function updateResultHint() {
    if (!state.current) return;
    const word = state.current.word;
    const entry = state.round ? state.round.get(word.key) : null;

    if (state.rating === 'known') {
      els.stageHint.className = 'stage-hint good';
      els.stageHint.textContent = '✓ 已学会，这个词本轮不会再出现';
      return;
    }
    if (state.rating === 'forgot') {
      els.stageHint.className = 'stage-hint bad';
      els.stageHint.textContent = '✗ 已加入错题本，本轮后面还会再考';
      return;
    }

    if (state.lastAnswerCorrect) {
      const nextStreak = (entry ? entry.streak : 0) + 1;
      els.stageHint.className = 'stage-hint good';
      els.stageHint.textContent = nextStreak >= 2
        ? '✓ 连续答对 2 次，本轮完成！'
        : '✓ 答对了，再答对一次就完成本轮';
    } else {
      els.stageHint.className = 'stage-hint bad';
      els.stageHint.textContent = '✗ 答错了，本轮后面还会再考';
    }
  }

  function revealResult(isCorrect) {
    const question = state.current;
    if (!question) return;
    const word = question.word;

    els.resultPanel.hidden = false;
    els.resultPanel.classList.toggle('bad', !isCorrect);
    els.resultMark.textContent = isCorrect ? '✓' : '✗';
    els.resultText.textContent = isCorrect ? '答对了！' : '答错了';

    const pos = word.pos ? `<span class="pos-badge">${escapeHtml(word.pos)}</span>` : '';
    const syn = word.syn ? `<span class="syn-line">近义：${escapeHtml(word.syn)}</span>` : '';
    const example = word.ex ? `<span class="detail-ex">${highlightText(word.ex, word.word)}</span>` : '';
    const exampleCn = word.exCn ? `<span class="detail-cn">${escapeHtml(word.exCn)}</span>` : '';

    els.resultDetail.innerHTML = `
      <strong>${escapeHtml(word.word)}</strong> ${pos} · ${escapeHtml(word.ch)}
      ${syn}${example}${exampleCn}
    `;

    els.rateRow.hidden = false;
    state.rating = null;
    state.ratingSnapshot = null;
    updateRateButtons();
    els.btnKnown.disabled = false;
    els.btnForgot.disabled = false;

    els.btnNext.innerHTML = '下一题 <kbd>Enter</kbd>';

    updateResultHint();
    els.btnSpeak.hidden = false;

    if (window.innerWidth < 760) {
      setTimeout(() => {
        els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 60);
    }

    if (settings.autoSpeak) {
      setTimeout(() => {
        if (state.current === question) speak(word.word);
      }, 250);
    }
  }

  function captureRatingSnapshot(word) {
    const roundEntry = state.round ? state.round.get(word.key) : null;
    return {
      key: word.key,
      wrong: progress.wrong[word.key],
      mastered: !!progress.mastered[word.key],
      inSessionWrong: state.sessionWrong.has(word.key),
      roundDone: roundEntry ? roundEntry.done : undefined,
      roundStreak: roundEntry ? roundEntry.streak : undefined
    };
  }

  function restoreRatingSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.wrong === undefined) delete progress.wrong[snapshot.key];
    else progress.wrong[snapshot.key] = snapshot.wrong;
    if (snapshot.mastered) progress.mastered[snapshot.key] = true;
    else delete progress.mastered[snapshot.key];
    if (snapshot.inSessionWrong) state.sessionWrong.add(snapshot.key);
    else state.sessionWrong.delete(snapshot.key);
    if (state.round && snapshot.roundDone !== undefined) {
      const entry = state.round.get(snapshot.key);
      if (entry) {
        entry.done = snapshot.roundDone;
        entry.streak = snapshot.roundStreak;
      }
    }
  }

  function updateRateButtons() {
    const known = state.rating === 'known';
    const forgot = state.rating === 'forgot';
    els.btnKnown.classList.toggle('selected', known);
    els.btnForgot.classList.toggle('selected', forgot);
    els.btnKnown.setAttribute('aria-pressed', known ? 'true' : 'false');
    els.btnForgot.setAttribute('aria-pressed', forgot ? 'true' : 'false');
    els.rateHint.hidden = !state.rating;
  }

  function rateWord(known) {
    if (!state.current) return;
    const word = state.current.word;
    const wanted = known ? 'known' : 'forgot';
    const isCancel = state.rating === wanted;

    if (state.rating) {
      restoreRatingSnapshot(state.ratingSnapshot);
      state.rating = null;
      state.ratingSnapshot = null;
    }

    if (isCancel) {
      updateRateButtons();
      updateResultHint();
      updateStats();
      updateProgress();
      saveProgress();
      toast('已取消评价');
      blurActive();
      return;
    }

    state.ratingSnapshot = captureRatingSnapshot(word);
    const roundEntry = state.round ? state.round.get(word.key) : null;
    if (known) {
      delete progress.wrong[word.key];
      progress.mastered[word.key] = true;
      state.sessionWrong.delete(word.key);
      if (roundEntry) roundEntry.done = true;
      removePendingWord(word.key);
      toast('✓ 已学会，本轮不再出现');
    } else {
      if (!progress.wrong[word.key]) progress.wrong[word.key] = 1;
      delete progress.mastered[word.key];
      state.sessionWrong.add(word.key);
      if (roundEntry) {
        roundEntry.streak = 0;
        roundEntry.done = false;
      }
      toast('已加入错题本，本轮还会再考');
    }
    state.rating = wanted;
    saveProgress();
    updateRateButtons();
    updateResultHint();
    updateStats();
    updateProgress();
    blurActive();
  }

  function nextQuestion() {
    clearSpeedTimer();
    if (state.mode === 'cards') return;

    if (state.mode === 'normal' && state.current && state.round) {
      const word = state.current.word;
      const entry = state.round.get(word.key);
      if (entry && !entry.done) {
        if (state.rating === 'forgot') {
          entry.streak = 0;
          requeueWord(word);
        } else if (!state.rating) {
          if (state.lastAnswerCorrect) {
            entry.streak += 1;
            if (entry.streak >= 2) entry.done = true;
            else requeueWord(word);
          } else {
            entry.streak = 0;
            requeueWord(word);
          }
        }
      }
    }

    state.qIndex++;
    state.answered = false;
    state.current = null;
    state.lastAnswerCorrect = null;

    if (state.mode === 'normal') {
      if (state.round && allRoundDone()) {
        finishSession();
        return;
      }
      if (state.qIndex >= state.queue.length) {
        const undone = state.round
          ? Array.from(state.round.values()).filter(entry => !entry.done)
          : [];
        if (!undone.length) {
          finishSession();
          return;
        }
        undone.forEach(entry => state.queue.push(entry.word));
      }
    } else if (state.qIndex >= state.queue.length) {
      finishSession();
      return;
    }

    showQuestion();
  }

  /* =========================================================
     错题 / 难词 / 斩词
     ========================================================= */

  function toggleHard() {
    if (!state.current) return;
    const word = state.current.word;
    if (progress.hard[word.key]) {
      delete progress.hard[word.key];
      toast('已取消难词标记');
    } else {
      progress.hard[word.key] = true;
      toast('已标记为难词 ⭐');
    }
    saveProgress();
    updateHardButton();
  }

  function slashCurrent() {
    if (!state.current || state.mode === 'speed') return;
    const word = state.current.word;
    const key = word.key;

    confirmDialog(
      '不再考这个词？',
      `「${word.word}」会从之后的练习中隐藏，可在单词表里点「↩」恢复。`,
      '不再考'
    ).then(confirmed => {
      if (!confirmed) return;
      progress.slashed[key] = true;
      if (state.round) state.round.delete(key);
      saveProgress();
      toast('已隐藏这个词');

      for (let i = state.queue.length - 1; i >= 0; i--) {
        if (state.queue[i].key === key) {
          state.queue.splice(i, 1);
          if (i < state.qIndex) state.qIndex--;
        }
      }

      if (!state.queue.length || (state.round && state.round.size === 0)) {
        if (state.attempted > 0) finishSession();
        else showEmpty();
        return;
      }
      if (state.qIndex >= state.queue.length) {
        finishSession();
        return;
      }
      state.answered = false;
      state.lastAnswerCorrect = null;
      updateStats();
      updateProgress();
      showQuestion();
    });
  }

  /* =========================================================
     结束 / 空状态
     ========================================================= */

  function finishSession() {
    if (state.mode === 'cards') {
      finishCards();
      return;
    }
    if (!state.queue.length) {
      if (state.mode === 'normal' && state.attempted > 0) {
        // 所有词都被斩掉时，仍然给出本轮总结
      } else {
        showEmpty();
        return;
      }
    }

    clearSpeedTimer();
    stopTimer();
    blurActive();
    const wasSpeed = state.mode === 'speed';
    state.finished = true;
    state.finishWasSpeed = wasSpeed;
    state.elapsedMs = state.startTime ? Date.now() - state.startTime : 0;
    state.answered = false;
    state.current = null;
    els.optionsGrid.innerHTML = '';

    const total = state.attempted;
    const accuracy = total ? Math.round(state.score / total * 100) : 0;
    state.mode = 'normal';

    showQuizView();
    els.wordCard.hidden = true;
    els.optionsGrid.hidden = true;
    els.listenPanel.hidden = true;
    els.resultPanel.hidden = true;
    els.emptyState.hidden = true;
    els.finishPanel.hidden = false;

    els.finishIcon.textContent = accuracy === 100 ? '🏆' : wasSpeed ? '⚡' : '🎉';
    els.finishTitle.textContent = wasSpeed ? '⚡ 速通完成！' : '本轮完成！';

    let message = '别急，先把本轮错题过一遍，再练一轮会更稳。';
    if (accuracy === 100) message = '全对！这一轮完美通关。';
    else if (accuracy >= 80) message = '表现很棒，继续保持！';
    else if (accuracy >= 60) message = '基础不错，错题再复习一遍会更稳。';
    els.finishSub.textContent = message;

    els.finishStats.innerHTML = `
      <div class="finish-stat"><b>${state.score}/${total}</b><small>答对</small></div>
      <div class="finish-stat"><b>${accuracy}%</b><small>正确率</small></div>
      <div class="finish-stat"><b>${formatTime(state.elapsedMs)}</b><small>用时</small></div>
      <div class="finish-stat"><b>${state.sessionWrong.size}</b><small>错题</small></div>
    `;

    els.btnFinishAgain.textContent = wasSpeed ? '再速通一次' : '再来一轮';
    els.btnFinishWrong.hidden = state.sessionWrong.size === 0;

    syncControls();
    updateStats();
    updateProgress();
    updatePoolNote();
    updateFooterHint();

    if (accuracy >= 80 && total >= 5) confetti();
  }

  function showEmpty() {
    clearSpeedTimer();
    stopTimer();
    blurActive();
    state.mode = 'normal';
    state.finished = true;
    state.finishWasSpeed = false;
    state.isEmpty = true;
    state.elapsedMs = 0;
    state.answered = false;
    state.current = null;

    showQuizView();
    syncControls();
    updateFooterHint();

    els.wordCard.hidden = true;
    els.optionsGrid.hidden = true;
    els.listenPanel.hidden = true;
    els.resultPanel.hidden = true;
    els.finishPanel.hidden = true;
    els.emptyState.hidden = false;

    configureEmptyState();
    updateStats();
    updateProgress();
    updatePoolNote();
  }

  function configureEmptyState() {
    const unitWords = activeUnits().flatMap(unit => unit.words);
    const pool = activeWords();
    const allSlashed = unitWords.length > 0 && unitWords.every(word => progress.slashed[word.key]);
    const hasExamples = unitWords.some(word => word.ex);

    let title = '这个范围还没有单词';
    let text = '换一个单元，或返回全部单词试试。';
    let action = 'resetAll';
    let label = '返回全部单词';

    if (!units.length) {
      title = '词库还没有内容';
      text = '点顶部的「＋ 导入单元」，把单词粘贴进来就能开始。';
      action = 'browse';
      label = '打开单词表';
    } else if (allSlashed) {
      title = '这个单元的单词都被斩掉了';
      text = '在单词表里点「↩」可以恢复，也可以在顶部导入新的单元。';
      action = 'browse';
      label = '打开单词表';
    } else if (settings.scope === 'wrong') {
      title = '这个范围还没有错题';
      text = '先做一轮练习吧，答错的单词会自动进入错题本。';
      action = 'resetAll';
      label = '先做一轮全部单词';
    } else if (settings.scope === 'hard') {
      title = '还没有标记难词';
      text = '答题时点卡片右上角的 ☆，或在单词表里点星标，就能把单词加入难词。';
      action = 'resetAll';
      label = '先做一轮全部单词';
    } else if (settings.direction === 'fill' && unitWords.length && !hasExamples) {
      title = '这个范围没有可用的例句';
      text = '句子填空需要例句。可以换成「英文 → 中文」，或导入带例句的词库。';
      action = 'en2zh';
      label = '改用英文 → 中文';
    } else if (!pool.length) {
      title = '这个范围还没有单词';
      text = '换一个单元，或者到单词表里恢复一些单词。';
      action = 'browse';
      label = '打开单词表';
    }

    state.emptyAction = action;
    els.emptyTitle.textContent = title;
    els.emptyText.textContent = text;
    els.btnEmptyReset.textContent = label;
  }

  /* =========================================================
     翻卡模式
     ========================================================= */

  function renderCard() {
    if (state.cardIndex >= state.cardQueue.length) {
      finishCards();
      return;
    }
    blurActive();
    cancelSpeech();
    const word = state.cardQueue[state.cardIndex];
    state.cardFlipped = false;
    state.cardDone = false;

    els.flipCard.hidden = false;
    els.flipCard.classList.remove('flipped');
    els.cardRate.hidden = true;
    els.cardDone.hidden = true;

    els.cardFrontWord.textContent = word.word;
    const posHtml = word.pos ? `<span class="pos-badge">${escapeHtml(word.pos)}</span>` : '';
    els.cardFrontPos.innerHTML = `${posHtml}<span class="unit-badge">${escapeHtml(word.unitTitle)}</span>`;
    els.cardBackCh.textContent = word.ch;
    els.cardBackSyn.textContent = word.syn ? `近义：${word.syn}` : '';
    els.cardBackEx.innerHTML = word.ex ? highlightText(word.ex, word.word) : '暂无例句';
    els.cardBackExCn.textContent = word.exCn || '';
    els.cardBackExCn.hidden = !word.exCn;

    els.cardMetaLeft.textContent = `第 ${state.cardIndex + 1} / ${state.cardQueue.length} 张`;
    els.cardMetaRight.textContent = `学会 ${state.cardKnown} · 没记住 ${state.cardForgot}`;

    updateStats();
    updateProgress();
    updatePoolNote();
    updateFooterHint();

    if (settings.autoSpeak && state.lastSpokenCard !== state.cardIndex) {
      state.lastSpokenCard = state.cardIndex;
      setTimeout(() => {
        if (state.mode === 'cards' && state.cardQueue[state.cardIndex] === word) {
          speak(word.word);
        }
      }, 200);
    }
  }

  function flipCard() {
    if (state.mode !== 'cards' || state.cardDone || state.cardIndex >= state.cardQueue.length) return;
    if (state.cardFlipped) return;
    state.cardFlipped = true;
    els.flipCard.classList.add('flipped');
    els.cardRate.hidden = false;
  }

  function rateCard(known) {
    if (state.mode !== 'cards' || state.cardDone) return;
    if (!state.cardFlipped) {
      toast('先翻面看释义，再评价');
      return;
    }
    const word = state.cardQueue[state.cardIndex];
    if (!word) return;

    if (known) {
      progress.mastered[word.key] = true;
      delete progress.wrong[word.key];
      state.cardKnown++;
      state.cardForgotKeys.delete(word.key);
    } else {
      progress.wrong[word.key] = (progress.wrong[word.key] || 0) + 1;
      delete progress.mastered[word.key];
      state.cardForgot++;
      state.cardForgotKeys.add(word.key);
    }
    saveProgress();

    state.cardIndex++;
    state.cardFlipped = false;
    els.flipCard.classList.remove('flipped');
    els.cardRate.hidden = true;

    if (state.cardIndex >= state.cardQueue.length) finishCards();
    else renderCard();
  }

  function finishCards() {
    state.cardDone = true;
    state.finished = true;
    stopTimer();
    blurActive();
    state.elapsedMs = state.startTime ? Date.now() - state.startTime : 0;
    state.cardFlipped = false;

    els.flipCard.hidden = true;
    els.cardRate.hidden = true;
    els.cardDone.hidden = false;

    const title = els.cardDone.querySelector('h2');
    const description = els.cardDone.querySelector('p');
    const rated = state.cardKnown + state.cardForgot;
    const accuracy = rated ? Math.round(state.cardKnown / rated * 100) : 0;

    title.textContent = '翻卡完成！';
    description.textContent = `这一轮学会了 ${state.cardKnown} 张，没记住 ${state.cardForgot} 张。`;
    els.cardDoneStats.textContent = `正确率 ${accuracy}% · 用时 ${formatTime(state.elapsedMs)}`;

    els.btnCardAgain.hidden = false;
    els.btnCardReviewForgot.hidden = state.cardForgotKeys.size === 0;
    els.btnCardExit.hidden = false;

    els.cardMetaLeft.textContent = `共 ${state.cardQueue.length} 张`;
    els.cardMetaRight.textContent = `学会 ${state.cardKnown} · 没记住 ${state.cardForgot}`;

    updateStats();
    updateProgress();
    updatePoolNote();
    updateFooterHint();

    if (accuracy >= 80 && rated >= 5) confetti();
  }

  function showCardEmpty() {
    state.cardDone = true;
    state.isEmpty = true;
    state.finished = false;
    state.startTime = 0;
    state.elapsedMs = 0;
    stopTimer();
    blurActive();

    els.flipCard.hidden = true;
    els.cardRate.hidden = true;
    els.cardDone.hidden = false;

    const title = els.cardDone.querySelector('h2');
    const description = els.cardDone.querySelector('p');
    title.textContent = '这里还没有可翻的单词';
    description.textContent = '这个单元的单词可能都被斩掉了，或者单元是空的。';
    els.cardDoneStats.textContent = '';

    els.btnCardAgain.hidden = true;
    els.btnCardReviewForgot.hidden = true;
    els.btnCardExit.hidden = false;

    els.cardMetaLeft.textContent = '0 张卡';
    els.cardMetaRight.textContent = '学会 0 · 没记住 0';

    updateStats();
    updateProgress();
    updatePoolNote();
    updateFooterHint();
  }

  function reviewCardForgot() {
    const words = Array.from(state.cardForgotKeys)
      .map(key => wordMap.get(key))
      .filter(Boolean);
    if (!words.length) {
      toast('没有需要复习的卡片');
      return;
    }
    if (settings.direction === 'fill') {
      settings.direction = 'en2zh';
      saveSettings();
    }
    startSession({ words, label: '没记住的卡' });
  }

  /* =========================================================
     单词表
     ========================================================= */

  function openBrowse() {
    if (!units.length) {
      toast('还没有单词，先导入一个单元吧');
      return;
    }
    blurActive();
    cancelSpeech();
    state.preBrowseMode = state.mode;
    state.browseOpen = true;
    pauseSpeedTimer();

    els.quizView.hidden = true;
    els.cardView.hidden = true;
    els.browseView.hidden = false;
    document.body.classList.add('browse-open');
    els.btnBrowse.classList.add('active');

    renderBrowse();
    updateFooterHint();
  }

  function closeBrowse() {
    if (!state.browseOpen) return;
    state.browseOpen = false;
    els.browseView.hidden = true;
    document.body.classList.remove('browse-open');
    els.btnBrowse.classList.remove('active');

    if (state.pendingRestart) {
      state.pendingRestart = false;
      restartForSelection();
      return;
    }

    if (state.mode === 'cards') {
      els.cardView.hidden = false;
      els.quizView.hidden = true;
    } else {
      els.quizView.hidden = false;
      els.cardView.hidden = true;
      requestAnimationFrame(fitWordDisplay);
    }
    resumeSpeedIfNeeded();
  }

  function renderBrowse(preserveScroll) {
    const scrollTop = preserveScroll ? els.browseList.scrollTop : 0;
    const query = els.browseSearch.value.trim().toLowerCase();
    const showSlashed = state.browseShowSlashed;
    const groups = activeUnits();

    if (!groups.length) {
      els.browseSub.textContent = '暂无单词';
      els.browseList.innerHTML = '<div class="browse-empty">这个单元还没有单词。</div>';
      return;
    }

    const allUnitWords = groups.flatMap(unit => unit.words);
    const masteredCount = allUnitWords.filter(word => progress.mastered[word.key]).length;
    const wrongCount = allUnitWords.filter(word => (progress.wrong[word.key] || 0) > 0).length;
    const slashedCount = allUnitWords.filter(word => progress.slashed[word.key]).length;

    let visibleCount = 0;
    let html = '';

    groups.forEach(unit => {
      const words = unit.words.filter(word => {
        if (!showSlashed && progress.slashed[word.key]) return false;
        if (!query) return true;
        const haystack = [
          word.word,
          word.ch,
          word.syn,
          word.ex,
          word.exCn
        ].join(' ').toLowerCase();
        return haystack.includes(query);
      });
      if (!words.length) return;

      visibleCount += words.length;
      html += `<div class="unit-heading">${escapeHtml(unit.title)} · ${unit.words.length} 词</div>`;

      words.forEach(word => {
        const isHard = !!progress.hard[word.key];
        const isSlashed = !!progress.slashed[word.key];
        const wrongNumber = progress.wrong[word.key] || 0;
        const badges = [
          wrongNumber ? `<span class="badge wrong">错 ${wrongNumber}</span>` : '',
          progress.mastered[word.key] ? '<span class="badge mastered">已掌握</span>' : '',
          isSlashed ? '<span class="badge slashed">已斩</span>' : ''
        ].join('');

        const example = word.ex
          ? `<div class="browse-ex">${highlightText(word.ex, word.word)}</div>`
          : '';
        const exampleCn = word.exCn
          ? `<div class="browse-ex-cn">${escapeHtml(word.exCn)}</div>`
          : '';
        const synonym = word.syn
          ? `<div class="browse-syn">近义：${escapeHtml(word.syn)}</div>`
          : '';
        const pos = word.pos ? `<span class="pos-badge">${escapeHtml(word.pos)}</span>` : '';

        html += `
          <div class="browse-card${isSlashed ? ' slashed' : ''}">
            <div class="browse-top">
              <span class="browse-index">${String(word.index + 1).padStart(2, '0')}</span>
              <span class="browse-word">${escapeHtml(word.word)}</span>
              ${pos}
              ${badges}
              <span class="browse-tools-row">
                <button type="button" class="row-btn${isHard ? ' on' : ''}" data-action="hard" data-key="${escapeHtml(word.key)}" title="${isHard ? '取消难词' : '标记难词'}">${isHard ? '★' : '☆'}</button>
                <button type="button" class="row-btn" data-action="speak" data-key="${escapeHtml(word.key)}" title="播放发音">🔊</button>
                <button type="button" class="row-btn" data-action="slash" data-key="${escapeHtml(word.key)}" title="${isSlashed ? '恢复这个词' : '不再考这个词'}">${isSlashed ? '↩' : '🔪'}</button>
              </span>
            </div>
            <div class="browse-ch">${escapeHtml(word.ch)}</div>
            ${synonym}${example}${exampleCn}
          </div>
        `;
      });
    });

    els.browseSub.textContent = `${visibleCount} 个匹配 · 已掌握 ${masteredCount} · 错题 ${wrongCount} · 已斩 ${slashedCount}`;
    els.browseList.innerHTML = html || '<div class="browse-empty">没有找到匹配的单词。</div>';
    if (preserveScroll) els.browseList.scrollTop = scrollTop;
  }

  function handleBrowseClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const key = button.dataset.key;
    const word = wordMap.get(key);
    if (!word) return;

    if (button.dataset.action === 'speak') {
      speak(word.word);
      return;
    }

    if (button.dataset.action === 'hard') {
      if (progress.hard[key]) delete progress.hard[key];
      else progress.hard[key] = true;
      saveProgress();
      if (state.current && state.current.word.key === key) updateHardButton();
      renderBrowse(true);
      return;
    }

    if (button.dataset.action === 'slash') {
      if (progress.slashed[key]) {
        delete progress.slashed[key];
        if (state.isEmpty || (state.mode === 'cards' && state.cardDone)) {
          state.pendingRestart = true;
        }
        saveProgress();
        renderBrowse(true);
        toast('已恢复这个词');
      } else {
        confirmDialog(
          '不再考这个词？',
          `「${word.word}」会从练习中隐藏，可在单词表里点「↩」恢复。`,
          '不再考'
        ).then(confirmed => {
          if (!confirmed) return;
          progress.slashed[key] = true;
          saveProgress();
          renderBrowse(true);
          toast('已隐藏这个词');
        });
      }
    }
  }

  /* =========================================================
     弹窗
     ========================================================= */

  function openModal(title, html) {
    pauseSpeedTimer();
    blurActive();
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = html;
    els.modalBody.scrollTop = 0;
    els.modalOverlay.classList.add('open');
    syncBodyLock();
  }

  function closeModal() {
    els.modalOverlay.classList.remove('open');
    els.modalBody.innerHTML = '';
    syncBodyLock();
    setTimeout(resumeSpeedIfNeeded, 0);
  }

  function confirmDialog(title, text, okText) {
    if (confirmResolver) {
      const previous = confirmResolver;
      confirmResolver = null;
      previous(false);
    }
    pauseSpeedTimer();
    els.confirmTitle.textContent = title;
    els.confirmText.textContent = text;
    els.confirmOk.textContent = okText || '确定';
    els.confirmOverlay.classList.add('open');
    syncBodyLock();

    return new Promise(resolve => {
      confirmResolver = resolve;
      setTimeout(() => els.confirmCancel.focus({ preventScroll: true }), 30);
    });
  }

  function closeConfirm(result) {
    els.confirmOverlay.classList.remove('open');
    const resolver = confirmResolver;
    confirmResolver = null;
    syncBodyLock();
    if (resolver) resolver(result);
    setTimeout(resumeSpeedIfNeeded, 0);
  }

  function syncBodyLock() {
    const locked = els.modalOverlay.classList.contains('open') ||
      els.confirmOverlay.classList.contains('open');
    document.body.classList.toggle('modal-open', locked);
  }

  /* =========================================================
     错题本
     ========================================================= */

  function openWrongBook() {
    const wrongKeys = Object.keys(progress.wrong)
      .filter(key => progress.wrong[key] > 0 && wordMap.has(key));
    const groups = new Map();

    wrongKeys.forEach(key => {
      const word = wordMap.get(key);
      if (!groups.has(word.unitId)) groups.set(word.unitId, []);
      groups.get(word.unitId).push(word);
    });

    const ordered = Array.from(groups.entries()).sort((a, b) => {
      const ai = units.findIndex(unit => unit.id === a[0]);
      const bi = units.findIndex(unit => unit.id === b[0]);
      return ai - bi;
    });
    const reviewableCount = wrongKeys.filter(key => !progress.slashed[key]).length;

    let html = `
      <div class="wrong-summary">
        <span>共 <strong>${wrongKeys.length}</strong> 个错题单词</span>
        <span class="btn-row" style="margin-top:0">
          ${reviewableCount ? '<button type="button" class="btn primary" data-wb="review">开始复习错题</button>' : ''}
          ${wrongKeys.length ? '<button type="button" class="btn ghost" data-wb="clear">清空错题</button>' : ''}
        </span>
      </div>
    `;

    if (!wrongKeys.length) {
      html += '<div class="empty-block"><span class="big">🌿</span>还没有错题，保持得很好！<br>答错的单词会自动记录在这里。</div>';
    } else {
      ordered.forEach(([unitId, words]) => {
        const unit = units.find(item => item.id === unitId);
        html += `<div class="wrong-group"><h3>${escapeHtml(unit ? unit.title : '未知单元')} · ${words.length} 个</h3>`;
        words
          .sort((a, b) => (progress.wrong[b.key] || 0) - (progress.wrong[a.key] || 0))
          .forEach(word => {
            const slashed = progress.slashed[word.key] ? ' · 已斩' : '';
            html += `
              <div class="wrong-item">
                <div class="wrong-item-main">
                  <strong>${escapeHtml(word.word)}</strong>
                  <span>${escapeHtml(word.ch)}${slashed}</span>
                </div>
                <span class="wrong-count">×${progress.wrong[word.key]}</span>
                <button type="button" class="row-btn" data-wb="speak" data-key="${escapeHtml(word.key)}" title="播放发音">🔊</button>
                <button type="button" class="row-btn" data-wb="remove" data-key="${escapeHtml(word.key)}" title="移出错题本">✓</button>
              </div>
            `;
          });
        html += '</div>';
      });
    }

    openModal('📊 错题本', html);
  }

  function startWrongReview() {
    if (!units.length) return;
    const currentWords = activeWords();
    const hasCurrentWrong = currentWords.some(word => (progress.wrong[word.key] || 0) > 0);

    if (!hasCurrentWrong && units.length > 1) settings.unitId = 'all';
    settings.scope = 'wrong';
    saveSettings();
    ensureValidSelection();
    renderUnitChips();
    syncControls();
    updateBrand();
    closeModal();
    startSession();
  }

  function handleWrongBookAction(action, key) {
    if (action === 'speak') {
      const word = wordMap.get(key);
      if (word) speak(word.word);
      return;
    }

    if (action === 'remove') {
      if (!key) return;
      delete progress.wrong[key];
      progress.mastered[key] = true;
      state.sessionWrong.delete(key);
      saveProgress();
      openWrongBook();
      toast('已移出错题本');
      return;
    }

    if (action === 'clear') {
      confirmDialog('清空错题本？', '所有错题记录会被删除，已掌握标记不受影响。', '清空').then(confirmed => {
        if (!confirmed) return;
        progress.wrong = {};
        saveProgress();
        openWrongBook();
        toast('错题本已清空');
      });
      return;
    }

    if (action === 'review') startWrongReview();
  }

  /* =========================================================
     设置 / 备份
     ========================================================= */

  function switchRow(key, title, description) {
    return `
      <div class="setting-row">
        <div class="setting-info">
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(description)}</span>
        </div>
        <label class="switch">
          <input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}>
          <span class="track"></span>
        </label>
      </div>
    `;
  }

  function openSettings() {
    const totalWords = units.reduce((sum, unit) => sum + unit.words.length, 0);
    const wrongCount = Object.keys(progress.wrong)
      .filter(key => progress.wrong[key] > 0 && wordMap.has(key)).length;

    const customRows = customRawUnits.length
      ? customRawUnits.map(unit => `
          <div class="custom-unit-row">
            <span>${escapeHtml(unit.title)} · ${Array.isArray(unit.words) ? unit.words.length : 0} 词</span>
            <button type="button" data-del-unit="${escapeHtml(unit.id)}">删除</button>
          </div>
        `).join('')
      : '<p class="setting-info"><span>还没有自定义单元。导入后可以在这里管理。</span></p>';

    const html = `
      <section class="settings-section">
        <h3>学习偏好</h3>
        ${switchRow('autoSpeak', '自动发音', '切换到英文题时自动朗读单词')}
        ${switchRow('sound', '音效', '答对 / 答错时的提示音')}
        ${switchRow('hideExamples', '答题提示', '隐藏 synonym 和例句，只看生字作答')}
        <div class="setting-row">
          <div class="setting-info">
            <strong>单词字号</strong>
            <span>只影响单词和例句的显示大小</span>
          </div>
          <div class="font-controls">
            <button type="button" data-font="minus" aria-label="缩小字号">A−</button>
            <span id="fontScaleLabel">${Math.round(settings.fontScale * 100)}%</span>
            <button type="button" data-font="plus" aria-label="放大字号">A+</button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <h3>数据与备份</h3>
        <div class="setting-info">
          <span>共 ${units.length} 个单元、${totalWords} 个单词、${wrongCount} 个错题。进度只保存在当前浏览器，换设备前请先导出备份。</span>
        </div>
        <div class="btn-row">
          <button type="button" class="btn" data-set="export">📤 导出备份</button>
          <button type="button" class="btn" data-set="import">📥 导入备份</button>
          <button type="button" class="btn" data-set="csv">📄 导出当前单元 CSV</button>
          <button type="button" class="btn danger" data-set="clear">清空学习记录</button>
        </div>
      </section>

      <section class="settings-section">
        <h3>自定义单元</h3>
        <div class="btn-row" style="margin-top:0">
          <button type="button" class="btn" data-set="addUnit">＋ 导入新单元</button>
        </div>
        ${customRows}
      </section>

      <section class="settings-section">
        <h3>帮助</h3>
        <details class="help-details">
          <summary>怎么用？快捷键和导入格式</summary>
          <div class="help-body">
            <p><strong>选择单元</strong> → 选题型和范围 → 开始答题。普通练习里每个词要连续答对 2 次才算完成；点「✓ 学会了」可直接完成，点「✗ 还没记住」会记进错题本。</p>
            <p><strong>范围：</strong>前一半 / 后一半按当前单元的顺序切分；「只复习错题」和「只复习难词」会自动筛选；「翻卡自测」是另一套翻卡界面。</p>
            <p><strong>快捷键：</strong>1–4 选答案 · Enter 下一题 · ← 上一题 · S 发音 · H 标记难词 · 翻卡时空格翻面、1 没记住、2 学会了。</p>
            <p><strong>导入单元：</strong>每行一个词，最少写「英文,中文」；完整格式为「word,pos,synonym,中文,例句,例句翻译」，也可以直接粘贴「word (pos.)｜synonym: …｜中文：…」格式。</p>
            <p><strong>数据：</strong>所有记录只保存在这台设备的浏览器 localStorage 中，不会上传到服务器。清除浏览器数据会丢失进度，记得导出备份。</p>
          </div>
        </details>
      </section>
    `;

    openModal('⚙️ 设置与数据', html);
  }

  function openSpeedHelp() {
    openModal('⚡ 速通怎么玩', `
      <div class="help-panel">
        <p><strong>速通 = 连续刷题。</strong>系统会按你当前选择的单元、范围和题型，把单词快速过一遍。</p>
        <ul>
          <li>每题只答一次，答完自动进入下一题，不用点「下一题」。</li>
          <li>答错的单词会自动进入错题本，结束后可以集中复习。</li>
          <li>速通中不会出现「学会了 / 还没记住」自评，适合考前快速过一遍。</li>
          <li>结束后会显示答对题数、正确率和用时，可以再来一次或复习错题。</li>
        </ul>
        <p class="help-tip">快捷键：<kbd>1</kbd>–<kbd>4</kbd> 选答案，<kbd>S</kbd> 朗读当前单词。速通中的范围、题型和单元会锁定，退出后恢复。</p>
      </div>
      <div class="help-actions">
        <button type="button" class="btn primary" data-close-modal>知道了</button>
      </div>
    `);
  }

  function openRoundRuleHelp() {
    openModal('📋 本轮完成规则', `
      <div class="help-panel">
        <p><strong>普通练习里，每个词要连续答对 2 次才算完成。</strong></p>
        <ul>
          <li>第一次答对后，这个词会排到本轮后面再出现一次；第二次也答对，才算过关。</li>
          <li>中间答错一次，连续次数清零，这个词会再次排到后面。</li>
          <li>点「✓ 学会了」可以直接完成这个词：不用等第二次，本轮后面也不会再出现。</li>
          <li>点「✗ 还没记住」会把它记进错题本，并让它本轮继续出现。</li>
          <li>按「← 上一题」可以退回上一题重新作答，分数和完成状态会一起回退。</li>
        </ul>
        <p class="help-tip">速通（⚡）和翻卡（🃏）是另外的玩法，不受“连续答对 2 次”限制。得分和正确率统计每次作答；剩余数量统计还没完成的词。</p>
      </div>
      <div class="help-actions">
        <button type="button" class="btn primary" data-close-modal>知道了</button>
      </div>
    `);
  }

  function exportBackup() {
    const payload = {
      app: 'vocab-lab',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      progress,
      customUnits: customRawUnits
    };
    downloadFile(
      `vocablab-backup-${dateStamp()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
    toast('备份已导出');
  }

  function exportCurrentUnitCsv() {
    const list = activeUnits().flatMap(unit => unit.words);
    if (!list.length) {
      toast('当前范围没有单词');
      return;
    }
    const rows = [
      ['word', 'pos', 'synonym', 'chinese', 'example', 'example_cn'],
      ...list.map(word => [word.word, word.pos, word.syn, word.ch, word.ex, word.exCn])
    ];
    const csv = `\uFEFF${rows.map(row => row.map(csvEscape).join(',')).join('\r\n')}`;
    downloadFile(
      `vocablab-${settings.unitId || 'words'}-${dateStamp()}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
    toast('CSV 已导出');
  }

  function importBackupFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (err) {
        toast('文件不是有效的 JSON 备份');
        return;
      }

      const importedProgress = data && data.progress
        ? data.progress
        : (data && data.wrong ? data : null);
      if (!importedProgress || typeof importedProgress !== 'object') {
        toast('备份里没有找到学习进度');
        return;
      }

      const importedCustom = Array.isArray(data.customUnits)
        ? data.customUnits.filter(isValidCustomRawUnit)
        : null;

      confirmDialog(
        '导入备份？',
        `这会覆盖当前学习进度${importedCustom ? '和自定义单元' : ''}。内置单元不受影响。`,
        '导入'
      ).then(confirmed => {
        if (!confirmed) return;

        progress = sanitizeProgress(importedProgress);
        if (importedCustom) {
          customRawUnits = importedCustom.map((unit, index) => ({
            ...unit,
            id: String(unit.id || `custom-import-${index + 1}`)
          }));
          saveCustomUnits();
        }
        if (data.settings && typeof data.settings === 'object') {
          settings = mergeSettings(data.settings, settings);
        }

        rebuildUnits();
        ensureValidSelection();
        saveSettings();
        saveProgress();
        applyTheme();
        applyScale();
        renderUnitChips();
        syncControls();
        updateBrand();
        closeModal();
        restartForSelection();
        toast('备份已导入');
      });
    };
    reader.onerror = () => toast('读取文件失败');
    reader.readAsText(file, 'utf-8');
  }

  function handleSettingsAction(action) {
    if (action === 'export') {
      exportBackup();
    } else if (action === 'import') {
      els.importFile.click();
    } else if (action === 'csv') {
      exportCurrentUnitCsv();
    } else if (action === 'clear') {
      confirmDialog(
        '清空学习记录？',
        '所有错题、掌握和难词标记都会被删除，这个操作无法撤销。',
        '清空'
      ).then(confirmed => {
        if (!confirmed) return;
        progress = { wrong: {}, mastered: {}, hard: {}, slashed: {} };
        saveProgress();
        closeModal();
        restartForSelection();
        toast('学习记录已清空');
      });
    } else if (action === 'addUnit') {
      closeModal();
      openImportUnit();
    }
  }

  function deleteCustomUnit(id) {
    const before = settings.unitId;
    const raw = customRawUnits.find(unit => unit.id === id);
    customRawUnits = customRawUnits.filter(unit => unit.id !== id);

    Object.keys(progress).forEach(category => {
      if (!progress[category] || typeof progress[category] !== 'object') return;
      Object.keys(progress[category]).forEach(key => {
        if (key.startsWith(`${id}::`)) delete progress[category][key];
      });
    });

    saveCustomUnits();
    saveProgress();
    rebuildUnits();
    ensureValidSelection();
    saveSettings();
    renderUnitChips();
    syncControls();
    updateBrand();

    if (settings.unitId !== before || before === 'all' || before === id) {
      restartForSelection();
    }
    toast(`已删除「${raw ? raw.title : '自定义单元'}」`);
  }

  /* =========================================================
     导入单元
     ========================================================= */

  function openImportUnit() {
    const html = `
      <div class="field">
        <label for="importUnitName">单元名称</label>
        <input type="text" id="importUnitName" placeholder="例如：Unit 15">
      </div>
      <div class="field">
        <label for="importWords">单词内容</label>
        <textarea id="importWords" placeholder="word,pos,synonym,中文,例句,例句翻译&#10;simultaneously,adv.,together,同时地,The two events happened simultaneously.,这两个事件同时发生了。&#10;deviate,v.,differ,偏离,Try not to deviate from the plan.,尽量不要偏离计划。"></textarea>
      </div>
      <div class="format-hint">
        每行一个单词。最少写 <code>英文,中文</code>；完整格式为
        <code>word,pos,synonym,中文,例句,例句翻译</code>（第一行可写表头）。
        也支持文档里的格式：<code>word (pos.)｜synonym: …｜中文：…</code>。
        例句可留空，但该词不会出现在「句子填空」里。
      </div>
      <div class="parse-note" id="importPreview"></div>
      <div class="import-actions">
        <button type="button" class="btn ghost" id="importCancel">取消</button>
        <button type="button" class="btn primary" id="importConfirm">导入单元</button>
      </div>
    `;

    openModal('📥 导入新单元', html);

    const nameInput = byId('importUnitName');
    const textInput = byId('importWords');
    const preview = byId('importPreview');
    const cancelButton = byId('importCancel');
    const confirmButton = byId('importConfirm');

    function updatePreview() {
      const text = textInput.value;
      if (!text.trim()) {
        preview.textContent = '粘贴词汇后，这里会显示识别到的数量';
        preview.classList.remove('bad');
        return;
      }
      const parsed = parseUnitText(text);
      if (!parsed.words.length) {
        preview.textContent = parsed.errors[0] || '没有识别到单词';
        preview.classList.add('bad');
        return;
      }
      let message = `识别到 ${parsed.words.length} 个单词`;
      if (parsed.errors.length) message += `，${parsed.errors.length} 行无法解析`;
      const noExample = parsed.words.filter(word => !word.ex).length;
      if (noExample) message += `（${noExample} 个没有例句）`;
      preview.textContent = message;
      preview.classList.remove('bad');
    }

    textInput.addEventListener('input', updatePreview);
    updatePreview();

    cancelButton.addEventListener('click', closeModal);
    nameInput.focus();

    confirmButton.addEventListener('click', () => {
      const parsed = parseUnitText(textInput.value);
      if (!parsed.words.length) {
        preview.textContent = parsed.errors[0] || '至少需要一个单词';
        preview.classList.add('bad');
        return;
      }
      const added = addCustomUnit(nameInput.value, parsed.words);
      closeModal();
      settings.scope = 'all';
      saveSettings();
      syncControls();
      restartForSelection();
      toast(`已导入「${added.title}」· ${parsed.words.length} 个单词`);
    });
  }

  function uniqueUnitTitle(title) {
    let base = String(title || '').trim() || `自定义单元 ${customRawUnits.length + 1}`;
    const existing = new Set(units.map(unit => unit.title));
    if (!existing.has(base)) return base;
    let suffix = 2;
    while (existing.has(`${base} ${suffix}`)) suffix++;
    return `${base} ${suffix}`;
  }

  function addCustomUnit(title, words) {
    const cleanWords = words.map(word => {
      const item = {
        word: word.word,
        pos: word.pos || '',
        syn: word.syn || '',
        ch: word.ch,
        ex: word.ex || '',
        exCn: word.exCn || ''
      };
      if (word.blank) item.blank = word.blank;
      if (Array.isArray(word.alts) && word.alts.length) item.alts = word.alts;
      return item;
    });

    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const finalTitle = uniqueUnitTitle(title);
    const unit = {
      id,
      title: finalTitle,
      subtitle: `${cleanWords.length} 个生词`,
      words: cleanWords
    };

    customRawUnits.push(unit);
    saveCustomUnits();
    rebuildUnits();

    settings.unitId = id;
    settings.scope = 'all';
    saveSettings();
    ensureValidSelection();
    renderUnitChips();
    syncControls();
    updateBrand();

    return { id, title: finalTitle };
  }

  function parseUnitText(text) {
    const errors = [];
    const lines = String(text || '')
      .replace(/\uFEFF/g, '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    if (!lines.length) return { words: [], errors: ['没有可解析的内容'] };

    let map = null;
    const firstLine = lines[0].toLowerCase();
    const looksLikeHeader = (firstLine.includes(',') || firstLine.includes('\t')) &&
      /(word|单词|英文)/i.test(firstLine) &&
      /(chinese|中文|释义|meaning)/i.test(firstLine);
    if (looksLikeHeader) {
      const headerColumns = lines[0].includes('\t')
        ? lines[0].split('\t')
        : splitCsvLine(lines[0]);
      const candidateMap = {};
      headerColumns.map(column => column.trim().toLowerCase()).forEach((column, index) => {
        if (/^(word|单词|英文)$/.test(column)) candidateMap.word = index;
        else if (/^(pos|词性)$/.test(column)) candidateMap.pos = index;
        else if (/^(synonym|syn|近义词)$/.test(column)) candidateMap.syn = index;
        else if (/^(chinese|中文|释义|meaning)$/.test(column)) candidateMap.ch = index;
        else if (/^(example|例句|ex)$/.test(column)) candidateMap.ex = index;
        else if (/^(example_cn|examplecn|例句翻译|例句中文|translation)$/.test(column)) candidateMap.exCn = index;
      });
      if (candidateMap.word != null && candidateMap.ch != null) {
        map = candidateMap;
        lines.shift();
      }
    }

    const words = [];
    const seen = new Set();

    lines.forEach(line => {
      let item = null;

      if (map && map.word != null && map.ch != null) {
        const columns = splitCsvLine(line).map(column => column.trim());
        item = {
          word: columns[map.word] || '',
          pos: map.pos != null ? columns[map.pos] || '' : '',
          syn: map.syn != null ? columns[map.syn] || '' : '',
          ch: columns[map.ch] || '',
          ex: map.ex != null ? columns[map.ex] || '' : '',
          exCn: map.exCn != null ? columns[map.exCn] || '' : ''
        };
      } else if (/[｜|]/.test(line) && /中文\s*[:：]/.test(line)) {
        item = parsePipeLine(line);
      } else if (line.includes('\t')) {
        const columns = line.split('\t').map(column => column.trim());
        if (columns.length === 2) {
          item = { word: columns[0], pos: '', syn: '', ch: columns[1], ex: '', exCn: '' };
        } else if (columns.length === 3) {
          item = { word: columns[0], pos: columns[1], syn: '', ch: columns[2], ex: '', exCn: '' };
        } else {
          item = {
            word: columns[0] || '',
            pos: columns[1] || '',
            syn: columns[2] || '',
            ch: columns[3] || '',
            ex: columns[4] || '',
            exCn: columns[5] || ''
          };
        }
      } else {
        const columns = splitCsvLine(line).map(column => column.trim());
        if (columns.length === 2) {
          item = { word: columns[0], pos: '', syn: '', ch: columns[1], ex: '', exCn: '' };
        } else if (columns.length === 3) {
          item = { word: columns[0], pos: columns[1], syn: '', ch: columns[2], ex: '', exCn: '' };
        } else if (columns.length >= 4) {
          item = {
            word: columns[0] || '',
            pos: columns[1] || '',
            syn: columns[2] || '',
            ch: columns[3] || '',
            ex: columns[4] || '',
            exCn: columns[5] || ''
          };
        } else {
          errors.push(`无法解析：${line.slice(0, 60)}`);
        }
      }

      if (!item) return;
      const word = cleanWord(item.word);
      const ch = String(item.ch || '').trim();
      if (!word || !ch) {
        errors.push(`缺少英文或中文：${line.slice(0, 60)}`);
        return;
      }
      const key = normalizeKey(word);
      if (seen.has(key)) return;
      seen.add(key);

      words.push({
        word,
        pos: String(item.pos || '').replace(/[()]/g, '').trim(),
        syn: String(item.syn || '').trim(),
        ch,
        ex: String(item.ex || '').trim(),
        exCn: String(item.exCn || '').trim()
      });
    });

    return { words, errors };
  }

  function parsePipeLine(line) {
    const parts = line.split(/[｜|]/).map(part => part.trim()).filter(Boolean);
    let first = parts.shift() || '';
    let pos = '';

    const trailingPos = first.match(/\s*\(([^)]+)\)\s*$/);
    if (trailingPos) {
      pos = trailingPos[1].trim();
      first = first.slice(0, trailingPos.index).trim();
    }

    let syn = '';
    let ch = '';
    let ex = '';
    let exCn = '';

    parts.forEach(part => {
      if (/^synonym\s*[:：]/i.test(part)) {
        syn = part.replace(/^synonym\s*[:：]\s*/i, '');
      } else if (/^中文\s*[:：]/.test(part)) {
        ch = part.replace(/^中文\s*[:：]\s*/, '');
      } else if (/^(例句翻译|翻译|例句中文)\s*[:：]/.test(part)) {
        exCn = part.replace(/^(例句翻译|翻译|例句中文)\s*[:：]\s*/, '');
      } else if (/^(例句|example)\s*[:：]/i.test(part)) {
        ex = part.replace(/^(例句|example)\s*[:：]\s*/i, '');
      } else if (!ch) {
        ch = part;
      }
    });

    return { word: first, pos, syn, ch, ex, exCn };
  }

  function splitCsvLine(line) {
    const columns = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      if (quoted) {
        if (char === '"') {
          if (line[index + 1] === '"') {
            current += '"';
            index++;
          } else {
            quoted = false;
          }
        } else {
          current += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        columns.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    columns.push(current);
    return columns;
  }

  /* =========================================================
     发音与音效
     ========================================================= */

  function cancelSpeech() {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        /* 忽略浏览器语音取消异常 */
      }
    }
    document.querySelectorAll('.speak-btn').forEach(button => button.classList.remove('speaking'));
  }

  function canAutoSpeakCurrent() {
    if (state.mode === 'cards') return true;
    if (!state.current) return false;
    return state.current.direction === 'en2zh' || state.current.direction === 'listen';
  }

  function speak(text) {
    if (!text) return;
    if (!('speechSynthesis' in window)) {
      toast('当前浏览器不支持语音朗读');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      utterance.pitch = 1;

      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(voice => /^en[-_]US/i.test(voice.lang) &&
        /Samantha|Google|Zira|Aria|Jenny/i.test(voice.name)) ||
        voices.find(voice => /^en/i.test(voice.lang));
      if (preferred) utterance.voice = preferred;

      document.querySelectorAll('.speak-btn').forEach(button => button.classList.add('speaking'));
      const clearSpeaking = () => {
        document.querySelectorAll('.speak-btn').forEach(button => button.classList.remove('speaking'));
      };
      utterance.onend = clearSpeaking;
      utterance.onerror = clearSpeaking;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      document.querySelectorAll('.speak-btn').forEach(button => button.classList.remove('speaking'));
    }
  }

  function ensureAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(frequency, delay, duration, type, volume) {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playCorrect() {
    if (!settings.sound) return;
    try {
      playTone(660, 0, 0.09, 'sine', 0.05);
      playTone(880, 0.085, 0.12, 'sine', 0.05);
    } catch (err) {
      /* 音效失败不影响答题 */
    }
  }

  function playWrong() {
    if (!settings.sound) return;
    try {
      playTone(230, 0, 0.14, 'triangle', 0.045);
      playTone(180, 0.1, 0.18, 'triangle', 0.045);
    } catch (err) {
      /* 音效失败不影响答题 */
    }
  }

  /* =========================================================
     提示与彩纸
     ========================================================= */

  function toast(message) {
    const item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    els.toastWrap.appendChild(item);

    while (els.toastWrap.children.length > 3) {
      els.toastWrap.firstElementChild.remove();
    }

    setTimeout(() => {
      item.classList.add('out');
      setTimeout(() => item.remove(), 240);
    }, 2300);
  }

  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#0f766e', '#14b8a6', '#f59e0b', '#fbbf24', '#ef4444', '#3b82f6', '#8b5cf6'];

    for (let index = 0; index < 54; index++) {
      const piece = document.createElement('i');
      piece.className = 'confetti-piece';
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.setProperty('--dx', `${Math.random() * 260 - 130}px`);
      piece.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`);
      piece.style.animationDelay = `${Math.random() * 0.35}s`;
      piece.style.animationDuration = `${1.4 + Math.random() * 0.9}s`;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3000);
    }
  }

  /* =========================================================
     事件绑定
     ========================================================= */

  function bindEvents() {
    els.btnFontMinus.addEventListener('click', () => adjustFont(-0.05));
    els.btnFontPlus.addEventListener('click', () => adjustFont(0.05));

    els.btnTheme.addEventListener('click', () => {
      settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
      saveSettings();
      applyTheme();
    });

    els.btnSound.addEventListener('click', () => {
      settings.autoSpeak = !settings.autoSpeak;
      saveSettings();
      syncControls();
      toast(settings.autoSpeak ? '已开启自动发音' : '已关闭自动发音');
      if (!settings.autoSpeak) cancelSpeech();
      if (settings.autoSpeak && canAutoSpeakCurrent()) {
        if (state.mode === 'cards' && state.cardQueue[state.cardIndex]) {
          speak(state.cardQueue[state.cardIndex].word);
        } else if (state.current) {
          speak(state.current.word.word);
        }
      }
    });

    els.btnExample.addEventListener('click', () => {
      settings.hideExamples = !settings.hideExamples;
      saveSettings();
      syncControls();
      applyExampleVisibility();
      toast(settings.hideExamples ? '答题提示已关闭（synonym 和例句一起隐藏）' : '答题提示已开启');
    });

    els.btnBrowse.addEventListener('click', () => {
      if (state.browseOpen) closeBrowse();
      else openBrowse();
    });

    els.btnWrongBook.addEventListener('click', openWrongBook);
    els.btnSettings.addEventListener('click', openSettings);

    els.btnSpeed.addEventListener('click', () => {
      if (state.mode === 'speed') {
        startSession();
        toast('已退出速通');
      } else if (state.mode === 'cards') {
        toast('先退出翻卡模式再速通');
      } else {
        startSpeed();
      }
    });

    els.btnSpeedHelp.addEventListener('click', openSpeedHelp);
    els.btnRuleHelp.addEventListener('click', openRoundRuleHelp);

    els.unitChips.addEventListener('click', event => {
      const chip = event.target.closest('[data-unit-id]');
      if (!chip || state.mode === 'speed') return;
      const unitId = chip.dataset.unitId;
      if (unitId === settings.unitId) return;

      settings.unitId = unitId;
      saveSettings();
      renderUnitChips();
      syncControls();
      updateBrand();

      if (state.browseOpen) {
        state.pendingRestart = true;
        renderBrowse();
      } else if (state.mode === 'cards') {
        startCards();
      } else {
        startSession();
      }

      if (window.scrollY > 60) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    els.btnAddUnit.addEventListener('click', () => {
      if (state.mode === 'speed') return;
      openImportUnit();
    });

    els.directionSelect.addEventListener('change', () => {
      if (state.mode === 'speed' || state.mode === 'cards') {
        syncControls();
        return;
      }
      settings.direction = els.directionSelect.value;
      saveSettings();
      startSession();
    });

    els.scopeSelect.addEventListener('change', () => {
      if (state.mode === 'speed') {
        syncControls();
        return;
      }
      settings.scope = els.scopeSelect.value;
      saveSettings();
      if (settings.scope === 'cards') startCards();
      else startSession();
    });

    els.btnSpeak.addEventListener('click', () => {
      if (!state.current) return;
      if (!state.answered && !['en2zh', 'listen'].includes(state.current.direction)) return;
      speak(state.current.word.word);
    });

    els.btnHard.addEventListener('click', toggleHard);
    els.btnSlash.addEventListener('click', slashCurrent);

    els.btnReplay.addEventListener('click', () => {
      if (state.current) speak(state.current.word.word);
    });

    els.btnSubmitAnswer.addEventListener('click', submitTyped);
    els.answerInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitTyped();
      }
    });

    els.btnForgot.addEventListener('click', () => rateWord(false));
    els.btnKnown.addEventListener('click', () => rateWord(true));
    els.btnNext.addEventListener('click', nextQuestion);

    els.btnEmptyReset.addEventListener('click', () => {
      if (state.emptyAction === 'browse') {
        openBrowse();
      } else if (state.emptyAction === 'en2zh') {
        settings.direction = 'en2zh';
        saveSettings();
        syncControls();
        startSession();
      } else {
        settings.scope = 'all';
        saveSettings();
        syncControls();
        startSession();
      }
    });

    els.btnFinishAgain.addEventListener('click', () => {
      if (state.finishWasSpeed) startSpeed();
      else startSession();
    });

    els.btnFinishWrong.addEventListener('click', () => {
      const words = Array.from(state.sessionWrong)
        .map(key => wordMap.get(key))
        .filter(Boolean);
      if (!words.length) {
        toast('本轮没有错题');
        return;
      }
      startSession({ words, label: '本轮错题' });
    });

    els.btnFinishBrowse.addEventListener('click', openBrowse);

    els.btnPrev.addEventListener('click', goToPreviousQuestion);

    els.btnRestart.addEventListener('click', () => {
      if (state.mode === 'cards') startCards();
      else if (state.mode === 'speed') startSpeed();
      else startSession();
    });

    els.btnCloseBrowse.addEventListener('click', closeBrowse);
    els.browseSearch.addEventListener('input', () => renderBrowse(false));
    els.browseShowSlashed.addEventListener('change', () => {
      state.browseShowSlashed = els.browseShowSlashed.checked;
      renderBrowse(false);
    });
    els.browseList.addEventListener('click', handleBrowseClick);

    els.flipCard.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      flipCard();
    });

    els.btnCardSpeak.addEventListener('click', event => {
      event.stopPropagation();
      const word = state.cardQueue[state.cardIndex];
      if (word) speak(word.word);
    });

    els.btnCardForgot.addEventListener('click', () => rateCard(false));
    els.btnCardKnown.addEventListener('click', () => rateCard(true));
    els.btnCardAgain.addEventListener('click', startCards);
    els.btnCardReviewForgot.addEventListener('click', reviewCardForgot);
    els.btnCardExit.addEventListener('click', () => {
      settings.scope = 'all';
      saveSettings();
      syncControls();
      startSession();
    });

    els.modalClose.addEventListener('click', closeModal);
    els.modalOverlay.addEventListener('click', event => {
      if (event.target === els.modalOverlay) closeModal();
    });

    els.confirmCancel.addEventListener('click', () => closeConfirm(false));
    els.confirmOk.addEventListener('click', () => closeConfirm(true));
    els.confirmOverlay.addEventListener('click', event => {
      if (event.target === els.confirmOverlay) closeConfirm(false);
    });

    els.modalBody.addEventListener('change', event => {
      const key = event.target && event.target.dataset ? event.target.dataset.setting : null;
      if (!key) return;
      settings[key] = !!event.target.checked;
      saveSettings();
      syncControls();
      applyExampleVisibility();
      if (key === 'autoSpeak' && !settings.autoSpeak) cancelSpeech();
      if (key === 'autoSpeak' && settings.autoSpeak && canAutoSpeakCurrent()) {
        if (state.mode === 'cards' && state.cardQueue[state.cardIndex]) {
          speak(state.cardQueue[state.cardIndex].word);
        } else if (state.current) {
          speak(state.current.word.word);
        }
      }
    });

    els.modalBody.addEventListener('click', event => {
      const closeModalButton = event.target.closest('[data-close-modal]');
      if (closeModalButton) {
        closeModal();
        return;
      }

      const deleteUnitButton = event.target.closest('[data-del-unit]');
      if (deleteUnitButton) {
        const id = deleteUnitButton.dataset.delUnit;
        const unit = units.find(item => item.id === id);
        confirmDialog(
          '删除自定义单元？',
          `「${unit ? unit.title : '这个单元'}」以及它在错题本和掌握记录里的数据都会被删除。`,
          '删除'
        ).then(confirmed => {
          if (!confirmed) return;
          deleteCustomUnit(id);
          openSettings();
        });
        return;
      }

      const fontButton = event.target.closest('[data-font]');
      if (fontButton) {
        adjustFont(fontButton.dataset.font === 'plus' ? 0.05 : -0.05);
        const label = byId('fontScaleLabel');
        if (label) label.textContent = `${Math.round(settings.fontScale * 100)}%`;
        return;
      }

      const wrongButton = event.target.closest('[data-wb]');
      if (wrongButton) {
        handleWrongBookAction(wrongButton.dataset.wb, wrongButton.dataset.key);
        return;
      }

      const settingsButton = event.target.closest('[data-set]');
      if (settingsButton) handleSettingsAction(settingsButton.dataset.set);
    });

    els.importFile.addEventListener('change', () => {
      const file = els.importFile.files && els.importFile.files[0];
      els.importFile.value = '';
      if (file) importBackupFile(file);
    });

    document.addEventListener('keydown', onKeyDown);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(fitWordDisplay, 120);
    });

    window.addEventListener('beforeunload', () => {
      saveSettings();
      saveProgress();
    });
    window.addEventListener('pagehide', () => {
      saveSettings();
      saveProgress();
    });
  }

  function onKeyDown(event) {
    const targetTag = (event.target && event.target.tagName || '').toLowerCase();
    const typing = targetTag === 'input' || targetTag === 'textarea' ||
      targetTag === 'select' || (event.target && event.target.isContentEditable);
    const onControl = targetTag === 'button' || targetTag === 'a';

    if (event.key === 'Escape') {
      if (els.confirmOverlay.classList.contains('open')) {
        event.preventDefault();
        closeConfirm(false);
        return;
      }
      if (els.modalOverlay.classList.contains('open')) {
        event.preventDefault();
        closeModal();
        return;
      }
      if (state.browseOpen) {
        event.preventDefault();
        closeBrowse();
        return;
      }
      return;
    }

    if (overlayOpen()) return;

    if (typing) return;

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (state.browseOpen) {
      if (event.key === '/') {
        event.preventDefault();
        els.browseSearch.focus();
      }
      return;
    }

    if (state.mode === 'cards') {
      if (onControl && (event.key === 'Enter' || event.key === ' ')) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        flipCard();
      } else if (event.key === '1') {
        event.preventDefault();
        rateCard(false);
      } else if (event.key === '2') {
        event.preventDefault();
        rateCard(true);
      } else if (event.key.toLowerCase() === 's') {
        const word = state.cardQueue[state.cardIndex];
        if (word) speak(word.word);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      if (state.mode === 'normal' && !state.isEmpty && state.history.length) {
        event.preventDefault();
        goToPreviousQuestion();
      }
      return;
    }

    if (onControl && (event.key === 'Enter' || event.key === ' ')) return;

    if (event.key === ' ' || event.key === 'Enter') {
      if (!els.resultPanel.hidden) {
        event.preventDefault();
        nextQuestion();
      } else if (!els.finishPanel.hidden) {
        event.preventDefault();
        if (state.finishWasSpeed) startSpeed();
        else startSession();
      } else if (state.mode === 'speed' && state.answered) {
        event.preventDefault();
        nextQuestion();
      }
      return;
    }

    if (/^[1-4]$/.test(event.key) && !state.answered && state.current) {
      if (state.current.direction !== 'listen') {
        event.preventDefault();
        selectOption(Number(event.key) - 1);
      }
      return;
    }

    if (event.key.toLowerCase() === 's' && state.current) {
      if (!state.answered && !['en2zh', 'listen'].includes(state.current.direction)) {
        event.preventDefault();
        toast('先作答，答完再听发音');
        return;
      }
      event.preventDefault();
      speak(state.current.word.word);
      return;
    }

    if (event.key.toLowerCase() === 'h' && state.current) {
      event.preventDefault();
      toggleHard();
    }
  }

  /* =========================================================
     启动
     ========================================================= */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
