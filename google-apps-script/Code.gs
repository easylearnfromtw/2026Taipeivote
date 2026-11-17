/* 2026 Taipei Vote: Google Apps Script backend. See SETUP.md before deploying. */
const SITE_ORIGIN = 'https://easylearnfromtw.github.io';
const CLOSE_AT = Date.parse('2026-11-27T12:00:00+08:00');
const REPORT_AT = Date.parse('2026-11-28T16:00:00+08:00');
const MIN_GROUP = 30;
const MIN_CELL = 5;
const EDUCATION = ['國小及以下', '國中', '高中職', '專科', '大學', '碩士', '博士', '其他'];
const GENDERS = ['女', '男', '非二元／其他', '不願透露'];

function phase_(at) {
  const time = at instanceof Date ? at.getTime() : Number(at);
  if (!Number.isFinite(time)) throw new Error('時間無效');
  return time < CLOSE_AT ? 'open' : time < REPORT_AT ? 'closed' : 'report';
}

function textField_(value, label, max) {
  if (typeof value !== 'string') throw new Error(`請填寫${label}。`);
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (!cleaned || cleaned.length > max) throw new Error(`請填寫有效的${label}。`);
  return cleaned;
}

function normalizeVote_(input) {
  if (!input || input.consent !== true) throw new Error('請先閱讀並同意資料使用說明。');
  const ageText = typeof input.age === 'string' || typeof input.age === 'number' ? String(input.age).trim() : '';
  const candidate = Number(input.candidate), age = Number(ageText);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 6) throw new Error('請選擇候選人。');
  if (!/^\d{1,3}$/.test(ageText) || !Number.isInteger(age) || age < 0 || age > 120) throw new Error('請填寫有效年齡。');
  const name = textField_(input.name, '名稱', 40), school = textField_(input.school, '學校名稱', 100);
  if (!GENDERS.includes(input.gender) || !EDUCATION.includes(input.education)) throw new Error('請選擇性別與最高學歷。');
  const ageBand = age < 18 ? '未滿18' : age < 25 ? '18–24' : age < 35 ? '25–34' : age < 45 ? '35–44' : age < 55 ? '45–54' : age < 65 ? '55–64' : '65以上';
  return {candidate, name, age, ageBand, gender: input.gender, education: input.education, school};
}

function publicResults_(rows) {
  const groups = new Map();
  for (const row of rows) {
    const [dimension, label, number, rawCount] = row;
    if (!['all', 'age', 'education', 'gender'].includes(dimension) || typeof label !== 'string') continue;
    const candidate = Number(number), count = Number(rawCount);
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > 6 || !Number.isSafeInteger(count) || count < 0) continue;
    const key = `${dimension}\u0000${label}`;
    if (!groups.has(key)) groups.set(key, {dimension, label, counts: [0, 0, 0, 0, 0, 0]});
    groups.get(key).counts[candidate - 1] += count;
  }
  const visible = item => {
    const total = item.counts.reduce((sum, n) => sum + n, 0);
    if (total < MIN_GROUP || item.counts.some(n => n > 0 && n < MIN_CELL)) return null;
    return {label: item.label, total, counts: item.counts};
  };
  const overall = groups.get('all\u0000全部');
  const safeOverall = overall ? visible(overall) : null;
  const order = {age: ['未滿18', '18–24', '25–34', '35–44', '45–54', '55–64', '65以上'], education: EDUCATION, gender: GENDERS};
  const list = dimension => {
    if (!safeOverall) return [];
    const dimensionGroups = [...groups.values()].filter(g => g.dimension === dimension).map(visible);
    // Withhold a whole dimension when a hidden group could be reconstructed from the total.
    if (dimensionGroups.some(g => !g)) return [];
    return dimensionGroups.sort((a, b) => order[dimension].indexOf(a.label) - order[dimension].indexOf(b.label));
  };
  return {total: safeOverall ? safeOverall.total : null, overall: safeOverall, age: list('age'), education: list('education'), gender: list('gender')};
}

function config_() {
  const p = PropertiesService.getScriptProperties();
  const config = {
    sheetId: p.getProperty('SHEET_ID'), clientId: p.getProperty('GOOGLE_CLIENT_ID'),
    clientSecret: p.getProperty('GOOGLE_CLIENT_SECRET'), key: p.getProperty('HASH_KEY'),
    controller: p.getProperty('PRIVACY_CONTROLLER'), contact: p.getProperty('PRIVACY_CONTACT'),
    retention: p.getProperty('RETENTION_POLICY'),
  };
  if (Object.values(config).some(x => !x)) throw new Error('投票系統尚未完成設定。');
  return config;
}

