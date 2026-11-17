'use strict';

(() => {
  const byId = id => document.getElementById(id);
  const CLOSE_AT = Date.parse('2026-11-27T12:00:00+08:00');
  const REPORT_AT = Date.parse('2026-11-28T16:00:00+08:00');
  const CHANNEL = 'taipeivote-bridge-v1';
  const config = window.POLL_CONFIG || {};
  const names = candidates.map(c => c.name);
  const byNumber = new Map(candidates.map(c => [c.number, c]));
  const overlay = byId('candidate-overlay'), voteDialog = byId('vote-dialog');
  const profileDialog = byId('profile-dialog'), form = byId('profile-form');
  const frame = byId('bridge'), pending = new Map();
  let booth = null, source = null, sourceOrigin = '', connection = false, configured = false;
  let serverOffset = 0, chosen = null, session = null, busy = false, googleReady = false;
  let codeClient = null, reportLoading = false, reportLoaded = false, stage = 'signin';
  let controller = '', contact = '', retention = '';

  function make(tag, className, label) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (label !== undefined) node.textContent = label;
    return node;
  }
  function message(text = '') { byId('dialog-message').textContent = text; }
  function notice(text = '') { byId('notice').textContent = text; byId('notice').hidden = !text; }
  function currentPhase() {
    const now = Date.now() + serverOffset;
    return now < CLOSE_AT ? 'open' : now < REPORT_AT ? 'closed' : 'report';
  }
  function showStage(next) {
    stage = next;
    byId('signin-step').hidden = next !== 'signin';
    form.hidden = next !== 'form';
    byId('confirm-step').hidden = next !== 'confirm';
    byId('done-step').hidden = next !== 'done';
    byId('dialog-title').textContent = ({signin: '登入後繼續', form: '填寫基本資料', confirm: '確認你的選擇', done: '感謝參與'})[next];
  }
  function updatePhase() {
    const phase = currentPhase();
    byId('vote-view').hidden = phase !== 'open';
    byId('closed-view').hidden = phase !== 'closed';
    byId('report-view').hidden = phase !== 'report';
    if (phase !== 'open' && voteDialog.open && !busy) voteDialog.close();
    if (phase === 'report' && !reportLoaded && !reportLoading) void loadReport();
  }

  for (const person of candidates) {
    const row = make('div', 'candidate-item'); row.setAttribute('role', 'listitem');
    const choose = make('button', 'candidate-select'); choose.type = 'button';
    choose.setAttribute('aria-label', `選擇 ${person.number} 號 ${person.name} 投票`);
    choose.append(make('span', 'candidate-number', String(person.number)), make('span', '', person.name));
    choose.addEventListener('click', () => openVote(person.number));
    const details = make('button', 'candidate-details'); details.type = 'button';
    details.setAttribute('aria-label', `查看 ${person.name} 的照片、經歷與政見`);
    details.append(make('span', '', 'i')); details.addEventListener('click', () => openProfile(person.number));
    row.append(choose, details); overlay.append(row);
  }

  function openProfile(number) {
    const person = byNumber.get(number), profile = candidateProfiles[number];
    if (!person || !profile) return;
    byId('profile-title').textContent = `${number} 號 ${person.name}`;
    byId('profile-party').textContent = person.party;
    const image = byId('profile-image'); image.src = `assets/candidates/${number}.png`; image.alt = `${person.name}的照片`;
    byId('profile-bio').textContent = profile.bio;
    byId('profile-policy').replaceChildren(...profile.policy.map(text => make('li', '', text)));
    byId('profile-source').href = bulletinUrl;
    profileDialog.showModal();
  }
  byId('profile-close').addEventListener('click', () => profileDialog.close());

  function openVote(number) {
    if (currentPhase() !== 'open') { updatePhase(); return; }
    chosen = byNumber.get(number); if (!chosen) return;
    session = null; form.reset(); showStage('signin');
    byId('chosen-candidate').textContent = `你選擇了 ${chosen.number} 號 ${chosen.name}`;
    byId('google-signin').disabled = !configured || !googleReady;
    message(!configured ? '投票系統尚未完成連線，暫時無法送票。' : !googleReady ? '正在準備 Google 登入，請稍候。' : '');
    voteDialog.showModal();
  }
  function setBusy(value) {
    busy = value;
    byId('dialog-close').disabled = value;
    byId('submit-vote').disabled = value;
    byId('back-form').disabled = value;
    byId('google-signin').disabled = value || !configured || !googleReady;
  }
  byId('dialog-close').addEventListener('click', () => { if (!busy) voteDialog.close(); });
  voteDialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  voteDialog.addEventListener('close', () => { session = null; form.reset(); message(); });
  byId('finish').addEventListener('click', () => voteDialog.close());

  function belongsToFrame(other) {
    try {
      let current = other;
      for (let depth = 0; current && depth < 5; depth++) {
        if (current === frame.contentWindow) return true;
        if (current === window || current === current.parent) return false;
        current = current.parent;
      }
    } catch (_) { return false; }
    return false;
  }
  function allowedGoogleOrigin(origin) {
    try { const url = new URL(origin); return url.protocol === 'https:' && url.hostname.endsWith('-script.googleusercontent.com'); }
    catch (_) { return false; }
  }
  function callBackend(request) {
    return new Promise((resolve, reject) => {
      if (!connection || !source) { reject(new Error('系統尚未連線。')); return; }
      const id = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('連線逾時，請稍後重新登入確認是否已送出。')); }, 30000);
      pending.set(id, {resolve, reject, timer});
      source.postMessage({channel: CHANNEL, type: 'request', id, request}, sourceOrigin);
    });
  }
  window.addEventListener('message', event => {
    if (!allowedGoogleOrigin(event.origin) || !belongsToFrame(event.source)) return;
    const data = event.data;
    if (!data || data.channel !== CHANNEL) return;
    if (data.type === 'ready') {
      source = event.source; sourceOrigin = event.origin; connection = true;
      void refreshStatus(); return;
    }
    if (data.type !== 'response' || event.source !== source || event.origin !== sourceOrigin) return;
    const request = pending.get(data.id); if (!request) return;
    clearTimeout(request.timer); pending.delete(data.id);
    if (!data.result || !data.result.ok) request.reject(new Error(data.result?.message || '無法完成操作，請稍後再試。'));
    else request.resolve(data.result);
  });
  async function refreshStatus() {
    try {
      const status = await callBackend({action: 'status'});
      if (Number.isFinite(status.serverTime)) serverOffset = status.serverTime - Date.now();
      controller = status.controller; contact = status.contact; retention = status.retention;
      byId('privacy-text').textContent = `資料管理者：${controller}；聯絡方式：${contact}；保存期間：${retention}。姓名、年齡、性別、學歷與學校會儲存在 Google 試算表，用於防止重複投票與統計，可能由 Google 在臺灣境外處理。可透過上述方式查詢、更正或要求刪除個人資料；刪除身分資料不等於撤銷已併入的統計。不同意者可不參與。`;
      configured = true;
      notice(); updatePhase();
      byId('google-signin').disabled = !googleReady;
      if (voteDialog.open && stage === 'signin') message(googleReady ? '' : '正在準備 Google 登入，請稍候。');
    } catch (error) {
      connection = false; configured = false; byId('google-signin').disabled = true;
      notice('投票系統尚未完成連線，暫時無法送票。');
    }
  }
  async function loadReport() {
    reportLoading = true;
    if (!connection) { byId('report-status').textContent = '統計資料尚未連線，請稍後再來。'; reportLoading = false; return; }
    try {
      const result = await callBackend({action: 'report'});
      drawReport(byId('report-content'), result.report, names);
      reportLoaded = true;
    } catch (error) {
      const status = byId('report-status'); if (status) status.textContent = error.message;
    } finally { reportLoading = false; }
  }

  function initializeGoogle() {
    if (!window.google?.accounts?.oauth2 || !config.googleClientId) return;
    codeClient = window.google.accounts.oauth2.initCodeClient({
      client_id: config.googleClientId, scope: 'openid email', ux_mode: 'popup', select_account: true,
      callback: async response => {
        if (!voteDialog.open || stage !== 'signin') return;
        if (!response.code) { message('Google 登入未完成，請再試一次。'); return; }
        setBusy(true); message('正在驗證帳號…');
        try {
          const result = await callBackend({action: 'login', code: response.code});
          if (result.voted) {
            showStage('done'); byId('done-message').textContent = '此 Google 帳號已完成投票，感謝參與。';
          } else {
            session = result.session; showStage('form');
          }
          message();
        } catch (error) { message(error.message); }
        finally { setBusy(false); }
      },
      error_callback: () => message('Google 登入未完成。如視窗無法開啟，請使用 Safari 或 Chrome 再試。'),
    });
    googleReady = true; byId('google-signin').disabled = !configured;
    if (voteDialog.open && stage === 'signin' && configured) message();
  }
  byId('google-signin').addEventListener('click', () => { if (!busy && configured && codeClient) codeClient.requestCode(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!session || !chosen || busy || !form.reportValidity()) return;
    byId('confirm-choice').textContent = `${chosen.number} 號 ${chosen.name}`;
    message(); showStage('confirm');
  });
  byId('back-form').addEventListener('click', () => { message(); showStage('form'); });
  byId('submit-vote').addEventListener('click', async () => {
    if (!session || !chosen || busy) return;
    if (currentPhase() !== 'open') { message('投票已截止，未送出資料。'); return; }
    const fields = new FormData(form);
    const vote = {candidate: chosen.number, name: fields.get('name'), age: fields.get('age'), gender: fields.get('gender'), education: fields.get('education'), school: fields.get('school'), consent: fields.get('consent') === 'on'};
    setBusy(true); message('正在送出，請稍候…');
    try {
      const result = await callBackend({action: 'vote', session, vote});
      session = null; showStage('done');
      byId('done-message').textContent = result.alreadyVoted ? '此 Google 帳號已完成投票，感謝參與。' : '你的選擇已送出，感謝參與。';
      message();
    } catch (error) { message(error.message); }
    finally { setBusy(false); }
  });

  try {
    booth = createVotingBooth({candidates, onPick: number => openVote(number)});
    booth.showIn(byId('home-scene')); booth.setView('overview');
    byId('home-scene').querySelector('.scene-status').hidden = true;
  } catch (_) { byId('home-scene').querySelector('.scene-status').textContent = '3D 場景暫時無法顯示，仍可使用下方名字選擇。'; }

  const validUrl = typeof config.bridgeUrl === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.bridgeUrl);
  if (validUrl && typeof config.googleClientId === 'string' && config.googleClientId.endsWith('.apps.googleusercontent.com')) {
    frame.src = config.bridgeUrl;
    const script = document.createElement('script'); script.src = 'https://accounts.google.com/gsi/client'; script.onload = initializeGoogle;
    script.onerror = () => { if (voteDialog.open) message('Google 登入無法載入，請稍後再試。'); };
    document.head.append(script);
    setTimeout(() => { if (!connection) notice('投票系統目前無法連線，請稍後再試。'); }, 15000);
  } else notice('投票系統尚未完成 Google 設定，目前暫不收票。');
  updatePhase();
  setInterval(updatePhase, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (connection) void refreshStatus(); else updatePhase(); } });
})();
