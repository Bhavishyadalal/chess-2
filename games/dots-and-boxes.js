/* ===================================================================
   Twoplay game module: Dots and Boxes
   File: games/dots-and-boxes.js
   Registers: GameModules['dots-and-boxes'], GameControllers['dots-and-boxes']
   =================================================================== */
(function () {
  'use strict';

  const ID = 'dots-and-boxes';
  const N = 5;              // 5x5 dots -> 4x4 boxes
  const BOXES = N - 1;

  // ---- persistent DOM refs (built once in mount) ----
  let els = {
    root: null,
    boardWrap: null,
    svg: null,
    scoreMe: null,
    scoreOpp: null,
    scoreMeName: null,
    scoreOppName: null,
    turnBadge: null,
    lineEls: new Map(),   // key "h-r-c" / "v-r-c" -> <line> element
    boxEls: new Map(),    // key "r-c" -> <rect> element
    dotEls: [],
  };

  // ---- game state ----
  let state = null;
  /*
    state = {
      hLines: boolean[N][BOXES]   // horizontal edges: hLines[r][c] = edge above box(r,c), r in 0..N-1, c in 0..BOXES-1
      vLines: boolean[BOXES][N]   // vertical edges: vLines[r][c] = edge left of box(r,c), r in 0..BOXES-1, c in 0..N-1
      boxOwner: (null|'w'|'b')[BOXES][BOXES]
      turn: 'w' | 'b'
      scoreW: number, scoreB: number
    }
  */

  function freshState() {
    const hLines = [];
    for (let r = 0; r < N; r++) hLines.push(new Array(BOXES).fill(false));
    const vLines = [];
    for (let r = 0; r < BOXES; r++) vLines.push(new Array(N).fill(false));
    const boxOwner = [];
    for (let r = 0; r < BOXES; r++) boxOwner.push(new Array(BOXES).fill(null));
    return { hLines, vLines, boxOwner, turn: 'w', scoreW: 0, scoreB: 0 };
  }

  function canIPlay() {
    return localMode ? true : state.turn === myColor;
  }

  // ---- geometry ----
  const PAD = 34;
  const CELL = 74;
  const DOT_R = 6;
  const HIT_W = 22; // invisible fat hit-target width around each line

  function pt(r, c) { return [PAD + c * CELL, PAD + r * CELL]; }
  const SVG_SIZE = PAD * 2 + BOXES * CELL;

  function svgns(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  // ============================================================
  // MOUNT — build all DOM once
  // ============================================================
  function mount(container) {
    container.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      .dab-root{
        --dab-accent:#7c9cff;
        --dab-accent-dim:#243158;
        --dab-w:#ffd166;
        --dab-b:#7c9cff;
        --dab-bg:#14161c;
        --dab-line:#2a2e3a;
        --dab-dot:#565c6e;
        display:flex; flex-direction:column; align-items:center;
        gap:14px; padding:14px 10px 20px; width:100%; box-sizing:border-box;
        font-family: inherit;
      }
      .dab-scorebar{
        display:flex; align-items:center; justify-content:center; gap:10px;
        width:100%; max-width:${SVG_SIZE}px;
      }
      .dab-scorecard{
        flex:1; display:flex; flex-direction:column; align-items:center;
        gap:2px; padding:10px 8px; border-radius:12px;
        background:var(--dab-bg); border:1px solid var(--dab-line);
        transition: box-shadow .2s ease, border-color .2s ease;
        min-width:0;
      }
      .dab-scorecard.active{
        border-color: var(--dab-accent);
        box-shadow: 0 0 0 1px var(--dab-accent), 0 4px 16px rgba(124,156,255,.18);
      }
      .dab-scorecard .dab-name{
        font-size:11px; color:#9aa1b3; font-weight:600; letter-spacing:.02em;
        max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .dab-scorecard .dab-num{
        font-size:26px; font-weight:800; line-height:1.1; font-variant-numeric: tabular-nums;
      }
      .dab-scorecard.me .dab-num{ color: var(--dab-w); }
      .dab-scorecard.opp .dab-num{ color: var(--dab-b); }
      .dab-vs{ font-size:11px; color:#565c6e; font-weight:700; flex-shrink:0; }
      .dab-boardwrap{
        touch-action: manipulation;
        max-width:100%;
        overflow:visible;
      }
      .dab-boardwrap svg{ display:block; max-width:100%; height:auto; }
      .dab-dot{ fill: var(--dab-dot); }
      .dab-line-hit{ fill:none; stroke:transparent; stroke-width:${HIT_W}px; stroke-linecap:round; cursor:pointer; }
      .dab-line-hit.taken{ cursor:default; pointer-events:none; }
      .dab-line-vis{ fill:none; stroke: var(--dab-line); stroke-width:6px; stroke-linecap:round; pointer-events:none; transition: stroke .12s ease; }
      .dab-line-vis.on-w{ stroke: var(--dab-w); }
      .dab-line-vis.on-b{ stroke: var(--dab-b); }
      .dab-line-hit:not(.taken):hover + .dab-line-vis{ stroke:#565c6e; }
      .dab-box{ fill: transparent; pointer-events:none; transition: fill .18s ease, opacity .18s ease; rx:6px; }
      .dab-box.own-w{ fill: var(--dab-w); opacity:.16; }
      .dab-box.own-b{ fill: var(--dab-b); opacity:.16; }
      .dab-box-glyph{ pointer-events:none; font-size:22px; font-weight:800; opacity:0; transition:opacity .18s ease; }
      .dab-box-glyph.shown{ opacity:.85; }
      .dab-box-glyph.own-w{ fill: var(--dab-w); }
      .dab-box-glyph.own-b{ fill: var(--dab-b); }
      .dab-turnbadge{
        font-size:12px; color:#9aa1b3; font-weight:600;
        display:flex; align-items:center; gap:6px;
      }
      .dab-turnbadge .dot{ width:8px; height:8px; border-radius:50%; background:var(--dab-accent); flex-shrink:0; }
      @keyframes dabPop{ 0%{ transform:scale(.85); opacity:0; } 60%{ transform:scale(1.08); opacity:1; } 100%{ transform:scale(1); opacity:1; } }
      .dab-pop{ animation: dabPop .25s ease-out; }
    `;
    container.appendChild(style);

    const root = document.createElement('div');
    root.className = 'dab-root';

    // scorebar
    const scorebar = document.createElement('div');
    scorebar.className = 'dab-scorebar';

    const meCard = document.createElement('div');
    meCard.className = 'dab-scorecard me';
    const meName = document.createElement('div'); meName.className = 'dab-name'; meName.textContent = 'You';
    const meNum = document.createElement('div'); meNum.className = 'dab-num'; meNum.textContent = '0';
    meCard.appendChild(meName); meCard.appendChild(meNum);

    const vs = document.createElement('div'); vs.className = 'dab-vs'; vs.textContent = 'VS';

    const oppCard = document.createElement('div');
    oppCard.className = 'dab-scorecard opp';
    const oppName = document.createElement('div'); oppName.className = 'dab-name'; oppName.textContent = 'Opponent';
    const oppNum = document.createElement('div'); oppNum.className = 'dab-num'; oppNum.textContent = '0';
    oppCard.appendChild(oppName); oppCard.appendChild(oppNum);

    scorebar.appendChild(meCard); scorebar.appendChild(vs); scorebar.appendChild(oppCard);
    root.appendChild(scorebar);

    // turn badge
    const turnBadge = document.createElement('div');
    turnBadge.className = 'dab-turnbadge';
    const badgeDot = document.createElement('span'); badgeDot.className = 'dot';
    const badgeText = document.createElement('span'); badgeText.textContent = '';
    turnBadge.appendChild(badgeDot); turnBadge.appendChild(badgeText);
    root.appendChild(turnBadge);

    // board
    const boardWrap = document.createElement('div');
    boardWrap.className = 'dab-boardwrap';
    const svg = svgns('svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('width', String(SVG_SIZE));
    svg.setAttribute('height', String(SVG_SIZE));

    // boxes (draw first, under lines)
    for (let r = 0; r < BOXES; r++) {
      for (let c = 0; c < BOXES; c++) {
        const [x, y] = pt(r, c);
        const rect = svgns('rect');
        rect.setAttribute('x', String(x + 8));
        rect.setAttribute('y', String(y + 8));
        rect.setAttribute('width', String(CELL - 16));
        rect.setAttribute('height', String(CELL - 16));
        rect.setAttribute('rx', '6');
        rect.setAttribute('class', 'dab-box');
        svg.appendChild(rect);
        els.boxEls.set(r + '-' + c, { rect: null, text: null });
      }
    }

    // box glyphs
    for (let r = 0; r < BOXES; r++) {
      for (let c = 0; c < BOXES; c++) {
        const [x, y] = pt(r, c);
        const text = svgns('text');
        text.setAttribute('x', String(x + CELL / 2));
        text.setAttribute('y', String(y + CELL / 2 + 8));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('class', 'dab-box-glyph');
        text.textContent = '';
        svg.appendChild(text);
        const rectRef = svg.querySelectorAll('.dab-box')[r * BOXES + c];
        els.boxEls.set(r + '-' + c, { rect: rectRef, text });
      }
    }

    // horizontal line slots: hLines[r][c] connects dot(r,c) -- dot(r,c+1)
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < BOXES; c++) {
        const [x1, y1] = pt(r, c);
        const [x2, y2] = pt(r, c + 1);
        addLine('h', r, c, x1, y1, x2, y2, svg);
      }
    }
    // vertical line slots: vLines[r][c] connects dot(r,c) -- dot(r+1,c)
    for (let r = 0; r < BOXES; r++) {
      for (let c = 0; c < N; c++) {
        const [x1, y1] = pt(r, c);
        const [x2, y2] = pt(r + 1, c);
        addLine('v', r, c, x1, y1, x2, y2, svg);
      }
    }

    // dots (drawn last, on top)
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const [x, y] = pt(r, c);
        const dot = svgns('circle');
        dot.setAttribute('cx', String(x));
        dot.setAttribute('cy', String(y));
        dot.setAttribute('r', String(DOT_R));
        dot.setAttribute('class', 'dab-dot');
        svg.appendChild(dot);
      }
    }

    boardWrap.appendChild(svg);
    root.appendChild(boardWrap);
    container.appendChild(root);

    els.root = root;
    els.boardWrap = boardWrap;
    els.svg = svg;
    els.scoreMe = meNum;
    els.scoreOpp = oppNum;
    els.scoreMeName = meName;
    els.scoreOppName = oppName;
    els.turnBadge = badgeText;
    els.badgeDot = badgeDot;

    function addLine(kind, r, c, x1, y1, x2, y2, svgEl) {
      const hit = svgns('line');
      hit.setAttribute('x1', String(x1)); hit.setAttribute('y1', String(y1));
      hit.setAttribute('x2', String(x2)); hit.setAttribute('y2', String(y2));
      hit.setAttribute('class', 'dab-line-hit');
      const vis = svgns('line');
      vis.setAttribute('x1', String(x1)); vis.setAttribute('y1', String(y1));
      vis.setAttribute('x2', String(x2)); vis.setAttribute('y2', String(y2));
      vis.setAttribute('class', 'dab-line-vis');
      svgEl.appendChild(hit);
      svgEl.appendChild(vis);
      const key = kind + '-' + r + '-' + c;
      els.lineEls.set(key, { hit, vis });
      hit.addEventListener('click', () => onLineClick(kind, r, c));
      hit.addEventListener('touchstart', function (e) { e.preventDefault(); onLineClick(kind, r, c); }, { passive: false });
    }
  }

  // ============================================================
  // GAME LOGIC
  // ============================================================
  function boxesCompletedBy(hLines, vLines, kind, r, c) {
    // returns list of {r,c} box coords newly completed by placing this line
    const completed = [];
    function isFull(br, bc) {
      if (br < 0 || bc < 0 || br >= BOXES || bc >= BOXES) return false;
      return hLines[br][bc] && hLines[br + 1][bc] && vLines[br][bc] && vLines[br][bc + 1];
    }
    if (kind === 'h') {
      // affects box above (r-1,c) and box below (r,c)
      if (isFull(r - 1, c)) completed.push({ r: r - 1, c });
      if (isFull(r, c)) completed.push({ r, c });
    } else {
      // vertical line r,c affects box left (r,c-1) and box right (r,c)
      if (isFull(r, c - 1)) completed.push({ r, c: c - 1 });
      if (isFull(r, c)) completed.push({ r, c });
    }
    return completed;
  }

  function applyMove(kind, r, c, byColor) {
    if (kind === 'h') {
      if (state.hLines[r][c]) return { ok: false };
      state.hLines[r][c] = true;
    } else {
      if (state.vLines[r][c]) return { ok: false };
      state.vLines[r][c] = true;
    }
    const completed = boxesCompletedBy(state.hLines, state.vLines, kind, r, c);
    completed.forEach(({ r: br, c: bc }) => {
      state.boxOwner[br][bc] = byColor;
      if (byColor === 'w') state.scoreW++; else state.scoreB++;
    });
    const gotBox = completed.length > 0;
    if (!gotBox) {
      state.turn = byColor === 'w' ? 'b' : 'w';
    }
    return { ok: true, completed, gotBox };
  }

  function boardFull() {
    for (let r = 0; r < N; r++) for (let c = 0; c < BOXES; c++) if (!state.hLines[r][c]) return false;
    for (let r = 0; r < BOXES; r++) for (let c = 0; c < N; c++) if (!state.vLines[r][c]) return false;
    return true;
  }

  function checkGameOver() {
    if (!boardFull()) return;
    const myScore = myColor === 'w' ? state.scoreW : state.scoreB;
    const oppScore = myColor === 'w' ? state.scoreB : state.scoreW;
    let title, sub, kind;
    if (localMode) {
      if (state.scoreW > state.scoreB) { title = 'Player 1 wins'; sub = state.scoreW + ' – ' + state.scoreB; kind = 'win'; }
      else if (state.scoreB > state.scoreW) { title = 'Player 2 wins'; sub = state.scoreB + ' – ' + state.scoreW; kind = 'win'; }
      else { title = 'Draw'; sub = state.scoreW + ' – ' + state.scoreB; kind = 'draw'; }
      endGame(title, sub, kind, state.scoreW === state.scoreB ? null : (state.scoreW > state.scoreB ? 'w' : 'b'));
    } else {
      if (myScore > oppScore) { title = 'You win'; sub = myScore + ' – ' + oppScore; kind = 'win'; }
      else if (myScore < oppScore) { title = 'You lose'; sub = myScore + ' – ' + oppScore; kind = 'lose'; }
      else { title = 'Draw'; sub = myScore + ' – ' + oppScore; kind = 'draw'; }
      endGame(title, sub, kind);
    }
  }

  function onLineClick(kind, r, c) {
    if (gameEnded) return;
    if (!canIPlay()) { toast('Not your turn'); return; }
    const already = kind === 'h' ? state.hLines[r][c] : state.vLines[r][c];
    if (already) return;

    const mover = localMode ? state.turn : myColor;
    const result = applyMove(kind, r, c, mover);
    if (!result.ok) return;

    if (result.gotBox) { sndCapture(); } else { sndMove(); }
    render();
    gameSend({ kind: 'move', lineKind: kind, r, c, by: mover });
    setStatusLine();
    checkGameOver();
  }

  // ============================================================
  // CONTROLLER
  // ============================================================
  function init(isHostOrLocal, resetState) {
    if (resetState || !state) {
      state = freshState();
    }
    if (els.scoreMeName) els.scoreMeName.textContent = 'You';
    if (els.scoreOppName) els.scoreOppName.textContent = oppName || 'Opponent';
    render();
  }

  function render() {
    if (!els.svg) return;

    // lines — drawn lines get the accent color, undrawn stay neutral
    els.lineEls.forEach((pair, key) => {
      const [kind, rs, cs] = key.split('-');
      const r = parseInt(rs, 10), c = parseInt(cs, 10);
      const on = kind === 'h' ? state.hLines[r][c] : state.vLines[r][c];
      pair.hit.classList.toggle('taken', on);
      pair.vis.classList.toggle('on-w', on);
    });

    // boxes
    for (let r = 0; r < BOXES; r++) {
      for (let c = 0; c < BOXES; c++) {
        const key = r + '-' + c;
        const entry = els.boxEls.get(key);
        if (!entry) continue;
        const owner = state.boxOwner[r][c];
        entry.rect.classList.remove('own-w', 'own-b');
        entry.text.classList.remove('own-w', 'own-b', 'shown');
        if (owner) {
          entry.rect.classList.add('own-' + owner);
          entry.text.classList.add('own-' + owner, 'shown');
          entry.text.textContent = localMode ? (owner === 'w' ? 'P1' : 'P2') : '●';
          if (!entry.text.dataset.popped) {
            entry.text.classList.add('dab-pop');
            entry.text.dataset.popped = '1';
          }
        } else {
          entry.text.textContent = '';
          delete entry.text.dataset.popped;
        }
      }
    }

    // scores
    const myScore = myColor === 'w' ? state.scoreW : state.scoreB;
    const oppScore = myColor === 'w' ? state.scoreB : state.scoreW;
    if (els.scoreMe) els.scoreMe.textContent = String(localMode ? state.scoreW : myScore);
    if (els.scoreOpp) els.scoreOpp.textContent = String(localMode ? state.scoreB : oppScore);
    if (localMode) {
      els.scoreMeName.textContent = 'Player 1';
      els.scoreOppName.textContent = 'Player 2';
    }

    // turn highlight
    const meCard = els.root.querySelector('.dab-scorecard.me');
    const oppCard = els.root.querySelector('.dab-scorecard.opp');
    const myTurnNow = localMode ? true : state.turn === myColor;
    const p1TurnLocal = state.turn === 'w';
    if (localMode) {
      meCard.classList.toggle('active', p1TurnLocal && !gameEnded);
      oppCard.classList.toggle('active', !p1TurnLocal && !gameEnded);
    } else {
      meCard.classList.toggle('active', myTurnNow && !gameEnded);
      oppCard.classList.toggle('active', !myTurnNow && !gameEnded);
    }

    if (els.turnBadge) {
      if (gameEnded) {
        els.turnBadge.textContent = 'Game over';
        els.badgeDot.style.background = '#565c6e';
      } else {
        els.turnBadge.textContent = statusText();
        els.badgeDot.style.background = (localMode ? p1TurnLocal : myTurnNow) ? '#7c9cff' : '#565c6e';
      }
    }
  }

  function onData(payload) {
    if (!payload || payload.kind !== 'move') return;
    const { lineKind, r, c, by } = payload;
    const already = lineKind === 'h' ? state.hLines[r][c] : state.vLines[r][c];
    if (already) return;
    const result = applyMove(lineKind, r, c, by);
    if (!result.ok) return;
    if (result.gotBox) sndCapture(); else sndMove();
    render();
    setStatusLine();
    checkGameOver();
  }

  function statusText() {
    if (gameEnded) return 'Game over';
    if (localMode) {
      return (state.turn === 'w' ? 'Player 1' : 'Player 2') + '\u2019s turn';
    }
    return canIPlay() ? 'Your turn' : (oppName + '\u2019s turn');
  }

  function canTakeback() { return false; }

  window.GameModules = window.GameModules || {};
  window.GameModules[ID] = { mount };

  window.GameControllers = window.GameControllers || {};
  window.GameControllers[ID] = {
    init,
    render,
    onData,
    statusText,
    canTakeback
  };
})();
