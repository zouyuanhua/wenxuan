(function () {
  'use strict';
  const editor = document.getElementById('prompt-editor');
  const promptStatus = document.getElementById('prompt-status');
  const promptError = document.getElementById('prompt-error');
  const promptCount = document.getElementById('prompt-count');
  const saveButton = document.getElementById('save-prompt');
  const reloadButton = document.getElementById('reload-prompt');
  const savedTime = document.getElementById('saved-time');
  const guardEditor = document.getElementById('guard-editor');
  const guardStatus = document.getElementById('guard-status');
  const guardCount = document.getElementById('guard-count');
  const guardError = document.getElementById('guard-error');
  const guardSaveButton = document.getElementById('save-guard');
  const guardSavedTime = document.getElementById('guard-saved-time');
  const debugForm = document.getElementById('debug-form');
  const debugQuestion = document.getElementById('debug-question');
  const debugButton = document.getElementById('debug-button');
  const debugLabel = document.getElementById('debug-button-label');
  const debugStatus = document.getElementById('debug-status');
  const debugPanel = document.querySelector('.debug-panel');
  const output = document.getElementById('debug-output');
  const outputState = document.getElementById('debug-output-state');
  const outputQuestion = document.getElementById('debug-output-question');
  const debugError = document.getElementById('debug-error');
  const debugContent = document.getElementById('debug-content');
  const positions = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  const choices = [['3', '老阳 · 三个背（动）'], ['0', '老阴 · 三个字（动）'], ['2', '少阴 · 两背一字'], ['1', '少阳 · 两字一背']];
  const defaults = ['3', '0', '2', '1', '2', '1'];
  const selectors = [];
  const offline = window.location.protocol === 'file:';
  let maxLength = 20000;
  let savedValue = null;
  let revision = 0;
  let loading = false;
  let saving = false;
  let loadFailed = false;
  let saveFailure = '';
  let loadFailure = '';
  let debugging = false;
  let debugFailed = false;
  let debugSucceeded = false;
  let guardSaved = null;
  let guardSaving = false;
  let guardLoading = false;
  let guardLoadFailed = false;
  let guardFailure = '';
  let guardRevision = 0;

  positions.forEach((position, index) => {
    const row = document.createElement('div');
    row.className = 'line-picker';
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.id = 'debug-line-' + (index + 1);
    label.htmlFor = select.id;
    const number = document.createElement('small');
    number.textContent = String(index + 1).padStart(2, '0');
    label.append(number, position);
    choices.forEach(([value, text]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    select.value = defaults[index];
    selectors.push(select);
    row.append(label, select);
    document.getElementById('debug-lines').appendChild(row);
  });

  function validPrompt(value) {
    return value.trim().length > 0 && value.length <= maxLength;
  }

  function dirty() {
    return savedValue === null ? revision > 0 : editor.value !== savedValue;
  }

  function updateUI() {
    const value = editor.value;
    const valid = validPrompt(value);
    promptCount.textContent = value.length.toLocaleString('zh-CN') + ' / ' + maxLength.toLocaleString('zh-CN');
    saveButton.disabled = offline || loading || saving || !valid || !dirty();
    saveButton.textContent = saving ? '保存中…' : saveFailure ? '重试保存' : '立即保存';
    reloadButton.hidden = !loadFailed;
    reloadButton.disabled = loading || saving;
    debugButton.disabled = offline || debugging || !valid || !debugQuestion.value.trim() || debugQuestion.value.trim().length > 2000;
    debugLabel.textContent = debugging ? '调试中…' : debugFailed ? '重试调试' : debugSucceeded ? '再次调试' : '开始调试';
    let state = 'saved';
    let message = '已保存';
    let error = '';
    if (offline) {
      state = 'error'; message = '需要本地服务';
    } else if (loading) {
      state = 'loading'; message = '正在加载';
    } else if (saving) {
      state = 'saving'; message = '保存中';
    } else if (dirty() && !valid) {
      state = 'invalid'; message = '尚未保存';
      error = !value.trim() ? '提示词不能为空，请输入内容后点击「立即保存」。' : '提示词最多为 ' + maxLength.toLocaleString('zh-CN') + ' 个字符。';
    } else if (saveFailure) {
      state = 'error'; message = '保存失败'; error = saveFailure;
    } else if (dirty()) {
      state = 'dirty'; message = '待保存';
    } else if (loadFailed) {
      state = 'error'; message = '加载失败'; error = loadFailure;
    }
    promptStatus.dataset.state = state;
    promptStatus.textContent = message;
    promptError.textContent = error;
    promptError.hidden = !error;
  }

  async function fetchJSON(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      let data;
      try { data = await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw error;
        throw new Error('服务返回的内容不完整，请重试。');
      }
      if (!response.ok) {
        throw new Error(data && data.error && typeof data.error.message === 'string' ? data.error.message.slice(0, 500) : '请求未完成，请稍后重试。');
      }
      return data;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('等待服务超时，请重试。');
      if (error instanceof TypeError) throw new Error('暂时无法连接本地服务，请检查服务是否已启动。');
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function settingsData(data) {
    if (!data || typeof data.systemPrompt !== 'string' || !Number.isInteger(data.maxLength) || data.maxLength < 1 || data.maxLength > 20000 || !data.systemPrompt.trim() || data.systemPrompt.length > data.maxLength) {
      throw new Error('提示词配置格式异常，请重试加载。');
    }
    return data;
  }

  async function loadPrompt() {
    if (offline || loading || saving) return;
    const startRevision = revision;
    const keepDraft = dirty();
    loading = true;
    loadFailure = '';
    updateUI();
    try {
      const data = settingsData(await fetchJSON('/api/settings/prompt', { method: 'GET' }, 15000));
      maxLength = data.maxLength;
      editor.maxLength = maxLength;
      if (!keepDraft && revision === startRevision) editor.value = data.systemPrompt;
      savedValue = data.systemPrompt;
      loadFailed = false;
      saveFailure = '';
      editor.placeholder = '输入解卦使用的系统提示词…';
    } catch (error) {
      loadFailed = true;
      loadFailure = error.message + ' 已输入的草稿会保留。';
    } finally {
      loading = false;
      updateUI();
    }
  }

  async function savePrompt() {
    if (offline || loading || saving || !dirty() || !validPrompt(editor.value)) return;
    const draft = editor.value;
    const saveRevision = revision;
    saving = true;
    saveFailure = '';
    updateUI();
    try {
      const data = settingsData(await fetchJSON('/api/settings/prompt', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ systemPrompt: draft })
      }, 15000));
      savedValue = data.systemPrompt;
      maxLength = data.maxLength;
      editor.maxLength = maxLength;
      if (revision === saveRevision && editor.value === draft) editor.value = data.systemPrompt;
      loadFailed = false;
      saveFailure = '';
      savedTime.textContent = '已于 ' + new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()) + ' 保存，后续解卦立即生效。';
    } catch (error) {
      saveFailure = error.message;
    } finally {
      saving = false;
      updateUI();
    }
  }

  function guardDirty() {
    return guardSaved === null ? guardRevision > 0 : guardEditor.value !== guardSaved;
  }

  function validGuard(value) {
    return value.trim().length > 0 && value.length <= maxLength;
  }

  function updateGuardUI() {
    const value = guardEditor.value;
    const valid = validGuard(value);
    guardCount.textContent = value.length.toLocaleString('zh-CN') + ' / ' + maxLength.toLocaleString('zh-CN');
    guardSaveButton.disabled = offline || guardLoading || guardSaving || !valid || !guardDirty();
    guardSaveButton.textContent = guardSaving ? '保存中…' : guardFailure ? '重试保存' : '保存守门提示词';
    let state = 'saved';
    let message = '已保存';
    let error = '';
    if (offline) {
      state = 'error'; message = '需要本地服务';
    } else if (guardLoading) {
      state = 'loading'; message = '正在加载';
    } else if (guardSaving) {
      state = 'saving'; message = '保存中';
    } else if (guardDirty() && !valid) {
      state = 'invalid'; message = '尚未保存';
      error = !value.trim() ? '守门提示词不能为空，请输入内容后保存。'
        : '守门提示词最多为 ' + maxLength.toLocaleString('zh-CN') + ' 个字符。';
    } else if (guardFailure) {
      state = 'error'; message = '保存失败'; error = guardFailure;
    } else if (guardDirty()) {
      state = 'dirty'; message = '待保存';
    } else if (guardLoadFailed) {
      state = 'error'; message = '加载失败'; error = '守门提示词读取失败，请刷新后重试。';
    }
    guardStatus.dataset.state = state;
    guardStatus.textContent = message;
    guardError.textContent = error;
    guardError.hidden = !error;
  }

  async function loadGuardPrompt() {
    if (offline || guardLoading || guardSaving) return;
    const keepDraft = guardDirty();
    guardLoading = true;
    guardFailure = '';
    updateGuardUI();
    try {
      const data = await fetchJSON('/api/settings/guard-prompt', { method: 'GET' }, 15000);
      if (!data || typeof data.guardPrompt !== 'string' || !data.guardPrompt.trim()) {
        throw new Error('守门提示词配置格式异常，请重试加载。');
      }
      if (Number.isInteger(data.maxLength) && data.maxLength > 0) maxLength = data.maxLength;
      guardEditor.maxLength = maxLength;
      if (!keepDraft) guardEditor.value = data.guardPrompt;
      guardSaved = data.guardPrompt;
      guardLoadFailed = false;
    } catch (error) {
      guardLoadFailed = true;
      guardFailure = error.message;
    } finally {
      guardLoading = false;
      updateGuardUI();
    }
  }

  async function saveGuardPrompt() {
    if (offline || guardLoading || guardSaving || !guardDirty() || !validGuard(guardEditor.value)) return;
    const draft = guardEditor.value;
    guardSaving = true;
    guardFailure = '';
    updateGuardUI();
    try {
      const data = await fetchJSON('/api/settings/guard-prompt', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guardPrompt: draft })
      }, 15000);
      if (!data || typeof data.guardPrompt !== 'string' || !data.guardPrompt.trim()) {
        throw new Error('保存结果异常，请重试。');
      }
      guardSaved = data.guardPrompt;
      if (!guardDirty()) guardEditor.value = data.guardPrompt;
      guardLoadFailed = false;
      guardFailure = '';
      guardSavedTime.textContent = '已于 '
        + new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date())
        + ' 保存，此后的起卦审查立即生效。';
    } catch (error) {
      guardFailure = error.message;
    } finally {
      guardSaving = false;
      updateGuardUI();
    }
  }

  guardEditor.addEventListener('input', () => {
    guardRevision++;
    guardFailure = '';
    updateGuardUI();
  });
  guardSaveButton.addEventListener('click', saveGuardPrompt);

  editor.addEventListener('input', () => {
    revision++;
    saveFailure = '';
    updateUI();
  });
  saveButton.addEventListener('click', savePrompt);
  reloadButton.addEventListener('click', loadPrompt);
  debugQuestion.addEventListener('input', updateUI);
  window.addEventListener('beforeunload', event => {
    if (!offline && (dirty() || guardDirty() || saving || guardSaving)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  function debugLines() {
    return selectors.map(select => {
      const count = Number(select.value);
      return { coins: Array.from({ length: 3 }, (_, index) => index < count ? 'back' : 'front') };
    });
  }

  function renderLines(target, lines, highlight) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const icons = lines.slice().reverse().map(line => {
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 72 12');
      if (highlight && line.moving) svg.setAttribute('class', 'moving');
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', line.yang ? 'M2 6h68' : 'M2 6h25m18 0h25');
      svg.appendChild(path);
      return svg;
    });
    target.replaceChildren(...icons);
  }

  function renderHexagrams(data, inputLines) {
    const engine = window.YaoGua;
    if (!engine) return;
    const lines = inputLines.map(line => engine.classifyCoins(line.coins));
    const changed = engine.changeLines(lines);
    const received = data.hexagram;
    const primary = received && received.primary && typeof received.primary.fullName === 'string' ? received.primary : engine.describeHexagram(lines);
    const changing = received && received.changed && typeof received.changed.fullName === 'string' ? received.changed : engine.describeHexagram(changed);
    document.getElementById('debug-primary-name').textContent = primary.fullName;
    document.getElementById('debug-changed-name').textContent = changing.fullName;
    renderLines(document.getElementById('debug-primary-lines'), lines, true);
    renderLines(document.getElementById('debug-changed-lines'), changed, false);
    const moving = lines.flatMap((line, index) => line.moving ? [positions[index]] : []);
    document.getElementById('debug-moving-lines').textContent = moving.length ? '动爻：' + moving.join('、') + '。动爻阴阳互换，形成变卦。' : '六爻皆静，本卦与变卦相同。';
    document.getElementById('debug-hexagrams').hidden = false;
  }

  debugForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (offline || debugging || !validPrompt(editor.value) || !debugQuestion.value.trim() || debugQuestion.value.trim().length > 2000) return;
    const request = { question: debugQuestion.value.trim(), lines: debugLines(), systemPrompt: editor.value };
    debugging = true;
    debugFailed = false;
    output.hidden = false;
    debugPanel.setAttribute('aria-busy', 'true');
    output.setAttribute('aria-busy', 'true');
    outputQuestion.textContent = request.question;
    outputState.textContent = '调试中';
    debugError.hidden = true;
    debugContent.hidden = true;
    document.getElementById('debug-hexagrams').hidden = true;
    const started = performance.now();
    const elapsed = () => ((performance.now() - started) / 1000).toFixed(1) + ' 秒';
    debugStatus.textContent = '正在调试，请稍候…';
    const ticker = window.setInterval(() => { debugStatus.textContent = '正在调试 · ' + elapsed(); }, 1000);
    updateUI();
    try {
      const data = await fetchJSON('/api/debug/interpret', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request)
      }, 75000);
      if (!data || typeof data.interpretation !== 'string' || !data.interpretation.trim()) throw new Error('暂未收到完整解读，请重试调试。');
      renderHexagrams(data, request.lines);
      debugContent.textContent = data.interpretation.trim();
      debugContent.hidden = false;
      debugSucceeded = true;
      outputState.textContent = '调试完成';
      debugStatus.textContent = '调试完成 · 用时 ' + elapsed();
    } catch (error) {
      debugFailed = true;
      debugError.textContent = error.message;
      debugError.hidden = false;
      outputState.textContent = '暂未完成';
      debugStatus.textContent = '调试未完成 · 用时 ' + elapsed() + '，可重试';
    } finally {
      window.clearInterval(ticker);
      debugging = false;
      debugPanel.setAttribute('aria-busy', 'false');
      output.setAttribute('aria-busy', 'false');
      updateUI();
    }
  });

  if (offline) {
    document.getElementById('service-guide').hidden = false;
    editor.disabled = true;
    guardEditor.disabled = true;
    debugQuestion.disabled = true;
    selectors.forEach(select => { select.disabled = true; });
    debugStatus.textContent = '通过本地服务打开后，即可在线调试。';
    updateGuardUI();
    updateUI();
  } else {
    loadPrompt();
    loadGuardPrompt();
  }
})();