// Run once from the editor. Fill the remaining Script Properties before deployment.
function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('請從 Google 試算表的「擴充功能 → Apps Script」開啟。');
  const properties = PropertiesService.getScriptProperties();
  properties.setProperty('SHEET_ID', spreadsheet.getId());
  if (!properties.getProperty('HASH_KEY')) properties.setProperty('HASH_KEY', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  for (const [name, headers] of [
    ['Voters', ['帳號去重碼', '名稱', '年齡', '性別', '最高學歷', '學校名稱']],
    ['Counts', ['類型', '分組', '候選人號次', '票數']],
  ]) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) sheet = spreadsheet.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Bridge').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function api(request) {
  try {
    const cfg = config_(), action = request && request.action;
    if (action === 'status') return {ok: true, phase: phase_(new Date()), serverTime: Date.now(), controller: cfg.controller, contact: cfg.contact, retention: cfg.retention};
    if (action === 'login') return login_(request.code, cfg);
    if (action === 'vote') return vote_(request, cfg);
    if (action === 'report') {
      if (phase_(new Date()) !== 'report') throw new Error('統計資料尚未開放。');
      const sheet = SpreadsheetApp.openById(cfg.sheetId).getSheetByName('Counts');
      if (!sheet) throw new Error('資料表尚未完成設定。');
      return {ok: true, report: publicResults_(sheet.getDataRange().getValues().slice(1))};
    }
    throw new Error('無效的操作。');
  } catch (error) {
    return {ok: false, message: error && error.publicMessage ? error.publicMessage : '目前無法完成操作，請稍後再試。'};
  }
}

function expectedError_(message) {
  const error = new Error(message); error.publicMessage = message; throw error;
}

function hash_(text, key) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, key)).replace(/=+$/, '');
}

function login_(code, cfg) {
  if (phase_(new Date()) !== 'open') expectedError_('投票已截止。');
  if (typeof code !== 'string' || code.length < 10 || code.length > 2048) expectedError_('Google 登入資訊已失效，請重新登入。');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: {code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: SITE_ORIGIN, grant_type: 'authorization_code'},
  });
  if (response.getResponseCode() !== 200) expectedError_('Google 登入未完成，請重新登入。');
  const token = JSON.parse(response.getContentText());
  if (typeof token.id_token !== 'string') expectedError_('無法確認 Google 帳號，請重新登入。');
  // This ID token is received directly from Google's token endpoint over HTTPS.
  const parts = token.id_token.split('.');
  if (parts.length !== 3) expectedError_('登入資訊無效。');
  const claims = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
  if (claims.aud !== cfg.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
      || typeof claims.sub !== 'string' || !claims.sub || !Number.isFinite(Number(claims.exp)) || Number(claims.exp) * 1000 <= Date.now()
      || !(claims.email_verified === true || claims.email_verified === 'true')) expectedError_('無法確認 Google 帳號。');
  const voterKey = hash_(claims.sub, cfg.key);
  const sheet = SpreadsheetApp.openById(cfg.sheetId).getSheetByName('Voters');
  if (!sheet) throw new Error('Missing Voters sheet');
  const found = sheet.getLastRow() > 1 && sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().some(row => row[0] === voterKey);
  if (found) return {ok: true, voted: true};
  const session = hash_('session:' + Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid(), cfg.key);
  CacheService.getScriptCache().put('session:' + hash_(session, cfg.key), voterKey, 600);
  return {ok: true, voted: false, session};
}

function vote_(request, cfg) {
  if (phase_(new Date()) !== 'open') expectedError_('投票已截止，未送出資料。');
  if (typeof request.session !== 'string' || request.session.length > 100) expectedError_('登入已失效，請重新登入。');
  const cache = CacheService.getScriptCache(), key = 'session:' + hash_(request.session, cfg.key);
  const voterKey = cache.get(key);
  if (!voterKey) expectedError_('登入已失效，請重新登入。');
  let entry;
  try { entry = normalizeVote_(request.vote); } catch (error) { expectedError_(error.message); }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) expectedError_('目前忙碌中，請稍後再試。');
  try {
    if (phase_(new Date()) !== 'open') expectedError_('投票已截止，未送出資料。');
    const spreadsheet = SpreadsheetApp.openById(cfg.sheetId), voters = spreadsheet.getSheetByName('Voters'), counts = spreadsheet.getSheetByName('Counts');
    if (!voters || !counts) throw new Error('Missing sheets');
    const used = voters.getLastRow() > 1 && voters.getRange(2, 1, voters.getLastRow() - 1, 1).getValues().some(row => row[0] === voterKey);
    if (used) { cache.remove(key); return {ok: true, alreadyVoted: true}; }
    if (voters.getLastRow() + 1 > voters.getMaxRows()) {
      voters.insertRowsAfter(voters.getMaxRows(), 1000);
      SpreadsheetApp.flush();
    }
    const data = [{range: `Voters!A${voters.getLastRow() + 1}:F${voters.getLastRow() + 1}`,
      values: [[voterKey, entry.name, entry.age, entry.gender, entry.education, entry.school]]}];
    const existing = counts.getDataRange().getValues().slice(1);
    let nextRow = counts.getLastRow() + 1;
    for (const [dimension, label] of [['all', '全部'], ['age', entry.ageBand], ['education', entry.education], ['gender', entry.gender]]) {
      const index = existing.findIndex(row => row[0] === dimension && row[1] === label && Number(row[2]) === entry.candidate);
      const row = index < 0 ? nextRow++ : index + 2;
      const previous = index < 0 ? 0 : Number(existing[index][3]);
      if (!Number.isSafeInteger(previous) || previous < 0) throw new Error('Invalid count');
      data.push({range: `Counts!A${row}:D${row}`, values: [[dimension, label, entry.candidate, previous + 1]]});
    }
    // One atomic Sheets API request records the deduplication row and aggregate counters.
    // RAW keeps text such as =HYPERLINK(...) from becoming a spreadsheet formula.
    Sheets.Spreadsheets.Values.batchUpdate({valueInputOption: 'RAW', data}, cfg.sheetId);
    cache.remove(key);
    return {ok: true, alreadyVoted: false};
  } finally { lock.releaseLock(); }
}
