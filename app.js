/* 科目一精简500题 · 刷题应用（纯前端，进度与错题存 localStorage） */
(function () {
  'use strict';

  const Q = window.QUESTIONS || [];
  const TOTAL = Q.length;
  const KEY = 'ke1quiz.v1';
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const app = document.getElementById('app');

  /* ---------------- 状态 ---------------- */
  const defaults = () => ({
    records: {},      // id -> { last:'r'|'w', r:n, w:n, t:ts }
    wrong: {},        // id -> { n:错误次数, t:最近一次 }
    seqPos: 0,
    randomOrder: null,
    randomPos: 0,
    wrongPos: 0,
    autoNext: true,
  });
  let S = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      return s ? Object.assign(defaults(), s) : defaults();
    } catch (e) { return defaults(); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); updateBadge(); }

  // 本次会话内的作答（刷新后清空），用于回看时显示已选状态
  const session = {};

  /* ---------------- 工具 ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const typeClass = t => t === '判断题' ? 'judge' : t === '多选题' ? 'multi' : 'single';
  const fmtTime = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  let toastTimer;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }
  function updateBadge() {
    const n = Object.keys(S.wrong).length;
    document.getElementById('wrong-badge').textContent = n ? String(n) : '';
  }

  /* ---------------- 路由 ---------------- */
  const routes = {
    '': home,
    'practice': () => practice('seq'),
    'random': () => practice('random'),
    'wrong': wrongList,
    'wrong-practice': () => practice('wrong'),
    'list': list,
    'q': id => practice('seq', Number(id)),
  };
  let currentView = null;   // 供键盘快捷键使用
  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, arg] = hash.split('/');
    currentView = null;
    (routes[name] || home)(arg);
    document.querySelectorAll('#nav a').forEach(a => {
      const r = a.dataset.route;
      a.classList.toggle('active', r === name || (r === 'wrong' && name === 'wrong-practice') || (r === 'practice' && name === 'q'));
    });
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------------- 首页 ---------------- */
  function home() {
    const ids = Object.keys(S.records);
    const done = ids.length;
    const right = ids.filter(id => S.records[id].last === 'r').length;
    const totalAnswers = ids.reduce((s, id) => s + S.records[id].r + S.records[id].w, 0);
    const totalRight = ids.reduce((s, id) => s + S.records[id].r, 0);
    const acc = totalAnswers ? Math.round(totalRight / totalAnswers * 100) : 0;
    const wrongN = Object.keys(S.wrong).length;
    const judgeN = Q.filter(q => q.type === '判断题').length;
    const pct = TOTAL ? Math.round(done / TOTAL * 100) : 0;
    app.innerHTML = `
      <div class="card">
        <div class="hero">
          <div>
            <div class="title">科目一 · 精简 ${TOTAL} 题</div>
            <div class="muted small">单选 ${TOTAL - judgeN} 题 · 判断 ${judgeN} 题 · 选错自动进错题集，答完立刻看技巧口诀和解析</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat blue"><div class="num">${done}<span class="muted" style="font-size:13px">/${TOTAL}</span></div><div class="lbl">已练习</div></div>
          <div class="stat green"><div class="num">${acc}%</div><div class="lbl">累计正确率</div></div>
          <div class="stat red"><div class="num">${wrongN}</div><div class="lbl">错题集</div></div>
          <div class="stat"><div class="num">${right}</div><div class="lbl">当前已答对</div></div>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="actions">
          <a class="btn" href="#/practice">顺序练习<small>${S.seqPos > 0 ? `从第 ${S.seqPos + 1} 题继续` : '从第 1 题开始'}</small></a>
          <a class="btn ghost" href="#/random">随机练习<small>${S.randomOrder ? `已刷 ${S.randomPos} 题` : '全新乱序'}</small></a>
          <a class="btn ${wrongN ? 'danger' : 'plain'}" href="${wrongN ? '#/wrong-practice' : '#/wrong'}">错题练习<small>${wrongN ? `${wrongN} 道待消灭` : '暂无错题'}</small></a>
        </div>
      </div>

      <div class="card">
        <h2>设置</h2>
        <div class="setting">
          <div>答对后自动跳到下一题<div class="muted small">答错会停留，方便看口诀和解析</div></div>
          <div class="switch ${S.autoNext ? 'on' : ''}" id="sw-auto"></div>
        </div>
        <div class="setting">
          <div>键盘快捷键<div class="muted small"><span class="kbd">1</span>-<span class="kbd">4</span> 或 <span class="kbd">A</span>-<span class="kbd">D</span> 选答案，<span class="kbd">←</span> <span class="kbd">→</span> 翻题，<span class="kbd">Enter</span> 下一题</div></div>
        </div>
      </div>

      <div class="card">
        <h2>数据</h2>
        <div class="row">
          <button class="btn plain sm" id="btn-export">导出进度</button>
          <button class="btn plain sm" id="btn-import">导入进度</button>
          <input type="file" id="file-import" accept="application/json" hidden>
          <span class="spacer"></span>
          <button class="btn plain sm" id="btn-reset-seq">重置顺序进度</button>
          <button class="btn danger sm" id="btn-reset">清空全部记录</button>
        </div>
        <div class="muted small" style="margin-top:8px">记录只保存在本浏览器（localStorage），换设备请先导出再导入。</div>
      </div>`;

    document.getElementById('sw-auto').onclick = e => { S.autoNext = !S.autoNext; save(); e.target.classList.toggle('on', S.autoNext); };
    document.getElementById('btn-export').onclick = () => {
      const blob = new Blob([JSON.stringify(S)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `ke1-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    };
    document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
    document.getElementById('file-import').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { const s = JSON.parse(r.result); if (!s.records) throw 0; S = Object.assign(defaults(), s); save(); toast('导入成功'); home(); } catch (_) { toast('文件格式不对'); } };
      r.readAsText(f);
    };
    document.getElementById('btn-reset-seq').onclick = () => { S.seqPos = 0; save(); toast('顺序进度已重置'); home(); };
    document.getElementById('btn-reset').onclick = () => {
      if (confirm('确定清空所有做题记录和错题集？此操作不可恢复。')) { S = defaults(); save(); toast('已清空'); home(); }
    };
  }

  /* ---------------- 做题 ---------------- */
  function orderFor(mode) {
    if (mode === 'seq') return Q.map((_, i) => i);
    if (mode === 'random') {
      if (!S.randomOrder || S.randomOrder.length !== TOTAL) { S.randomOrder = shuffle(Q.map((_, i) => i)); S.randomPos = 0; save(); }
      return S.randomOrder;
    }
    return Object.keys(S.wrong).map(Number).sort((a, b) => a - b);
  }
  const posKey = { seq: 'seqPos', random: 'randomPos', wrong: 'wrongPos' };

  function practice(mode, startId) {
    const order = orderFor(mode);
    if (!order.length) {
      app.innerHTML = `<div class="card empty"><div class="big">🎉</div><div>错题集是空的，继续刷题吧</div><div style="margin-top:16px"><a class="btn" href="#/practice">去顺序练习</a></div></div>`;
      return;
    }
    let pos = S[posKey[mode]] || 0;
    if (startId !== undefined && !Number.isNaN(startId)) { pos = order.indexOf(startId); if (pos < 0) pos = 0; }
    pos = Math.min(Math.max(pos, 0), order.length - 1);
    S[posKey[mode]] = pos; save();
    renderQuestion(mode, order, pos);
  }

  function renderQuestion(mode, order, pos) {
    const id = order[pos];
    const q = Q[id];
    const skey = mode + ':' + id;
    const chosen = session[skey];          // 本会话已作答时为数组
    const answered = Array.isArray(chosen);
    const rec = S.records[id];
    const multi = q.type === '多选题';
    const pending = (!answered && multi) ? (session['_pending_' + id] || []) : [];
    currentView = { mode, order, pos, id, answered };

    const optionsHtml = q.options.map((t, i) => {
      let cls = 'opt';
      if (answered) {
        cls += ' answered';
        if (q.answer.includes(i)) cls += ' correct';
        else if (chosen.includes(i)) cls += ' wrong';
      } else if (pending.includes(i)) cls += ' selected';
      return `<li class="${cls}" data-i="${i}"><span class="key">${LETTERS[i]}</span><span class="txt">${esc(t)}</span></li>`;
    }).join('');

    let feedback = '';
    if (answered) {
      const ok = sameSet(chosen, q.answer);
      const ansText = q.answer.map(i => LETTERS[i]).join('');
      feedback = `<div class="feedback">
        <div class="verdict ${ok ? 'ok' : 'bad'}"><span>${ok ? '✅ 回答正确' : `❌ 回答错误，正确答案：${ansText}`}</span><span class="spacer"></span><button class="btn plain sm" id="btn-redo">重做本题</button></div>
        ${q.tip ? `<div class="hint-box tip"><div class="lbl">💡 技巧提示</div>${esc(q.tip)}</div>` : ''}
        ${q.explanation ? `<div class="hint-box exp"><div class="lbl">📖 解析</div>${esc(q.explanation)}</div>` : ''}
      </div>`;
    }

    const modeName = { seq: '顺序练习', random: '随机练习', wrong: '错题练习' }[mode];
    const inWrong = !!S.wrong[id];
    app.innerHTML = `
      <div class="card">
        <div class="q-head">
          <span class="pill ${typeClass(q.type)}">${q.type}</span>
          <span>${modeName} · 第 ${pos + 1} / ${order.length} 题</span>
          <span class="muted">#${id + 1}</span>
          ${rec && !answered ? `<span class="last-result ${rec.last}">上次${rec.last === 'r' ? '答对' : '答错'}</span>` : ''}
        </div>
        <p class="q-stem">${esc(q.question)}</p>
        ${q.image ? `<div class="q-img"><img src="${q.image}" alt="题图" loading="lazy"></div>` : ''}
        <ul class="options" id="options">${optionsHtml}</ul>
        ${multi && !answered ? `<button class="btn block" id="btn-confirm" ${pending.length ? '' : 'disabled'}>确定</button>` : ''}
        ${feedback}
      </div>
      <div class="q-nav">
        <button class="btn plain" id="btn-prev" ${pos === 0 ? 'disabled' : ''}>上一题</button>
        ${mode === 'wrong' && answered && inWrong ? `<button class="btn success" id="btn-master">已掌握，移出错题集</button>` : ''}
        ${mode !== 'wrong' && inWrong && answered ? `<button class="btn plain" id="btn-remove-wrong" title="从错题集移除">移出错题集</button>` : ''}
        <button class="btn" id="btn-next">${pos === order.length - 1 ? '完成' : '下一题'}</button>
      </div>`;

    if (!answered) {
      document.querySelectorAll('#options .opt').forEach(li => {
        li.onclick = () => {
          const i = Number(li.dataset.i);
          if (multi) {
            const p = session['_pending_' + id] || [];
            session['_pending_' + id] = p.includes(i) ? p.filter(x => x !== i) : p.concat(i).sort();
            renderQuestion(mode, order, pos);
          } else {
            submit(mode, order, pos, [i]);
          }
        };
      });
      const c = document.getElementById('btn-confirm');
      if (c) c.onclick = () => submit(mode, order, pos, session['_pending_' + id] || []);
    }
    document.getElementById('btn-prev').onclick = () => go(mode, order, pos - 1);
    document.getElementById('btn-next').onclick = () => go(mode, order, pos + 1);
    const m = document.getElementById('btn-master');
    if (m) m.onclick = () => {
      delete S.wrong[id]; save(); toast('已移出错题集');
      const newOrder = orderFor('wrong');
      if (!newOrder.length) { location.hash = '#/wrong'; return; }
      go('wrong', newOrder, Math.min(pos, newOrder.length - 1));
    };
    const rw = document.getElementById('btn-remove-wrong');
    if (rw) rw.onclick = () => { delete S.wrong[id]; save(); toast('已移出错题集'); renderQuestion(mode, order, pos); };
    const rd = document.getElementById('btn-redo');
    if (rd) rd.onclick = () => { delete session[skey]; renderQuestion(mode, order, pos); };
  }

  function submit(mode, order, pos, choice) {
    const id = order[pos];
    const q = Q[id];
    if (!choice.length) return;
    const ok = sameSet(choice, q.answer);
    session[mode + ':' + id] = choice;
    delete session['_pending_' + id];
    const rec = S.records[id] || { r: 0, w: 0 };
    rec.last = ok ? 'r' : 'w'; rec.t = Date.now();
    if (ok) rec.r++; else rec.w++;
    S.records[id] = rec;
    if (!ok) {
      const w = S.wrong[id] || { n: 0 };
      w.n++; w.t = Date.now(); S.wrong[id] = w;
    }
    save();
    renderQuestion(mode, order, pos);
    if (ok && S.autoNext && mode !== 'wrong' && pos < order.length - 1) {
      const token = currentView;
      setTimeout(() => { if (currentView === token) go(mode, order, pos + 1); }, 1000);
    }
  }

  function go(mode, order, pos) {
    if (pos < 0) return;
    if (pos >= order.length) { summary(mode, order); return; }
    S[posKey[mode]] = pos; save();
    renderQuestion(mode, order, pos);
    window.scrollTo(0, 0);
  }

  function summary(mode, order) {
    currentView = null;
    const answeredIds = order.filter(id => S.records[id]);
    const right = order.filter(id => S.records[id] && S.records[id].last === 'r').length;
    const wrongLeft = Object.keys(S.wrong).length;
    const name = { seq: '顺序练习', random: '随机练习', wrong: '错题练习' }[mode];
    app.innerHTML = `
      <div class="card summary" style="text-align:center">
        <div class="muted">${name}已到最后一题</div>
        <div class="big-num" style="margin:10px 0">${answeredIds.length ? Math.round(right / answeredIds.length * 100) : 0}%</div>
        <div>本轮 ${order.length} 题，已作答 ${answeredIds.length} 题，当前答对 ${right} 题</div>
        <div class="muted small" style="margin-top:4px">错题集还有 ${wrongLeft} 题</div>
        <div class="row" style="justify-content:center;margin-top:18px">
          ${wrongLeft ? `<a class="btn danger" href="#/wrong-practice">去刷错题</a>` : ''}
          <button class="btn ghost" id="btn-restart">重新开始本轮</button>
          <a class="btn plain" href="#/">回首页</a>
        </div>
      </div>`;
    document.getElementById('btn-restart').onclick = () => {
      if (mode === 'random') { S.randomOrder = null; }
      S[posKey[mode]] = 0; save();
      order.forEach(id => { delete session[mode + ':' + id]; });
      practice(mode);
    };
  }

  /* ---------------- 错题集 ---------------- */
  function wrongList() {
    const ids = Object.keys(S.wrong).map(Number).sort((a, b) => (S.wrong[b].t || 0) - (S.wrong[a].t || 0));
    if (!ids.length) {
      app.innerHTML = `<div class="card empty"><div class="big">🎉</div><div>错题集是空的</div><div class="muted small" style="margin-top:4px">做题时选错的题会自动收进来</div><div style="margin-top:16px"><a class="btn" href="#/practice">去顺序练习</a></div></div>`;
      return;
    }
    app.innerHTML = `
      <div class="card">
        <div class="row">
          <h2 style="margin:0">错题集 <span class="muted small">${ids.length} 题</span></h2>
          <span class="spacer"></span>
          <a class="btn danger sm" href="#/wrong-practice">开始错题练习</a>
          <button class="btn plain sm" id="btn-clear-wrong">清空</button>
        </div>
        <div class="muted small" style="margin-top:6px">错题练习中答对后可点“已掌握”移出；按最近出错时间排序。</div>
      </div>
      <div class="card" id="wrong-items">
        ${ids.map(id => {
          const q = Q[id], w = S.wrong[id];
          return `<div class="wrong-item" data-id="${id}">
            <div class="no">${id + 1}</div>
            <div class="body">
              <div class="stem">${esc(q.question)}</div>
              <div class="meta"><span class="pill ${typeClass(q.type)}">${q.type}</span><span>错 ${w.n} 次</span>${w.t ? `<span>${fmtTime(w.t)}</span>` : ''}<span>答案 ${q.answer.map(i => LETTERS[i]).join('')}</span></div>
            </div>
            <div class="ops">
              <a class="btn ghost sm" href="#/wrong-practice" data-go="${id}">练习</a>
              <button class="btn plain sm" data-rm="${id}">移出</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    document.getElementById('btn-clear-wrong').onclick = () => { if (confirm('清空错题集？')) { S.wrong = {}; S.wrongPos = 0; save(); wrongList(); } };
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { delete S.wrong[Number(b.dataset.rm)]; save(); toast('已移出'); wrongList(); });
    document.querySelectorAll('[data-go]').forEach(a => a.onclick = () => {
      const order = orderFor('wrong'); S.wrongPos = Math.max(order.indexOf(Number(a.dataset.go)), 0); save();
    });
  }

  /* ---------------- 全部题目 ---------------- */
  let listFilter = 'all';
  function list() {
    const counts = { all: TOTAL, r: 0, w: 0, u: 0 };
    Q.forEach((_, i) => { const r = S.records[i]; if (!r) counts.u++; else counts[r.last]++; });
    const tiles = Q.map((q, i) => {
      const r = S.records[i];
      const st = r ? r.last : 'u';
      if (listFilter !== 'all' && listFilter !== st) return '';
      return `<a class="tile ${st}" href="#/q/${i}" title="${esc(q.question.slice(0, 40))}">${i + 1}</a>`;
    }).join('');
    app.innerHTML = `
      <div class="card">
        <div class="filters">
          ${[['all', '全部'], ['u', '未做'], ['r', '答对'], ['w', '答错']].map(([k, n]) => `<button class="chip ${listFilter === k ? 'on' : ''}" data-f="${k}">${n} ${counts[k]}</button>`).join('')}
        </div>
        <div class="legend"><span><i></i>未做</span><span><i class="r"></i>答对</span><span><i class="w"></i>答错</span><span class="spacer"></span><span>点击题号跳转</span></div>
        <div class="grid">${tiles || '<div class="muted small">没有符合条件的题目</div>'}</div>
      </div>`;
    document.querySelectorAll('.chip').forEach(c => c.onclick = () => { listFilter = c.dataset.f; list(); });
  }

  /* ---------------- 键盘 ---------------- */
  document.addEventListener('keydown', e => {
    if (!currentView || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) return;
    const { mode, order, pos, answered } = currentView;
    const k = e.key;
    if (k === 'ArrowLeft') { e.preventDefault(); go(mode, order, pos - 1); return; }
    if (k === 'ArrowRight') { e.preventDefault(); go(mode, order, pos + 1); return; }
    if (k === 'Enter' || k === ' ') {
      if (answered) { e.preventDefault(); go(mode, order, pos + 1); }
      else { const c = document.getElementById('btn-confirm'); if (c && !c.disabled) { e.preventDefault(); c.click(); } }
      return;
    }
    if (answered) return;
    let i = -1;
    if (/^[1-6]$/.test(k)) i = Number(k) - 1;
    else if (/^[a-fA-F]$/.test(k)) i = k.toUpperCase().charCodeAt(0) - 65;
    if (i >= 0) {
      const li = document.querySelector(`#options .opt[data-i="${i}"]`);
      if (li) { e.preventDefault(); li.click(); }
    }
  });

  /* ---------------- 启动 ---------------- */
  if (!TOTAL) {
    app.innerHTML = '<div class="card empty">题库加载失败：找不到 data.js</div>';
    return;
  }
  updateBadge();
  route();
})();
