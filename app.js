/* 科目一精简500题 · 刷题应用（纯前端，进度与错题存 localStorage） */
(function () {
  'use strict';

  const Q = window.QUESTIONS || [];
  const TOTAL = Q.length;
  const KEY = 'ke1quiz.v1';
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const EXAM = { judge: 45, single: 55, minutes: 45, pass: 90 };   // 科目一正式考试规格
  const app = document.getElementById('app');

  /* ---------------- 专题（按题干/选项关键词归类，先匹配先得） ---------------- */
  const TOPICS = [
    { key: 'jifen', name: '记分扣分', re: /记\s*\d+\s*分|一次记|记分周期|满分学习|扣减|累积记分/ },
    { key: 'fakuan', name: '罚款处罚', re: /罚款|吊销|拘役|罚金|收缴|拘留|有期徒刑/ },
    { key: 'shigu', name: '事故处理', re: /事故|报警|撤离|逃逸|伤者|伤员/ },
    { key: 'zhengjian', name: '驾驶证业务', re: /驾驶证|申领|换领|补领|实习期|审验|注销|年龄|周岁/ },
    { key: 'chepai', name: '车辆与号牌', re: /号牌|登记|检验|报废|保险|行驶证|拼装|改装/ },
    { key: 'dengguang', name: '灯光使用', re: /灯光|转向灯|远光|近光|雾灯|闪光灯|示廓灯|前照灯|报警灯/ },
    { key: 'biaozhi', name: '标志标线', re: /标志|标线|箭头|路面|信号灯|手势|交警/ },
    { key: 'yibiao', name: '仪表装置', re: /仪表|指示灯|开关|踏板|操纵|装置|转向盘|变速/ },
    { key: 'anquan', name: '安全文明', re: /急救|安全带|头枕|逃生|灭火|气囊|疲劳|饮酒|酒精|醉酒|毒品|手机/ },
    { key: 'xingche', name: '行车规范', re: /速度|车速|超车|掉头|倒车|车道|跟车|距离|让行|通行|停车|高速/ },
  ];
  const TOPIC_NAME = Object.fromEntries(TOPICS.map(t => [t.key, t.name]));
  TOPIC_NAME.other = '其他';
  const topicCache = new Map();
  function topicOf(q) {
    if (!topicCache.has(q.id)) {
      const text = q.question + q.options.join('');
      const hit = TOPICS.find(t => t.re.test(text));
      topicCache.set(q.id, hit ? hit.key : 'other');
    }
    return topicCache.get(q.id);
  }

  /* ---------------- 状态 ---------------- */
  const defaults = () => ({
    records: {},      // id -> { last:'r'|'w', r:n, w:n, t:ts }
    wrong: {},        // id -> { n:错误次数, t:最近一次 }
    starred: {},      // id -> true
    pos: {},          // 各模式的当前位置
    seqPos: 0,        // 兼容旧版本字段
    randomOrder: null,
    examHistory: [],  // [{score, at, secs}]
    exam: null,       // 进行中的模拟考试 {order, answers, startedAt, deadline}
    autoNext: true,
  });
  let S = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (!s) return defaults();
      const m = Object.assign(defaults(), s);
      if (!m.pos.seq && s.seqPos) m.pos.seq = s.seqPos;
      if (!m.pos.random && s.randomPos) m.pos.random = s.randomPos;
      return m;
    } catch (e) { return defaults(); }
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); updateBadge(); }

  // 本次会话内的作答（刷新后清空），按“模式:题号”存
  const session = {};

  /* ---------------- 工具 ---------------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
  const typeClass = t => t === '判断题' ? 'judge' : t === '多选题' ? 'multi' : 'single';
  const fmtTime = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const fmtClock = secs => { secs = Math.max(0, Math.round(secs)); return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`; };
  const ansText = q => q.answer.map(i => LETTERS[i]).join('');

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
  function hintBoxes(q) {
    return `${q.tip ? `<div class="hint-box tip"><div class="lbl">💡 技巧提示</div>${esc(q.tip)}</div>` : ''}
      ${q.explanation ? `<div class="hint-box exp"><div class="lbl">📖 解析</div>${esc(q.explanation)}</div>` : ''}`;
  }
  function recordAnswer(id, ok) {
    const rec = S.records[id] || { r: 0, w: 0 };
    rec.last = ok ? 'r' : 'w'; rec.t = Date.now();
    if (ok) rec.r++; else rec.w++;
    S.records[id] = rec;
    if (!ok) { const w = S.wrong[id] || { n: 0 }; w.n++; w.t = Date.now(); S.wrong[id] = w; }
  }

  /* ---------------- 路由 ---------------- */
  const routes = {
    '': home,
    'practice': () => practice('seq'),
    'random': () => practice('random'),
    'wrong': wrongList,
    'wrong-practice': () => practice('wrong'),
    'star': () => practice('star'),
    'topic': key => practice('topic:' + key),
    'list': list,
    'q': id => practice('seq', Number(id)),
    'exam': examEntry,
  };
  let currentView = null;   // 供键盘快捷键使用
  let examTimer = null;
  function route() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [name, arg] = hash.split('/');
    currentView = null;
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    (routes[name] || home)(arg);
    document.querySelectorAll('#nav a').forEach(a => {
      const r = a.dataset.route;
      a.classList.toggle('active', r === name || (r === 'wrong' && name === 'wrong-practice') || (r === 'practice' && (name === 'q' || name === 'topic' || name === 'star')));
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
    const starN = Object.keys(S.starred).length;
    const judgeN = Q.filter(q => q.type === '判断题').length;
    const pct = TOTAL ? Math.round(done / TOTAL * 100) : 0;
    const topicCount = {};
    Q.forEach(q => { const k = topicOf(q); topicCount[k] = (topicCount[k] || 0) + 1; });
    const topicKeys = TOPICS.map(t => t.key).concat(topicCount.other ? ['other'] : []);
    const hist = S.examHistory.slice(-5).reverse();
    const examOngoing = S.exam && S.exam.deadline > Date.now();

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
          <div class="stat amber"><div class="num">${starN}</div><div class="lbl">收藏</div></div>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="actions">
          <a class="btn" href="#/practice">顺序练习<small>${S.pos.seq > 0 ? `从第 ${S.pos.seq + 1} 题继续` : '从第 1 题开始'}</small></a>
          <a class="btn ghost" href="#/random">随机练习<small>${S.randomOrder ? `已刷 ${S.pos.random || 0} 题` : '全新乱序'}</small></a>
          <a class="btn ${wrongN ? 'danger' : 'plain'}" href="${wrongN ? '#/wrong-practice' : '#/wrong'}">错题练习<small>${wrongN ? `${wrongN} 道待消灭` : '暂无错题'}</small></a>
          <a class="btn ${starN ? 'warn' : 'plain'}" href="#/star">收藏练习<small>${starN ? `${starN} 道已收藏` : '做题时点 ☆ 收藏'}</small></a>
        </div>
      </div>

      <div class="card exam-card">
        <div class="row">
          <div>
            <h2 style="margin:0">模拟考试</h2>
            <div class="muted small">${EXAM.judge + EXAM.single} 题 · ${EXAM.minutes} 分钟 · ${EXAM.pass} 分及格（判断 ${EXAM.judge} 单选 ${EXAM.single}，每题 1 分）</div>
          </div>
          <span class="spacer"></span>
          <a class="btn exam-btn" href="#/exam">${examOngoing ? '继续考试' : '开始考试'}</a>
        </div>
        ${hist.length ? `<div class="exam-hist">${hist.map(h => `<span class="score ${h.score >= EXAM.pass ? 'pass' : 'fail'}">${h.score}分<small>${fmtTime(h.at)}</small></span>`).join('')}</div>` : `<div class="muted small" style="margin-top:8px">还没考过，考一次看看离 ${EXAM.pass} 分差多少。</div>`}
      </div>

      <div class="card">
        <h2>专项练习 <span class="muted small" style="font-weight:400">按关键词自动归类，同一专题的口诀一起背</span></h2>
        <div class="topics">
          ${topicKeys.map(k => {
            const ids = Q.filter(q => topicOf(q) === k).map(q => q.id);
            const doneK = ids.filter(id => S.records[id]).length;
            const wrongK = ids.filter(id => S.wrong[id]).length;
            return `<a class="topic" href="#/topic/${k}">
              <div class="t-name">${TOPIC_NAME[k]}</div>
              <div class="t-meta">${ids.length} 题 · 已做 ${doneK}${wrongK ? ` · <span class="red">错 ${wrongK}</span>` : ''}</div>
              <div class="t-bar"><i style="width:${ids.length ? Math.round(doneK / ids.length * 100) : 0}%"></i></div>
            </a>`;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <h2>设置</h2>
        <div class="setting">
          <div>答对后自动跳到下一题<div class="muted small">答错会停留，方便看口诀和解析</div></div>
          <div class="switch ${S.autoNext ? 'on' : ''}" id="sw-auto"></div>
        </div>
        <div class="setting">
          <div>键盘快捷键<div class="muted small"><span class="kbd">1</span>-<span class="kbd">4</span> 或 <span class="kbd">A</span>-<span class="kbd">D</span> 选答案，<span class="kbd">←</span> <span class="kbd">→</span> 翻题，<span class="kbd">Enter</span> 下一题，<span class="kbd">S</span> 收藏</div></div>
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
    document.getElementById('btn-reset-seq').onclick = () => { S.pos.seq = 0; save(); toast('顺序进度已重置'); home(); };
    document.getElementById('btn-reset').onclick = () => {
      if (confirm('确定清空所有做题记录、错题集、收藏和考试记录？此操作不可恢复。')) { S = defaults(); save(); toast('已清空'); home(); }
    };
  }

  /* ---------------- 做题（顺序 / 随机 / 错题 / 收藏 / 专项） ---------------- */
  function orderFor(mode) {
    if (mode === 'seq') return Q.map((_, i) => i);
    if (mode === 'random') {
      if (!S.randomOrder || S.randomOrder.length !== TOTAL) { S.randomOrder = shuffle(Q.map((_, i) => i)); S.pos.random = 0; save(); }
      return S.randomOrder;
    }
    if (mode === 'wrong') return Object.keys(S.wrong).map(Number).sort((a, b) => a - b);
    if (mode === 'star') return Object.keys(S.starred).map(Number).sort((a, b) => a - b);
    if (mode.startsWith('topic:')) { const k = mode.slice(6); return Q.filter(q => topicOf(q) === k).map(q => q.id); }
    return [];
  }
  function modeName(mode) {
    if (mode.startsWith('topic:')) return (TOPIC_NAME[mode.slice(6)] || '专项') + '专项';
    return { seq: '顺序练习', random: '随机练习', wrong: '错题练习', star: '收藏练习' }[mode] || mode;
  }

  function practice(mode, startId) {
    const order = orderFor(mode);
    if (!order.length) {
      const msg = mode === 'wrong' ? ['错题集是空的，继续刷题吧', '#/practice', '去顺序练习']
        : mode === 'star' ? ['还没有收藏的题目', '#/practice', '去做题，点 ☆ 收藏']
        : ['这个专题没有题目', '#/', '回首页'];
      app.innerHTML = `<div class="card empty"><div class="big">🎉</div><div>${msg[0]}</div><div style="margin-top:16px"><a class="btn" href="${msg[1]}">${msg[2]}</a></div></div>`;
      return;
    }
    let pos = S.pos[mode] || 0;
    if (startId !== undefined && !Number.isNaN(startId)) { pos = order.indexOf(startId); if (pos < 0) pos = 0; }
    pos = Math.min(Math.max(pos, 0), order.length - 1);
    S.pos[mode] = pos; save();
    renderQuestion(mode, order, pos);
  }

  function starButton(id) {
    const on = !!S.starred[id];
    return `<button class="star ${on ? 'on' : ''}" id="btn-star" title="${on ? '取消收藏' : '收藏'}">${on ? '★' : '☆'}</button>`;
  }
  function bindStar(id, rerender) {
    const b = document.getElementById('btn-star');
    if (!b) return;
    b.onclick = () => {
      if (S.starred[id]) { delete S.starred[id]; toast('已取消收藏'); } else { S.starred[id] = true; toast('已收藏'); }
      save(); rerender();
    };
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
      feedback = `<div class="feedback">
        <div class="verdict ${ok ? 'ok' : 'bad'}"><span>${ok ? '✅ 回答正确' : `❌ 回答错误，正确答案：${ansText(q)}`}</span><span class="spacer"></span><button class="btn plain sm" id="btn-redo">重做本题</button></div>
        ${hintBoxes(q)}
      </div>`;
    }

    const inWrong = !!S.wrong[id];
    app.innerHTML = `
      <div class="card">
        <div class="q-head">
          <span class="pill ${typeClass(q.type)}">${q.type}</span>
          <span>${modeName(mode)} · 第 ${pos + 1} / ${order.length} 题</span>
          <span class="muted">#${id + 1}</span>
          ${rec && !answered ? `<span class="last-result ${rec.last}">上次${rec.last === 'r' ? '答对' : '答错'}</span>` : ''}
          <span class="spacer"></span>
          ${starButton(id)}
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
    bindStar(id, () => renderQuestion(mode, order, pos));
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
    recordAnswer(id, ok);
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
    S.pos[mode] = pos; save();
    renderQuestion(mode, order, pos);
    window.scrollTo(0, 0);
  }

  function summary(mode, order) {
    currentView = null;
    const answeredIds = order.filter(id => S.records[id]);
    const right = order.filter(id => S.records[id] && S.records[id].last === 'r').length;
    const wrongLeft = Object.keys(S.wrong).length;
    app.innerHTML = `
      <div class="card summary" style="text-align:center">
        <div class="muted">${modeName(mode)}已到最后一题</div>
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
      S.pos[mode] = 0; save();
      order.forEach(id => { delete session[mode + ':' + id]; });
      practice(mode);
    };
  }

  /* ---------------- 模拟考试 ---------------- */
  function examEntry() {
    if (S.exam && S.exam.deadline > Date.now()) { renderExam(S.exam.pos || 0); return; }
    if (S.exam) { finishExam(true); return; }   // 上次超时未交卷，直接按已作答判分
    const judge = shuffle(Q.filter(q => q.type === '判断题').map(q => q.id)).slice(0, EXAM.judge);
    const single = shuffle(Q.filter(q => q.type !== '判断题').map(q => q.id)).slice(0, EXAM.single);
    const order = shuffle(judge.concat(single));
    S.exam = { order, answers: {}, startedAt: Date.now(), deadline: Date.now() + EXAM.minutes * 60 * 1000, pos: 0 };
    save();
    renderExam(0);
  }

  function renderExam(pos) {
    const ex = S.exam;
    if (!ex) { location.hash = '#/'; return; }
    const order = ex.order;
    pos = Math.min(Math.max(pos, 0), order.length - 1);
    ex.pos = pos;
    const id = order[pos];
    const q = Q[id];
    const picked = ex.answers[id];
    const answeredN = Object.keys(ex.answers).length;
    currentView = { mode: 'exam', order, pos, id, answered: false };

    app.innerHTML = `
      <div class="exam-bar">
        <span class="pill ${typeClass(q.type)}">${q.type}</span>
        <span>第 ${pos + 1} / ${order.length} 题</span>
        <span class="muted small">已答 ${answeredN}</span>
        <span class="spacer"></span>
        <span class="timer" id="exam-timer">${fmtClock((ex.deadline - Date.now()) / 1000)}</span>
      </div>
      <div class="card">
        <p class="q-stem">${esc(q.question)}</p>
        ${q.image ? `<div class="q-img"><img src="${q.image}" alt="题图" loading="lazy"></div>` : ''}
        <ul class="options" id="options">
          ${q.options.map((t, i) => `<li class="opt ${picked === i ? 'selected' : ''}" data-i="${i}"><span class="key">${LETTERS[i]}</span><span class="txt">${esc(t)}</span></li>`).join('')}
        </ul>
      </div>
      <div class="q-nav">
        <button class="btn plain" id="btn-prev" ${pos === 0 ? 'disabled' : ''}>上一题</button>
        <button class="btn danger" id="btn-submit">交卷</button>
        <button class="btn" id="btn-next" ${pos === order.length - 1 ? 'disabled' : ''}>下一题</button>
      </div>
      <div class="card">
        <div class="row" style="margin-bottom:8px"><strong>答题卡</strong><span class="muted small">蓝=已答 · 灰=未答 · 点击跳转</span></div>
        <div class="grid exam-grid" id="exam-grid">
          ${order.map((qid, i) => `<a class="tile ${ex.answers[qid] !== undefined ? 'done' : ''} ${i === pos ? 'cur' : ''}" data-pos="${i}">${i + 1}</a>`).join('')}
        </div>
      </div>`;

    document.querySelectorAll('#options .opt').forEach(li => {
      li.onclick = () => {
        ex.answers[id] = Number(li.dataset.i); save();
        if (pos < order.length - 1) renderExam(pos + 1); else renderExam(pos);
      };
    });
    document.getElementById('btn-prev').onclick = () => { renderExam(pos - 1); window.scrollTo(0, 0); };
    document.getElementById('btn-next').onclick = () => { renderExam(pos + 1); window.scrollTo(0, 0); };
    document.querySelectorAll('#exam-grid .tile').forEach(t => t.onclick = () => { renderExam(Number(t.dataset.pos)); window.scrollTo(0, 0); });
    document.getElementById('btn-submit').onclick = () => {
      const left = order.length - Object.keys(ex.answers).length;
      if (left > 0 && !confirm(`还有 ${left} 题没答，未答按错误计分。确定交卷？`)) return;
      finishExam(false);
    };

    if (examTimer) clearInterval(examTimer);
    examTimer = setInterval(() => {
      const el = document.getElementById('exam-timer');
      if (!el || !S.exam) { clearInterval(examTimer); examTimer = null; return; }
      const left = (S.exam.deadline - Date.now()) / 1000;
      el.textContent = fmtClock(left);
      el.classList.toggle('urgent', left < 300);
      if (left <= 0) { clearInterval(examTimer); examTimer = null; toast('时间到，自动交卷'); finishExam(true); }
    }, 1000);
  }

  function finishExam(timedOut) {
    const ex = S.exam;
    if (!ex) return;
    if (examTimer) { clearInterval(examTimer); examTimer = null; }
    currentView = null;
    const wrongs = [];
    let score = 0;
    ex.order.forEach(id => {
      const q = Q[id];
      const a = ex.answers[id];
      const ok = a !== undefined && sameSet([a], q.answer);
      if (ok) score++; else wrongs.push({ id, picked: a });
      recordAnswer(id, ok);
    });
    const secs = Math.round((Math.min(Date.now(), ex.deadline) - ex.startedAt) / 1000);
    S.examHistory.push({ score, at: Date.now(), secs });
    if (S.examHistory.length > 30) S.examHistory = S.examHistory.slice(-30);
    S.exam = null;
    save();
    const pass = score >= EXAM.pass;
    app.innerHTML = `
      <div class="card summary" style="text-align:center">
        <div class="muted">${timedOut ? '时间到，已自动交卷' : '模拟考试成绩'}</div>
        <div class="big-num ${pass ? 'pass' : 'fail'}" style="margin:8px 0">${score}<span style="font-size:20px">分</span></div>
        <div class="verdict-line ${pass ? 'ok' : 'bad'}">${pass ? '🎉 通过（≥' + EXAM.pass + ' 分）' : '未通过，还差 ' + (EXAM.pass - score) + ' 分'}</div>
        <div class="muted small" style="margin-top:4px">用时 ${fmtClock(secs)} · 答错 ${wrongs.length} 题 · 错题已自动加入错题集</div>
        <div class="row" style="justify-content:center;margin-top:18px">
          <a class="btn" href="#/exam" id="btn-again">再来一套</a>
          ${wrongs.length ? `<a class="btn danger" href="#/wrong-practice">去刷错题</a>` : ''}
          <a class="btn plain" href="#/">回首页</a>
        </div>
      </div>
      ${wrongs.length ? `<div class="card"><h2>本次错题（${wrongs.length}）</h2>
        ${wrongs.map(({ id, picked }) => {
          const q = Q[id];
          return `<div class="review-item">
            <div class="q-head"><span class="pill ${typeClass(q.type)}">${q.type}</span><span class="muted">#${id + 1}</span><span class="muted small">你选 ${picked === undefined ? '未答' : LETTERS[picked]} · 正确 ${ansText(q)}</span></div>
            <div class="r-stem">${esc(q.question)}</div>
            ${q.image ? `<div class="q-img small-img"><img src="${q.image}" alt="题图" loading="lazy"></div>` : ''}
            <ul class="options compact">${q.options.map((t, i) => `<li class="opt answered ${q.answer.includes(i) ? 'correct' : (picked === i ? 'wrong' : '')}"><span class="key">${LETTERS[i]}</span><span class="txt">${esc(t)}</span></li>`).join('')}</ul>
            ${hintBoxes(q)}
          </div>`;
        }).join('')}</div>` : ''}`;
    document.getElementById('btn-again').onclick = e => { e.preventDefault(); if (location.hash === '#/exam') examEntry(); else location.hash = '#/exam'; };
    window.scrollTo(0, 0);
  }

  /* ---------------- 错题集 ---------------- */
  function wrongList() {
    const ids = Object.keys(S.wrong).map(Number).sort((a, b) => (S.wrong[b].t || 0) - (S.wrong[a].t || 0));
    if (!ids.length) {
      app.innerHTML = `<div class="card empty"><div class="big">🎉</div><div>错题集是空的</div><div class="muted small" style="margin-top:4px">做题或模拟考试时选错的题会自动收进来</div><div style="margin-top:16px"><a class="btn" href="#/practice">去顺序练习</a></div></div>`;
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
              <div class="stem">${S.starred[id] ? '<span class="star-mark">★</span>' : ''}${esc(q.question)}</div>
              <div class="meta"><span class="pill ${typeClass(q.type)}">${q.type}</span><span>错 ${w.n} 次</span>${w.t ? `<span>${fmtTime(w.t)}</span>` : ''}<span>答案 ${ansText(q)}</span><span>${TOPIC_NAME[topicOf(q)]}</span></div>
            </div>
            <div class="ops">
              <a class="btn ghost sm" href="#/wrong-practice" data-go="${id}">练习</a>
              <button class="btn plain sm" data-rm="${id}">移出</button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    document.getElementById('btn-clear-wrong').onclick = () => { if (confirm('清空错题集？')) { S.wrong = {}; S.pos.wrong = 0; save(); wrongList(); } };
    document.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { delete S.wrong[Number(b.dataset.rm)]; save(); toast('已移出'); wrongList(); });
    document.querySelectorAll('[data-go]').forEach(a => a.onclick = () => {
      const order = orderFor('wrong'); S.pos.wrong = Math.max(order.indexOf(Number(a.dataset.go)), 0); save();
    });
  }

  /* ---------------- 全部题目 ---------------- */
  let listFilter = 'all';
  function list() {
    const counts = { all: TOTAL, r: 0, w: 0, u: 0, s: Object.keys(S.starred).length };
    Q.forEach((_, i) => { const r = S.records[i]; if (!r) counts.u++; else counts[r.last]++; });
    const tiles = Q.map((q, i) => {
      const r = S.records[i];
      const st = r ? r.last : 'u';
      if (listFilter === 's' ? !S.starred[i] : (listFilter !== 'all' && listFilter !== st)) return '';
      return `<a class="tile ${st} ${S.starred[i] ? 'starred' : ''}" href="#/q/${i}" title="${esc(q.question.slice(0, 40))}">${i + 1}</a>`;
    }).join('');
    app.innerHTML = `
      <div class="card">
        <div class="filters">
          ${[['all', '全部'], ['u', '未做'], ['r', '答对'], ['w', '答错'], ['s', '收藏']].map(([k, n]) => `<button class="chip ${listFilter === k ? 'on' : ''}" data-f="${k}">${n} ${counts[k]}</button>`).join('')}
        </div>
        <div class="legend"><span><i></i>未做</span><span><i class="r"></i>答对</span><span><i class="w"></i>答错</span><span><i class="s"></i>收藏</span><span class="spacer"></span><span>点击题号跳转</span></div>
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
    const isExam = mode === 'exam';
    const nav = d => isExam ? renderExam(pos + d) : go(mode, order, pos + d);
    if (k === 'ArrowLeft') { e.preventDefault(); nav(-1); return; }
    if (k === 'ArrowRight') { e.preventDefault(); nav(1); return; }
    if ((k === 's' || k === 'S') && !isExam) { const b = document.getElementById('btn-star'); if (b) { e.preventDefault(); b.click(); } return; }
    if (k === 'Enter' || k === ' ') {
      if (isExam) { e.preventDefault(); nav(1); return; }
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
