
'use strict';
const SNAPSHOT = JSON.parse(document.getElementById('snapshot-data').textContent);
const $ = id => document.getElementById(id);
const originalLogMain = document.querySelector('main');
const originalDetail = document.querySelector('.detail');
const callsRoot = $('calls');
const graphLink = $('graph-link');
const logLink = document.querySelector('.view-nav a[aria-current="page"]');
let selectedId = SNAPSHOT.experiments[new URLSearchParams(location.search).get('case')] || SNAPSHOT.selectedId;

function make(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function readable(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function timeLabel(value) {
  if (!value) return '時刻未記録';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}
function phaseLabel(call) {
  if (call.blocked) return 'ブロック判定あり';
  if ((call.phases || []).includes('post_tool_use')) return '実行後の記録あり';
  if ((call.phases || []).includes('pre_tool_use')) return '実行前の記録';
  return '記録あり';
}
function projectLabel(call) {
  const root = SNAPSHOT.scopes.scopes.find(scope => scope.workspace_id === call.workspace_id)?.workspace_root;
  return root ? `${root.split('/').filter(Boolean).pop()} — ${root}` : String(call.workspace_id ?? '未記録');
}
function renderValue(section, value) {
  const labels = {cmd:'実行コマンド', command:'実行コマンド', stdout:'標準出力', stderr:'エラー出力', exit_code:'終了コード', workdir:'作業フォルダー', path:'対象パス', url:'URL', output:'出力内容', text:'テキスト', content:'内容'};
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value);
    if (!entries.length) section.append(make('pre', '{}'));
    for (const [key, content] of entries) {
      section.append(make('h4', labels[key] || key), make('pre', content === '' ? '（空の文字列）' : readable(content)));
    }
  } else section.append(make('pre', value === '' ? '（空の文字列）' : readable(value)));
}
function renderDetail(call) {
  const data = SNAPSHOT.details[call.event_id];
  $('title').textContent = call.tool_name;
  $('identity').textContent = `${timeLabel(call.recorded_at)} · ${phaseLabel(call)} · プロジェクト: ${projectLabel(call)} · セッション: ${call.session_id ?? '未記録'}`;
  $('decisions').replaceChildren();
  if (!data) {
    $('decisions').append(make('p', 'この呼び出しの詳細は保存時に取得できませんでした。', 'hint'));
    $('io').replaceChildren();
    return;
  }
  if (!(data.decisions || []).length && !(data.judgments || []).length) $('decisions').append(make('p', '判定は未記録です。許可・成功を意味するものではありません。', 'hint'));
  const pending = (data.judgments || []).find(judgment => judgment.state !== 'complete' || judgment.held);
  if (pending) {
    const box = make('div', undefined, 'decision');
    box.append(make('strong', pending.state === 'complete' ? '再判定が完了しました' : '判定中・実行を保留'), make('p', pending.state === 'complete' ? '保留後の再判定結果です。操作を自動実行した記録ではありません。' : '判定を完了するために再試行します。流出検出による拒否とは異なります。'), make('small', `判定の試行 ${pending.attempts}回`));
    $('decisions').append(box);
  }
  for (const decision of data.decisions || []) {
    const box = make('div', undefined, decision.action === 'block' ? 'decision blocked' : 'decision');
    box.append(make('strong', decision.action === 'block' ? 'ToolUseProxy: ブロック判定' : `ToolUseProxy: ${decision.action}`), make('p', pending?.held ? `再検査の結果: ${decision.reason}` : decision.user_message || decision.reason), make('small', `${decision.hook_event || 'Hook未記録'} · ${timeLabel(decision.created_at)}`));
    $('decisions').append(box);
  }
  $('io').replaceChildren();
  for (const [label, key] of [['入力','tool_input'], ['出力','tool_response']]) {
    const event = [...(data.events || [])].reverse().find(item => Object.hasOwn(item.payload, key));
    const section = make('article'); section.append(make('h3', label));
    if (!event) section.append(make('p', 'まだ記録がありません', 'hint'));
    else renderValue(section, event.payload[key]);
    $('io').append(section);
  }
  const raw = make('details');
  raw.append(make('summary', `技術的な詳細・公開用の記録（${(data.events || []).length}件）`), make('p', `Call: ${call.tool_use_id || '未記録'} · Session: ${call.session_id || '未記録'}`, 'hint'));
  for (const event of data.events || []) raw.append(make('h3', `${event.phase} · ${timeLabel(event.recorded_at)}`), make('pre', JSON.stringify(event.payload, null, 2)));
  $('io').append(raw);
}
function visibleCalls() {
  return SNAPSHOT.events.calls.filter(call => !$('blocked-only').checked || call.blocked);
}
function renderCalls() {
  const calls = visibleCalls();
  callsRoot.replaceChildren(); $('count').textContent = `${calls.length}件`;
  for (const call of calls) {
    const button = make('button', undefined, 'call');
    button.classList.toggle('selected', call.event_id === selectedId);
    button.setAttribute('aria-pressed', String(call.event_id === selectedId));
    const top = make('div', undefined, 'call-top');
    const name = make('strong', call.tool_name); name.title = call.tool_name;
    const stamp = make('time', timeLabel(call.recorded_at).replace(/^\d+\/\d+\/\d+\s/, '')); stamp.title = timeLabel(call.recorded_at);
    top.append(name, stamp);
    const meta = make('div', undefined, 'call-meta');
    meta.append(make('span', phaseLabel(call), call.blocked ? 'badge badge-blocked' : 'badge'), make('span', `${projectLabel(call).split(' — ')[0]} · ${call.session_id ?? '未記録'}`, 'context'));
    button.append(top, meta);
    button.onclick = () => { selectedId = call.event_id; $('follow').checked = false; renderCalls(); renderDetail(call); };
    callsRoot.append(button);
  }
  if (!calls.length) callsRoot.append(make('p', 'この条件に一致する呼び出しはありません。', 'empty'));
  const selected = calls.find(call => call.event_id === selectedId) || calls[0];
  if (selected && selected.event_id !== selectedId) { selectedId = selected.event_id; renderDetail(selected); }
  $('active-scope').textContent = $('blocked-only').checked ? 'ブロック判定のみ · 保存済みスナップショット' : '保存版 · 内部メモ・PC固有情報は省略';
}

