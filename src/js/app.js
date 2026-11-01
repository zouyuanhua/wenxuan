/* Coins work offline. AI interpretation calls the same-origin local server. */
(function () {
  'use strict';
  const engine = window.YaoGua;
  const questionSection = document.getElementById('question-section');
  const questionForm = document.getElementById('question-form');
  const questionInput = document.getElementById('question-input');
  const questionState = document.getElementById('question-state');
  const questionHelp = document.getElementById('question-help');
  const lockQuestion = document.getElementById('lock-question');
  const lockQuestionLabel = document.getElementById('lock-question-label');
  const control = document.getElementById('coin-control');
  const stage = document.getElementById('coin-stage');
  const stageKicker = document.getElementById('stage-kicker');
  const hint = document.getElementById('coin-hint-text');
  const rowsElement = document.getElementById('coin-rows');
  const progress = document.getElementById('cast-progress');
  const steps = Array.from(document.querySelectorAll('#progress-steps .step-dot'));
  const status = document.getElementById('cast-status');
  const resultSection = document.getElementById('result-section');
  const interpretButton = document.getElementById('interpret-button');
  const interpretHint = document.getElementById('interpret-hint');
  const interpretLabel = document.getElementById('interpret-label');
  const aiReading = document.getElementById('ai-reading');
  const readingState = document.getElementById('reading-state');
  const readingQuestion = document.getElementById('reading-question');
  const readingStatus = document.getElementById('reading-status');
  const readingStatusText = document.getElementById('reading-status-text');
  const readingContent = document.getElementById('reading-content');
  const readingError = document.getElementById('reading-error');
  const serviceLink = document.getElementById('reading-service-link');
  const dialog = document.getElementById('method-dialog');
  const restartButton = document.getElementById('restart-app');
  const restartDialog = document.getElementById('restart-dialog');
  const restartConfirm = document.getElementById('restart-confirm');
  const restartCancel = document.getElementById('restart-cancel');
  const categoriesBox = document.getElementById('ask-categories');
  const tagline = document.getElementById('ask-tagline');
  const subsBox = document.getElementById('ask-subs');
  const askCount = document.getElementById('ask-count');
  const atmosphere = document.getElementById('ask-atmosphere');
  const soundToggle = document.getElementById('sound-toggle');
  const disclaimerToggle = document.getElementById('ask-disclaimer-toggle');
  const disclaimerFull = document.getElementById('ask-disclaimer-full');
  const followupPanel = document.getElementById('followup-panel');
  const followupTitle = document.getElementById('followup-title');
  const followupInput = document.getElementById('followup-input');
  const followupButton = document.getElementById('followup-button');
  const followupCount = document.getElementById('followup-count');
  const followupError = document.getElementById('followup-error');
  const followupClosed = document.getElementById('followup-closed');
  const positions = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  const numerals = ['一', '二', '三', '四', '五', '六'];
  const combinations = ['三个字', '两字一背', '两背一字', '三个背'];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const maxQuestionLength = 200;
  const minQuestionLength = 5;
  const interpretationTimeout = 75000;
  const rows = [];
  const lines = [];
  let lockedQuestion = null;
  let preparing = false;
  let casting = false;
  let interpreting = false;
  let interpretation = null;
  let interpretationFailed = false;
  // 守门整理后的问题只用于发给服务端,界面始终显示用户原文。
  let requestQuestion = null;
  let reviewing = false;
  let selectedCategory = null;
  let soundOn = window.localStorage.getItem('wenxuan.sound') !== 'off';
  let audioContext = null;
  let followupsUsed = 0;
  let followingUp = false;
  const followupHistory = [];
  const maxFollowups = 3;
  // 重开一轮时作废进行中的请求与动画：返回结果按代次丢弃,不会覆盖新一局。
  let sessionToken = 0;
  let activeController = null;

  function codePointLength(text) {
    return Array.from(text).length;
  }

  function tone(freq, duration, type, gainValue, when) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(gainValue, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.05);
  }

  function playNoise(duration, filterFreq, gainValue) {
    const rate = audioContext.sampleRate;
    const buffer = audioContext.createBuffer(1, Math.max(1, Math.floor(rate * duration)), rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = audioContext.createGain();
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(audioContext.destination);
    source.start();
  }

  function sfx(kind) {
    if (!soundOn) return;
    try {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return;
      if (!audioContext) audioContext = new AudioCtor();
      if (audioContext.state === 'suspended') audioContext.resume();
      const now = audioContext.currentTime;
      if (kind === 'paper') playNoise(0.14, 2600, 0.05);
      else if (kind === 'stick') {
        playNoise(0.18, 3400, 0.035);
        [1760, 1320, 2093].forEach((freq, index) => tone(freq, 0.05, 'triangle', 0.05, now + 0.05 + index * 0.055));
      } else if (kind === 'bell') {
        tone(880, 0.9, 'sine', 0.09, now);
        tone(1318, 0.55, 'sine', 0.035, now + 0.01);
      } else if (kind === 'flame') playNoise(1.05, 640, 0.06);
    } catch (error) { /* 音效不可用时静默 */ }
  }

  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (error) { /* 不支持则忽略 */ }
  }

  function renderSoundToggle() {
    soundToggle.classList.toggle('is-muted', !soundOn);
    soundToggle.setAttribute('aria-pressed', String(soundOn));
    soundToggle.title = soundOn ? '关闭音效' : '开启音效';
  }

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    window.localStorage.setItem('wenxuan.sound', soundOn ? 'on' : 'off');
    renderSoundToggle();
    if (soundOn) sfx('bell');
  });
  renderSoundToggle();

  disclaimerToggle.addEventListener('click', () => {
    disclaimerFull.hidden = !disclaimerFull.hidden;
    disclaimerToggle.setAttribute('aria-expanded', String(!disclaimerFull.hidden));
  });

  if (window.AskData) atmosphere.textContent = window.AskData.atmosphereText(new Date());

  function refreshValidity() {
    if (lockedQuestion !== null) return;
    const data = window.AskData;
    const length = codePointLength(questionInput.value.trim());
    askCount.textContent = length + ' / ' + maxQuestionLength;
    askCount.classList.toggle('is-over', length > maxQuestionLength);
    const valid = !!data && selectedCategory !== null && length >= minQuestionLength && length <= maxQuestionLength;
    lockQuestion.disabled = !valid;
    if (!data) questionHelp.textContent = '问事台数据未加载，请刷新页面重试。';
    else if (selectedCategory === null) questionHelp.textContent = data.COPY.noCategory;
    else if (!length) questionHelp.textContent = data.COPY.defaultHelp;
    else if (length < minQuestionLength) questionHelp.textContent = data.COPY.tooShort + '（还需 ' + (minQuestionLength - length) + ' 字）';
    else if (length > maxQuestionLength) questionHelp.textContent = data.COPY.tooLong;
    else questionHelp.textContent = data.COPY.validHelp;
    lockQuestion.title = valid ? '诚心已备，可以起卦。' : questionHelp.textContent;
    if (valid) {
      questionSection.classList.remove('has-error');
      questionInput.removeAttribute('aria-invalid');
    }
  }

  function failAsk(message) {
    questionSection.classList.add('has-error');
    questionInput.setAttribute('aria-invalid', 'true');
    questionHelp.textContent = message;
    questionInput.focus();
    sfx('paper');
    buzz([26, 40, 26]);
  }

  function selectCategory(category, button) {
    if (lockedQuestion !== null) return;
    const switched = selectedCategory !== null && selectedCategory.id !== category.id;
    selectedCategory = category;
    Array.from(categoriesBox.children).forEach(element => {
      const isSelected = element === button;
      element.classList.toggle('is-selected', isSelected);
      element.setAttribute('aria-selected', String(isSelected));
    });
    tagline.textContent = category.tagline;
    tagline.hidden = false;
    tagline.classList.remove('is-visible');
    void tagline.offsetWidth;
    tagline.classList.add('is-visible');
    sfx('paper');
    buzz(18);
    if (switched) questionInput.value = '';
    subsBox.replaceChildren();
    category.subs.forEach(sub => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ask-sub';
      chip.textContent = sub.name;
      chip.addEventListener('click', () => {
        if (lockedQuestion !== null) return;
        questionInput.value = sub.tpl;
        Array.from(subsBox.querySelectorAll('.ask-sub')).forEach(element => element.classList.toggle('is-selected', element === chip));
        sfx('stick');
        buzz(18);
        refreshValidity();
        questionInput.focus();
      });
      subsBox.appendChild(chip);
    });
    const freeChip = document.createElement('button');
    freeChip.type = 'button';
    freeChip.className = 'ask-sub ask-sub-free';
    freeChip.textContent = window.AskData.COPY.freeAsk;
    freeChip.addEventListener('click', () => {
      if (lockedQuestion !== null) return;
      Array.from(subsBox.querySelectorAll('.ask-sub')).forEach(element => element.classList.remove('is-selected'));
      sfx('stick');
      buzz(12);
      questionInput.focus();
    });
    subsBox.appendChild(freeChip);
    subsBox.hidden = false;
    refreshValidity();
    if (switched) {
      questionHelp.textContent = window.AskData.COPY.switchCategory;
      lockQuestion.title = questionHelp.textContent;
    }
  }

  if (window.AskData) {
    window.AskData.CATEGORIES.forEach(category => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ask-category';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      const icon = document.createElement('span');
      icon.className = 'ask-cat-icon';
      icon.textContent = category.icon;
      const name = document.createElement('span');
      name.className = 'ask-cat-name';
      name.textContent = category.name;
      button.append(icon, name);
      button.addEventListener('click', () => selectCategory(category, button));
      categoriesBox.appendChild(button);
    });
  }

  function handleQuestionInput() {
    if (lockedQuestion !== null) {
      questionInput.value = lockedQuestion;
      return;
    }
    if (questionSection.classList.contains('has-error')) {
      questionSection.classList.remove('has-error');
      questionInput.removeAttribute('aria-invalid');
    }
    refreshValidity();
  }

  questionInput.addEventListener('input', handleQuestionInput);
  questionInput.addEventListener('change', handleQuestionInput);
  window.addEventListener('pageshow', handleQuestionInput);
  refreshValidity();

  questionForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (lockedQuestion !== null || reviewing) return;
    if (!window.AskData) { failAsk('问事台数据未加载，请刷新页面重试。'); return; }
    const question = questionInput.value.trim();
    const length = codePointLength(question);
    if (selectedCategory === null) { failAsk(window.AskData.COPY.noCategory); return; }
    if (!question) { failAsk(window.AskData.COPY.emptyQuestion); return; }
    if (length < minQuestionLength) { failAsk(window.AskData.COPY.tooShort); return; }
    if (length > maxQuestionLength) { failAsk(window.AskData.COPY.tooLong); return; }
    // 先过守门:按钮显示审阅中,判定后再锁定或退回。
    reviewing = true;
    lockQuestion.disabled = true;
    lockQuestionLabel.textContent = '审阅中…';
    const review = await reviewQuestion(question);
    reviewing = false;
    lockQuestionLabel.textContent = '诚心已备 · 起卦';
    if (review.verdict === 'block') {
      lockQuestion.disabled = false;
      refreshValidity();
      failAsk(review.reason || GUARD_BLOCK_MESSAGE);
      return;
    }
    requestQuestion = review.cleanQuestion || question;
    lockedQuestion = question;
    questionInput.value = lockedQuestion;
    questionInput.readOnly = true;
    lockQuestion.disabled = true;
    lockQuestionLabel.textContent = '疏文已焚 · 静候起卦';
    questionState.textContent = '已诚心';
    questionHelp.textContent = window.AskData.COPY.lockedHelp;
    lockQuestion.title = window.AskData.COPY.lockedHelp;
    questionInput.removeAttribute('aria-invalid');
    questionSection.classList.remove('has-error');
    questionSection.classList.add('is-locked');
    preparing = true;
    status.textContent = '疏文已焚，静心凝神。';
    updateControls();
    burnThenCast();
  });

  function burnThenCast() {
    const overlay = document.createElement('div');
    overlay.className = 'burn-overlay';
    const paper = document.createElement('div');
    paper.className = 'burn-paper';
    const text = document.createElement('p');
    text.className = 'burn-text';
    text.textContent = lockedQuestion;
    const flame = document.createElement('span');
    flame.className = 'burn-flame';
    flame.setAttribute('aria-hidden', 'true');
    const smoke = document.createElement('span');
    smoke.className = 'burn-smoke';
    smoke.setAttribute('aria-hidden', 'true');
    paper.append(text, flame, smoke);
    const kicker = document.createElement('p');
    kicker.className = 'burn-kicker';
    kicker.textContent = window.AskData.COPY.burnKicker;
    kicker.setAttribute('aria-hidden', 'true');
    const skip = document.createElement('p');
    skip.className = 'burn-skip';
    skip.textContent = window.AskData.COPY.burnSkip;
    // 焚化之后的静心语:纸已成灰,场景仍在,让人再静三秒。
    const hush = document.createElement('p');
    hush.className = 'burn-hush';
    hush.textContent = window.AskData.COPY.burnHush;
    hush.setAttribute('aria-hidden', 'true');
    overlay.append(kicker, paper, skip, hush);
    document.body.appendChild(overlay);
    sfx('bell');
    buzz([40, 30, 60]);
    const token = sessionToken;
    let finished = false;
    let hushed = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      overlay.classList.add('is-done');
      window.setTimeout(() => overlay.remove(), 180);
      // 已重开一局:不再锁定问题、不再滚回摇卦区。
      if (token !== sessionToken) return;
      preparing = false;
      questionHelp.textContent = '诚心已备，轻点铜钱，摇出初爻。';
      status.textContent = '问题已锁定 · 轻点铜钱，摇出初爻';
      updateControls();
      document.getElementById('casting-card').scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      control.focus({ preventScroll: true });
    };
    // 纸燃尽后不立刻退场:留在焚香场景里静心,三秒后再入摇卦。
    const hushScene = () => {
      if (hushed || finished) return;
      hushed = true;
      overlay.classList.add('is-hush');
      skip.textContent = window.AskData.COPY.burnHushSkip;
    };
    overlay.addEventListener('click', finish);
    if (reducedMotion.matches) {
      window.setTimeout(finish, 260);
      return;
    }
    window.setTimeout(() => sfx('flame'), 1150);
    // 疏文先静置可读(约 0.85 秒),再受热卷曲淡出;点击遮罩仍可随时跳过。
    window.setTimeout(hushScene, 2500);
    // 焚化 2.5 秒 + 静心停顿 3 秒,然后进入摇卦。
    window.setTimeout(finish, 5500);
  }

  function yaoSVG(yang, moving) {
    const svg = document.createElementNS(svgNamespace, 'svg');
    svg.setAttribute('viewBox', '0 0 72 12');
    svg.setAttribute('class', 'yao-icon' + (moving ? ' moving' : ''));
    svg.setAttribute('aria-label', (yang ? '阳爻，实线' : '阴爻，断线') + (moving ? '，动爻' : ''));
    const path = document.createElementNS(svgNamespace, 'path');
    path.setAttribute('d', yang ? 'M2 6h68' : 'M2 6h25m18 0h25');
    svg.appendChild(path);
    return svg;
  }

  function coinElement(index) {
    const coin = document.createElement('span');
    coin.className = 'coin';
    coin.style.setProperty('--coin-index', index);
    coin.setAttribute('aria-hidden', 'true');
    coin.innerHTML = '<span class="coin-visual"><svg class="coin-svg" viewBox="0 0 64 64"><use href="#coin-front"/></svg></span><span class="coin-face">字面</span>';
    return coin;
  }

  // These are the only three coin nodes; all six throws reuse them.
  const coins = [0, 1, 2].map(coinElement);
  control.append(...coins);

  function setCoinFace(coin, face) {
    coin.querySelector('use').setAttribute('href', '#coin-' + face);
    coin.querySelector('.coin-face').textContent = face === 'back' ? '背面' : '字面';
  }

  function resetRow(row) {
    row.element.className = 'coin-row is-pending';
    row.combination.textContent = '待摇';
    row.result.replaceChildren();
    const placeholder = document.createElement('span');
    placeholder.className = 'pending-line';
    placeholder.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = '待成爻';
    row.result.append(placeholder, name);
    row.element.removeAttribute('aria-label');
  }

  for (let index = 5; index >= 0; index--) {
    const element = document.createElement('div');
    element.dataset.line = String(index + 1);
    const position = document.createElement('span');
    position.className = 'row-position';
    position.innerHTML = '<small>' + String(index + 1).padStart(2, '0') + '</small>' + positions[index];
    const combination = document.createElement('span');
    combination.className = 'row-combination';
    const result = document.createElement('div');
    result.className = 'row-result';
    element.append(position, combination, result);
    const row = { element, combination, result };
    resetRow(row);
    rows[index] = row;
    rowsElement.appendChild(element);
  }

  function updateControls() {
    const complete = lines.length === 6;
    const questionLocked = lockedQuestion !== null;
    // 没有卦就没有「重开」的意义：初始态保持禁用,避免暗示可随时改主意。
    restartButton.disabled = !questionLocked;
    progress.textContent = lines.length + ' / 6 爻';
    control.disabled = !questionLocked || preparing || casting || complete;
    interpretButton.disabled = !questionLocked || preparing || casting || !complete || interpreting;
    interpretButton.setAttribute('aria-busy', String(interpreting));
    interpretLabel.textContent = interpreting ? '解卦中…' : interpretation !== null ? '查看解读' : interpretationFailed ? '重新解卦' : '解卦';
    interpretButton.setAttribute('aria-expanded', String(!resultSection.hidden));
    interpretHint.textContent = !complete ? '六爻齐备后，即可解卦' : interpreting ? '正在结合所问与卦象解读，请稍候' : interpretation !== null ? '解读已完成，可再次查看' : interpretationFailed ? '解读暂未完成，可以重试' : '六爻已成，点击解卦观象';
    stage.classList.toggle('is-awaiting', !questionLocked || preparing);
    stage.classList.toggle('is-ready', !control.disabled);
    stage.classList.toggle('is-complete', complete);
    rows.forEach((row, index) => {
      row.element.classList.toggle('is-current', questionLocked && !preparing && !complete && index === lines.length);
    });
    steps.forEach((step, index) => {
      step.classList.toggle('is-complete', index < lines.length);
      step.classList.toggle('is-current', questionLocked && !preparing && !complete && index === lines.length);
    });
    if (!casting) {
      stageKicker.textContent = !questionLocked ? '待诚心发问' : preparing ? '疏文已焚' : complete ? '六爻已成 · 静观其变' : '第' + numerals[lines.length] + '摇 · ' + positions[lines.length];
      hint.textContent = !questionLocked ? '先在问事台抽签写下所问' : preparing ? '专注所问，静候起卦' : complete ? '六爻已成，可点击下方「解卦」' : (lines.length ? '再点任意铜钱，摇出' : '点击任意铜钱，摇出') + positions[lines.length];
    }
    control.setAttribute('aria-label', !questionLocked ? '请先在问事台诚心发问' : preparing ? '疏文已焚，静候起卦' : complete ? '六爻已成，铜钱已锁定' : '第' + (lines.length + 1) + '次，点击三枚铜钱摇出' + positions[lines.length]);
  }

  // 整程序重开：清空所问、六爻、排盘与解读，回到问事台最初态。
  // 进行中的解卦/追问按代次作废,旧响应不会写回新一局。
  function restartAll() {
    sessionToken += 1;
    if (activeController) {
      try { activeController.abort(); } catch (error) { /* 已结束的请求无需处理 */ }
      activeController = null;
    }
    const overlay = document.querySelector('.burn-overlay');
    if (overlay) overlay.remove();

    lockedQuestion = null;
    requestQuestion = null;
    preparing = false;
    casting = false;
    interpreting = false;
    interpretation = null;
    interpretationFailed = false;
    reviewing = false;
    selectedCategory = null;
    followupsUsed = 0;
    followingUp = false;
    followupHistory.length = 0;
    lines.length = 0;
    rows.forEach(resetRow);

    questionInput.value = '';
    questionInput.readOnly = false;
    questionInput.removeAttribute('aria-invalid');
    questionSection.classList.remove('is-locked', 'has-error');
    questionState.textContent = '';
    lockQuestionLabel.textContent = '诚心已备 · 起卦';
    tagline.textContent = '';
    tagline.hidden = true;
    subsBox.replaceChildren();
    subsBox.hidden = true;
    Array.from(categoriesBox.children).forEach(element => {
      element.classList.remove('is-selected');
      element.setAttribute('aria-selected', 'false');
    });

    resultSection.hidden = true;
    document.getElementById('moving-count').textContent = '';
    document.getElementById('change-explanation').textContent = '';
    renderClassics(null);
    if (window.PaiPan && typeof window.PaiPan.clear === 'function') window.PaiPan.clear();

    aiReading.hidden = true;
    aiReading.removeAttribute('data-state');
    aiReading.removeAttribute('aria-busy');
    readingState.textContent = '解读中';
    readingQuestion.textContent = '';
    readingStatus.hidden = true;
    readingStatusText.textContent = '正在结合所问与卦象解读，请稍候…';
    readingContent.replaceChildren();
    readingContent.hidden = true;
    readingError.textContent = '';
    readingError.hidden = true;
    serviceLink.hidden = true;

    followupPanel.hidden = true;
    followupClosed.hidden = true;
    followupInput.value = '';
    followupCount.textContent = '0 / 200';
    followupButton.textContent = '追问';
    followupButton.disabled = true;
    followupError.textContent = '';
    followupError.hidden = true;

    status.textContent = '诚心发问后，三枚铜钱同摇成爻。';
    stage.classList.remove('is-shaking', 'is-settled', 'is-complete');
    coins.forEach(coin => setCoinFace(coin, 'front'));
    updateControls();
    refreshValidity();
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    questionInput.focus({ preventScroll: true });
  }

  function renderRow(index, line) {
    const row = rows[index];
    row.element.className = 'coin-row is-settled' + (line.moving ? ' is-moving' : '');
    row.combination.textContent = combinations[line.backCount];
    const name = document.createElement('span');
    name.className = 'row-name';
    name.textContent = line.name;
    const tag = document.createElement('small');
    tag.className = line.moving ? 'moving-tag' : 'static-tag';
    tag.textContent = line.moving ? '动' : '静';
    name.appendChild(tag);
    row.result.replaceChildren(yaoSVG(line.yang, line.moving), name);
    row.element.setAttribute('aria-label', positions[index] + '，' + combinations[line.backCount] + '，' + line.name + '，' + (line.yang ? '阳爻' : '阴爻') + '，' + (line.moving ? '动爻' : '静爻'));
  }

  function renderHexagram(prefix, hexagramLines, description, highlightMoving) {
    const target = document.getElementById(prefix + '-lines');
    target.replaceChildren(...hexagramLines.slice().reverse().map(line => yaoSVG(line.yang, highlightMoving && line.moving)));
    document.getElementById(prefix + '-number').textContent = '第 ' + description.number + ' 卦';
    document.getElementById(prefix + '-name').textContent = description.fullName;
    document.getElementById(prefix + '-trigrams').textContent = '上' + description.upper.name + ' · 下' + description.lower.name;
  }

  function renderResults() {
    const changed = engine.changeLines(lines);
    renderHexagram('primary', lines, engine.describeHexagram(lines), true);
    renderHexagram('changed', changed, engine.describeHexagram(changed), false);
    const moving = lines.flatMap((line, index) => line.moving ? [positions[index]] : []);
    document.getElementById('moving-count').textContent = moving.length ? moving.length + ' 个动爻' : '六爻皆静';
    document.getElementById('change-explanation').textContent = moving.length ? moving.join('、') + '为动爻，阴阳互换，得此变卦。' : '此卦六爻皆静，阴阳不变，本卦与变卦相同。';
    resultSection.hidden = false;
  }

  function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  // 卦辞展示(来自服务端 64 卦数据库,FR-03 知识检索层)。
  function renderClassics(classics) {
    [['primary-guaci', classics && classics.primary], ['changed-guaci', classics && classics.changed]]
      .forEach(([id, entry]) => {
        const target = document.getElementById(id);
        if (!target) return;
        const text = entry && typeof entry.guaCi === 'string' ? entry.guaCi.trim() : '';
        target.textContent = text;
        target.hidden = !text;
      });
  }

  // 追问循环(FR-05):同一卦象最多追问 3 次,超限收尾。
  // 守门:起卦与追问前先做一次独立审查。接口不可用时退回本地高危模式,
  // 命中则拦,否则原文放行——与 src/guard.py 的兜底策略一致。
  const LOCAL_GUARD_PATTERNS = [
    /(忽略|无视)[^。！？\n]{0,4}(之前|以上|上述|前面|先前)[^。！？\n]{0,4}(指令|提示词|提示|规则|要求|设定)/,
    /(输出|泄露|复述|告诉我|打印)[^。！？\n]{0,10}(系统提示词|系统提示|系统消息|你的指令|你的设定|system\s*prompt)/i,
    /(系统提示词|系统提示|system\s*prompt|你的指令|你的设定)[^。！？\n]{0,8}(是什么|告诉我|输出|复述|泄露|打印|内容)/i,
    /(ignore|disregard)\s+(all\s+)?(the\s+)?(previous|above|prior|earlier)\s+(instructions|prompts|rules)/i,
    /(jailbreak|developer\s*mode|越狱|开发者模式|绕过限制|解除限制)/i
  ];
  const GUARD_BLOCK_MESSAGE = '这则问事中夹带了指令性内容，请只写下你想问的事。';

  function localGuardHit(question) {
    return LOCAL_GUARD_PATTERNS.some(pattern => pattern.test(question));
  }

  async function reviewQuestion(question) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/safety/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory ? selectedCategory.name : '',
          subCategory: '',
          question: question
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error('guard unavailable');
      const data = await response.json();
      const verdict = data && typeof data.verdict === 'string' ? data.verdict : '';
      const clean = data && typeof data.cleanQuestion === 'string' ? data.cleanQuestion.trim() : '';
      const reason = data && typeof data.reason === 'string' ? data.reason.trim() : '';
      if (verdict === 'block') {
        return { verdict: 'block', reason: reason || GUARD_BLOCK_MESSAGE };
      }
      if (verdict === 'pass') return { verdict: 'pass', cleanQuestion: question };
      if (verdict === 'rewrite' && clean) return { verdict: 'rewrite', cleanQuestion: clean };
      throw new Error('guard invalid');
    } catch (error) {
      if (localGuardHit(question)) return { verdict: 'block', reason: GUARD_BLOCK_MESSAGE };
      return { verdict: 'pass', cleanQuestion: question };
    } finally {
      window.clearTimeout(timer);
    }
  }

  // 首次解读先「六爻断卦」再三章;历史提示词可能写「卦象解析」,两者都认。
  // 章节标题偶尔漏写「一、」这类序号,剥掉序号后仍按标题识别,避免整段退回纯文本。
  const READING_ANALYSIS_TITLES = ['六爻断卦', '卦象解析'];
  const READING_SECTIONS = ['一、卦象照见', '二、宽厚以待', '三、可行之路'];

  function renderReading(container, text) {
    const sections = [];
    const preface = [];
    let analysis = null;
    let current = null;
    text.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim().replace(/^[#*\s]+/, '').replace(/[*\s]+$/, '');
      const analysisTitle = READING_ANALYSIS_TITLES.find(item =>
        trimmed === item || (trimmed.startsWith(item) && trimmed.length <= item.length + 12));
      if (analysisTitle) {
        const rest = trimmed.slice(analysisTitle.length).replace(/^[：:，,、\s]+/, '').trim();
        analysis = { title: analysisTitle, paragraphs: rest ? [rest] : [] };
        current = analysis;
        return;
      }
      const title = READING_SECTIONS.find(item => {
        const bare = item.replace(/^[一二三四五六七八九十]+、/, '');
        return [item, bare].some(key =>
          trimmed === key || (trimmed.startsWith(key) && trimmed.length <= key.length + 12));
      });
      if (title) {
        const rest = trimmed.slice(title.length).replace(/^[：:，,、\s]+/, '').trim();
        current = { title: title, paragraphs: rest ? [rest] : [] };
        sections.push(current);
        return;
      }
      if (!trimmed) return;
      if (current) current.paragraphs.push(trimmed);
      else preface.push(trimmed);
    });
    if (sections.length < 2) {
      container.textContent = text;
      return;
    }
    container.replaceChildren();
    if (preface.length) {
      const intro = document.createElement('p');
      intro.className = 'reading-preface';
      intro.textContent = preface.join('\n');
      container.appendChild(intro);
    }
    if (analysis) {
      const analysisBlock = document.createElement('section');
      analysisBlock.className = 'reading-analysis';
      const analysisHeading = document.createElement('h3');
      analysisHeading.className = 'reading-analysis-title';
      analysisHeading.textContent = analysis.title || '六爻断卦';
      analysisBlock.appendChild(analysisHeading);
      analysis.paragraphs.forEach(para => {
        const p = document.createElement('p');
        p.className = 'reading-paragraph';
        p.textContent = para;
        analysisBlock.appendChild(p);
      });
      container.appendChild(analysisBlock);
    }
    sections.forEach(section => {
      const block = document.createElement('section');
      block.className = 'reading-section';
      const heading = document.createElement('h3');
      heading.className = 'reading-section-title';
      heading.textContent = section.title;
      block.appendChild(heading);
      section.paragraphs.forEach(para => {
        const p = document.createElement('p');
        p.className = 'reading-paragraph';
        p.textContent = para;
        block.appendChild(p);
      });
      container.appendChild(block);
    });
  }

  // 追问块追加在首次解读之后,保留完整对话记录,不覆盖前文。
  function renderFollowup(container, index, question, answer) {
    const block = document.createElement('section');
    block.className = 'reading-followup';
    const heading = document.createElement('h3');
    heading.className = 'reading-followup-title';
    heading.textContent = '追问 ' + index;
    block.appendChild(heading);
    const ask = document.createElement('p');
    ask.className = 'reading-followup-question';
    ask.textContent = '问：' + question;
    block.appendChild(ask);
    answer.split(/\r?\n/).map(line => line.trim()).filter(Boolean).forEach(text => {
      const p = document.createElement('p');
      p.className = 'reading-paragraph';
      p.textContent = text;
      block.appendChild(p);
    });
    container.appendChild(block);
  }

  function updateFollowupPanel() {
    if (interpretation === null) {
      followupPanel.hidden = true;
      followupClosed.hidden = true;
      return;
    }
    const remaining = maxFollowups - followupsUsed;
    if (remaining <= 0) {
      followupPanel.hidden = true;
      followupClosed.hidden = false;
      return;
    }
    followupClosed.hidden = true;
    followupPanel.hidden = false;
    followupTitle.textContent = '还有所惑？就此卦追问（剩余 ' + remaining + ' 次）';
    followupButton.disabled = followingUp || !followupInput.value.trim();
  }

  followupButton.addEventListener('click', async () => {
    const question = followupInput.value.trim();
    if (followingUp || followupsUsed >= maxFollowups) return;
    if (!question) {
      followupError.textContent = '追问内容未落笔，先写下你想问的。';
      followupError.hidden = false;
      return;
    }
    if (lockedQuestion === null || lines.length !== 6 || interpretation === null) return;
    const token = sessionToken;
    followingUp = true;
    followupButton.disabled = true;
    followupButton.textContent = '审阅中…';
    followupError.hidden = true;
    const review = await reviewQuestion(question);
    if (token !== sessionToken) return;
    if (review.verdict === 'block') {
      followingUp = false;
      followupButton.textContent = '追问';
      followupError.textContent = review.reason || GUARD_BLOCK_MESSAGE;
      followupError.hidden = false;
      updateFollowupPanel();
      return;
    }
    const askFollowup = review.cleanQuestion || question;
    followupButton.textContent = '追问中…';
    aiReading.dataset.state = 'loading';
    readingState.textContent = '追问解读中';
    readingStatus.hidden = false;
    readingStatusText.textContent = '正在就同一卦象解读你的追问…';
    updateControls();
    const controller = new AbortController();
    activeController = controller;
    const timeout = window.setTimeout(() => controller.abort(), interpretationTimeout);
    try {
      if (window.location.protocol === 'file:') {
        throw new Error('AI 解卦需要本地服务。请先启动服务，再从下方链接打开页面。');
      }
      const response = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: lockedQuestion,
          lines: lines.map(line => ({ coins: line.coins.slice() })),
          followup: {
            index: followupsUsed + 1,
            question: askFollowup,
            history: followupHistory.slice(),
            initial: interpretation ? { question: lockedQuestion, answer: interpretation } : null
          }
        }),
        signal: controller.signal
      });
      let data;
      try { data = await response.json(); } catch (error) { if (controller.signal.aborted) throw error; throw new Error('解卦服务返回异常，请稍后重试。'); }
      if (!response.ok) {
        const message = data && data.error && typeof data.error.message === 'string' ? data.error.message.slice(0, 300) : '解卦暂未完成，请稍后重试。';
        throw new Error(message);
      }
      if (token !== sessionToken) return;
      const answer = typeof data.interpretation === 'string' ? data.interpretation.trim() : '';
      if (!answer) throw new Error('暂未收到完整解读，请稍后重试。');
      followupsUsed += 1;
      followupHistory.push({ question: askFollowup, answer });
      renderClassics(data.classics);
      renderFollowup(readingContent, followupsUsed, question, answer);
      readingState.textContent = '解读完成';
      aiReading.dataset.state = 'success';
      readingStatusText.textContent = '追问解读已完成。';
      followupInput.value = '';
      followupCount.textContent = '0 / 200';
    } catch (error) {
      if (token !== sessionToken) return;
      followupError.textContent = controller.signal.aborted ? '追问等待超时，请重试。' : (error.message || '追问暂未完成，请重试。');
      followupError.hidden = false;
    } finally {
      window.clearTimeout(timeout);
      if (activeController === controller) activeController = null;
      if (token === sessionToken) {
        followingUp = false;
        followupButton.textContent = '追问';
        readingStatus.hidden = true;
        updateControls();
        updateFollowupPanel();
      }
    }
  });

  followupInput.addEventListener('input', () => {
    const length = Array.from(followupInput.value.trim()).length;
    followupCount.textContent = length + ' / 200';
    followupCount.classList.toggle('is-over', length >= 200);
    followupError.hidden = true;
    followupButton.disabled = followingUp || !followupInput.value.trim();
  });

  interpretButton.addEventListener('click', async () => {
    if (lockedQuestion === null || preparing || casting || interpreting || lines.length !== 6) return;
    renderResults();
    aiReading.hidden = false;
    readingQuestion.textContent = lockedQuestion;
    resultSection.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
    resultSection.focus({ preventScroll: true });
    if (interpretation !== null) return;

    const token = sessionToken;
    interpreting = true;
    interpretationFailed = false;
    aiReading.dataset.state = 'loading';
    aiReading.setAttribute('aria-busy', 'true');
    readingState.textContent = '解读中';
    readingStatus.hidden = false;
    readingStatusText.textContent = '正在结合所问与卦象解读，请稍候…';
    readingContent.hidden = true;
    readingError.hidden = true;
    serviceLink.hidden = true;
    updateControls();
    const controller = new AbortController();
    activeController = controller;
    const timeout = window.setTimeout(() => controller.abort(), interpretationTimeout);
    try {
      if (window.location.protocol === 'file:') {
        serviceLink.hidden = false;
        throw new Error('AI 解卦需要本地服务。请先启动服务，再从下方链接打开页面。');
      }
      const response = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: lockedQuestion,
          cleanQuestion: requestQuestion || undefined,
          lines: lines.map(line => ({ coins: line.coins.slice() }))
        }),
        signal: controller.signal
      });
      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new Error('解卦服务返回异常，请稍后重试。');
      }
      if (!response.ok) {
        const message = data && data.error && typeof data.error.message === 'string' ? data.error.message.slice(0, 300) : '解卦暂未完成，请稍后重试。';
        throw new Error(message);
      }
      if (!data || typeof data.interpretation !== 'string' || !data.interpretation.trim()) {
        throw new Error('暂未收到完整解读，请稍后重试。');
      }
      if (token !== sessionToken) return;
      interpretation = data.interpretation.trim();
      // Model output is text, never executable HTML or untrusted markup.
      renderReading(readingContent, interpretation);
      readingContent.hidden = false;
      readingState.textContent = '解读完成';
      aiReading.dataset.state = 'success';
      readingStatusText.textContent = '解读已完成。';
      renderClassics(data.classics);
      updateFollowupPanel();
    } catch (error) {
      if (token !== sessionToken) return;
      interpretationFailed = true;
      readingState.textContent = '暂未完成';
      aiReading.dataset.state = 'error';
      readingError.textContent = controller.signal.aborted ? '解卦等待超时，请点击「重新解卦」重试。' : error instanceof TypeError ? '暂时无法连接解卦服务，请稍后重试。' : error.message || '解卦暂未完成，请稍后重试。';
      readingError.hidden = false;
    } finally {
      window.clearTimeout(timeout);
      if (activeController === controller) activeController = null;
      if (token === sessionToken) {
        interpreting = false;
        aiReading.setAttribute('aria-busy', 'false');
        readingStatus.hidden = true;
        updateControls();
      }
    }
  });

  control.addEventListener('click', async () => {
    if (lockedQuestion === null || preparing || casting || lines.length >= 6) return;
    if (!engine || typeof engine.castLine !== 'function') {
      status.textContent = '卦象脚本未加载，请刷新页面后重试。';
      return;
    }
    const index = lines.length;
    const previousFaces = coins.map(coin => coin.querySelector('use').getAttribute('href').endsWith('back') ? 'back' : 'front');
    const restoreFocus = document.activeElement === control;
    const token = sessionToken;
    casting = true;
    updateControls();
    stage.classList.remove('is-settled');
    stage.classList.add('is-shaking');
    control.setAttribute('aria-busy', 'true');
    stageKicker.textContent = '第' + numerals[index] + '摇 · ' + positions[index];
    hint.textContent = '三钱翻转，静候落定';
    status.textContent = '正在摇出' + positions[index] + '…';
    let interval;
    try {
      const line = engine.castLine();
      let frame = 0;
      if (!reducedMotion.matches) {
        interval = window.setInterval(() => {
          frame++;
          coins.forEach((coin, coinIndex) => setCoinFace(coin, (frame + coinIndex) % 2 ? 'back' : 'front'));
        }, 95);
        await delay(650);
      }
      window.clearInterval(interval);
      if (token !== sessionToken) return;
      coins.forEach((coin, coinIndex) => setCoinFace(coin, line.coins[coinIndex]));
      renderRow(index, line);
      lines.push(line);
      if (lines.length === 6) {
        const count = lines.filter(item => item.moving).length;
        status.textContent = '六爻已成 · ' + (count ? count + ' 个动爻，以朱砂色标记' : '六爻皆静，阴阳不变');
        // 六爻纳甲排盘：确定性计算，摇满即展示（不依赖解卦请求与结果）。
        if (window.PaiPan && typeof window.PaiPan.renderFromCoins === 'function') {
          window.PaiPan.renderFromCoins(lines.map(item => item.coins.slice()));
        }
      } else {
        status.textContent = positions[index] + '已定 · ' + combinations[line.backCount] + ' · ' + line.name + (line.moving ? '动爻' : '静爻');
      }
      stage.classList.add('is-settled');
    } catch (error) {
      lines.length = index;
      resultSection.hidden = true;
      resetRow(rows[index]);
      coins.forEach((coin, coinIndex) => setCoinFace(coin, previousFaces[coinIndex]));
      status.textContent = '本次未落定，请轻点铜钱重试。';
      console.error('此爻未完成', error);
    } finally {
      window.clearInterval(interval);
      casting = false;
      stage.classList.remove('is-shaking');
      control.removeAttribute('aria-busy');
      updateControls();
      if (restoreFocus && !control.disabled) control.focus({ preventScroll: true });
    }
  });

  updateControls();

  document.getElementById('open-method').addEventListener('click', () => dialog.showModal());
  document.getElementById('close-method').addEventListener('click', () => dialog.close());
  document.getElementById('confirm-method').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });

  // 重开前先确认：清空的是整局所问、卦象与解读，不只是改问题。
  restartButton.addEventListener('click', () => {
    if (lockedQuestion === null) return;
    restartDialog.showModal();
  });
  restartCancel.addEventListener('click', () => restartDialog.close());
  restartConfirm.addEventListener('click', () => {
    restartDialog.close();
    restartAll();
  });
  restartDialog.addEventListener('click', event => {
    if (event.target !== restartDialog) return;
    const rect = restartDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) restartDialog.close();
  });
})();
