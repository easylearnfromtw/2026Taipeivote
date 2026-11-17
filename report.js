'use strict';

// Presentation only; the server is responsible for the release time and suppression.
function drawReport(target, report, names) {
  const colors = ['#1c5fae', '#e38132', '#5d8ec6', '#78908f', '#344c75', '#bc7951'];
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const card = (title, meta, full = false) => {
    const node = el('section', `report-card${full ? ' full' : ''}`);
    node.append(el('h2', '', title), el('p', 'meta', meta));
    return node;
  };
  const percent = (n, total) => `${(n / total * 100).toFixed(1)}%`;
  target.replaceChildren();
  if (!report || !report.overall || !report.total) {
    target.append(el('p', 'notice', '目前樣本不足，或部分分組樣本過少，暫不顯示統計結果。'));
    return;
  }
  const grid = el('div', 'report-grid');
  const overall = card('整體選擇', '依本站參與者填答計算');
  overall.append(el('p', 'metric', `${report.total.toLocaleString('zh-TW')} 人`));
  const bars = el('div', 'overall-list');
  report.overall.counts.forEach((n, index) => {
    const row = el('div', 'bar-row');
    const track = el('div', 'bar-track'), fill = el('div', 'bar-fill');
    fill.style.width = percent(n, report.total); fill.style.background = colors[index];
    track.append(fill);
    row.append(el('strong', '', names[index]), track, el('strong', '', percent(n, report.total)));
    bars.append(row);
  });
  overall.append(bars);
  const overview = card('閱讀說明', '認識這份資料的範圍');
  const info = el('div', 'report-explainer');
  info.append(el('p', '', '這是開放式線上填答，參與者自行選擇是否填寫。'));
  info.append(el('p', '', '一個 Google 帳號限填一次，但無法確認是否為不同自然人或具投票資格。'));
  info.append(el('p', '', '統計僅供了解本站參與者，不適合推論全體臺北市選民。'));
  overview.append(info);
  grid.append(overall, overview);
  function addDimension(title, dimension) {
    const node = card(title, '各色長條代表該分組內的選擇比例', true);
    const breakdown = el('div', 'breakdown');
    if (!dimension || !dimension.length) breakdown.append(el('p', 'meta', '樣本不足或有分組過小，暫不顯示。'));
    else dimension.forEach(group => {
      const row = el('div', 'breakdown-row'), stack = el('div', 'stack');
      const details = [];
      group.counts.forEach((n, index) => {
        const segment = el('span'); segment.style.width = percent(n, group.total); segment.style.background = colors[index];
        stack.append(segment); details.push(`${names[index]} ${percent(n, group.total)}`);
      });
      stack.setAttribute('aria-hidden', 'true');
      row.append(el('strong', '', group.label), stack, el('span', 'breakdown-detail', `${details.join(' · ')}（${group.total} 人）`));
      breakdown.append(row);
    });
    node.append(breakdown);
    if (dimension && dimension.length) {
      const legend = el('div', 'legend');
      names.forEach((name, i) => { const item = el('span'); const dot = el('i'); dot.style.background = colors[i]; item.append(dot, document.createTextNode(name)); legend.append(item); });
      node.append(legend);
    }
    grid.append(node);
  }
  addDimension('年齡層與選擇', report.age);
  addDimension('最高學歷與選擇', report.education);
  addDimension('性別與選擇', report.gender);
  target.append(grid);
}