const settings = $('settings-dialog');
$('display-settings').onclick = () => settings.showModal();
$('close-settings').onclick = () => settings.close();
settings.addEventListener('click', event => { if (event.target === settings) settings.close(); });
$('blocked-only').onchange = renderCalls;
$('follow').onchange = () => { if ($('follow').checked) { selectedId = visibleCalls()[0]?.event_id || selectedId; renderCalls(); const call = SNAPSHOT.events.calls.find(item => item.event_id === selectedId); if (call) renderDetail(call); } };
document.querySelector('.filters').onsubmit = event => event.preventDefault();

for (const id of ['workspace','session']) {
  const select = $(id), trigger = $(`${id}-trigger`), options = $(`${id}-options`), value = $(`${id}-value`);
  trigger.onclick = () => { options.hidden = !options.hidden; trigger.setAttribute('aria-expanded', String(!options.hidden)); };
  for (const option of options.children) option.onclick = () => {
    select.value = option.dataset.value; value.textContent = option.textContent; trigger.title = option.textContent;
    [...options.children].forEach(item => item.setAttribute('aria-selected', String(item === option)));
    options.hidden = true; trigger.setAttribute('aria-expanded', 'false');
  };
}

function graphElement(tag, attrs = {}, text = '') {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  element.textContent = text; return element;
}
function showGraphDetail(node) {
  const root = $('offline-graph-detail');
  root.replaceChildren(make('h2', node.tool || 'ToolCall'), make('p', `${timeLabel(node.time)} · セッション: ${node.session}`, 'hint'));
  const box = make('div', undefined, 'decision');
  box.append(make('strong', node.complete ? '来歴解析済み' : '依存関係に未解析あり'), make('p', node.complete ? 'この呼び出しの依存関係を解析しました。' : '一部の依存関係は未解析です。検査済み安全を意味しません。'));
  root.append(box, make('h3', '関連する資源'));
  const list = make('ul', undefined, 'resource-list');
  for (const access of node.accesses || []) { const item = make('li', access.path); item.append(make('span', `${access.mode === 'write' ? '書込み' : '読取り'}${access.protected ? ' · 判定時の保護情報源' : ''}`)); list.append(item); }
  root.append(list);
}
function drawGraph(eventId) {
  const data = SNAPSHOT.graphs[eventId];
  const root = $('offline-graph'); root.replaceChildren();
  if (!data || !(data.nodes || []).length) { $('offline-graph-status').textContent = 'この呼び出しの来歴グラフはありません。'; $('offline-graph-detail').replaceChildren(make('h2', '来歴グラフはありません')); return; }
  $('offline-graph-count').textContent = `${data.nodes.length}件`; $('offline-graph-status').textContent = '矢印: 依存元 → 利用先';
  const nodes = [...data.nodes].reverse(), positions = new Map(), depths = new Map(nodes.map(node => [node.id, 0]));
  for (let i=0; i<nodes.length; i++) for (const edge of data.edges || []) { const depth = (depths.get(edge.source) || 0) + 1; if (depth > (depths.get(edge.target) || 0) && depth < nodes.length) depths.set(edge.target, depth); }
  const lanes = new Map(); for (const node of nodes) { const depth = depths.get(node.id) || 0, lane = lanes.get(depth) || 0; lanes.set(depth, lane + 1); positions.set(node.id, {x:20+lane*300,y:20+depth*125}); }
  const width = Math.max(320, ...[...lanes.values()].map(value => value*300+20)), height = Math.max(180, (Math.max(0, ...depths.values())+1)*125+20);
  root.setAttribute('viewBox', `0 0 ${width} ${height}`); root.setAttribute('width', width); root.setAttribute('height', height);
  const defs = graphElement('defs'), marker = graphElement('marker', {id:'offline-arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'}); marker.append(graphElement('polygon',{points:'0,0 10,5 0,10'})); defs.append(marker); root.append(defs);
  for (const edge of data.edges || []) { const from=positions.get(edge.source), to=positions.get(edge.target); if(from&&to) root.append(graphElement('path',{d:`M ${from.x+140} ${from.y+85} C ${from.x+140} ${from.y+110}, ${to.x+140} ${to.y-25}, ${to.x+140} ${to.y}`,'marker-end':'url(#offline-arrow)'})); }
  for (const node of nodes) { const point=positions.get(node.id), group=graphElement('g',{tabindex:0,role:'button','aria-label':`${node.tool} セッション ${node.session}`}); group.append(graphElement('rect',{x:point.x,y:point.y,width:280,height:85}),graphElement('text',{x:point.x+15,y:point.y+29},(node.tool||'ToolCall').slice(0,30)),graphElement('text',{x:point.x+15,y:point.y+53,class:'secondary'},(node.accesses||[]).length?`${node.accesses[0].mode==='write'?'書込み':'読取り'} · ${node.accesses[0].path}`.slice(0,28):`セッション ${String(node.session).slice(0,18)}`),graphElement('text',{x:point.x+15,y:point.y+73,class:'secondary'},(node.accesses||[]).some(item=>item.protected)?'保護情報源の読取り':node.complete?'来歴解析済み':'依存関係に未解析あり')); group.onclick=()=>showGraphDetail(node); group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showGraphDetail(node);}}; root.append(group); }
  showGraphDetail(data.nodes[0]);
  $('offline-checks').replaceChildren(...(data.checks || []).map(check => make('p', check.action === 'block' ? '保護情報につながる来歴を検出しました。' : check.action === 'observed' ? '操作後の記録です。実行前の許可判定とは別の記録です。' : `検査結果: ${check.action}`, check.action === 'block' ? 'check blocked' : 'check')));
}
function showLog() { $('offline-graph-view').hidden=true; originalLogMain.hidden=false; logLink.setAttribute('aria-current','page'); graphLink.removeAttribute('aria-current'); document.title='ToolUseProxy · ログ（保存版）'; }
function showGraph() { originalLogMain.hidden=true; $('offline-graph-view').hidden=false; graphLink.setAttribute('aria-current','page'); logLink.removeAttribute('aria-current'); document.title='ToolUseProxy · 来歴（保存版）'; drawGraph(selectedId); }
logLink.href='#log'; graphLink.href='#graph'; logLink.onclick=event=>{event.preventDefault();showLog();}; graphLink.onclick=event=>{event.preventDefault();showGraph();};

$('connection').textContent = '● 保存済み'; $('connection').className = 'online'; $('connection').title = '保存時点のローカルスナップショットです。DBへは接続しません。';
$('updated').textContent = `保存時点 ${SNAPSHOT.capturedAt}`;
renderCalls();
const initial = SNAPSHOT.events.calls.find(call => call.event_id === selectedId) || SNAPSHOT.events.calls[0]; if (initial) renderDetail(initial);
