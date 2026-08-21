/* ===================================================================
   Twoplay game module: Gomoku (Five in a Row)
   File: games/gomoku.js
   Registers: GameModules['gomoku'], GameControllers['gomoku']
   =================================================================== */
(function () {
  'use strict';

  const ID = 'gomoku';
  const SIZE = 15;      // 15x15 board, standard gomoku
  const WIN_LEN = 5;

  // ---- persistent DOM refs (built once in mount) ----
  let els = {
    root: null,
    boardWrap: null,
    svg: null,
    cellHit: new Map(),   // key "r-c" -> <rect> hit target
    stoneEls: new Map(),  // key "r-c" -> {stone, shadow}
    lastMarker: null,     // <circle> ring showing last move
    winLineEl: null,
    scoreMeName: null,
    scoreOppName: null,
    meSwatch: null,
    oppSwatch: null,
    turnBadge: null,
    badgeDot: null,
  };

  // ---- game state ----
  let state = null;
  /*
    state = {
      board: (null|'w'|'b')[SIZE][SIZE],
      turn: 'w' | 'b',
      moveCount: number,
      lastMove: {r,c} | null,
      winLine: [{r,c}...] | null,   // set once someone wins
    }
  */

  function freshState() {
    const board = [];
    for (let r = 0; r < SIZE; r++) board.push(new Array(SIZE).fill(null));
    return { board, turn: 'w', moveCount: 0, lastMove: null, winLine: null };
  }

  function canIPlay() {
    return localMode ? true : state.turn === myColor;
  }

  // ---- geometry ----
  const PAD = 26;
  const CELL = 30;
  const STONE_R = 12.5;
  const SVG_SIZE = PAD * 2 + (SIZE - 1) * CELL;

  function pt(r, c) { return [PAD + c * CELL, PAD + r * CELL]; }
  function svgns(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  // ============================================================
  // MOUNT — build all DOM once
  // ============================================================
  function mount(container) {
    container.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      .gmk-root{
        --gmk-w:#f4f1ea;
        --gmk-b:#232323;
        --gmk-accent:#e0a45c;
        --gmk-board:#c8975f;
        --gmk-board-line:#8a6539;
        --gmk-bg:#14161c;
        --gmk-line:#2a2e3a;
        display:flex; flex-direction:column; align-items:center;
        gap:14px; padding:14px 10px 20px; width:100%; box-sizing:border-box;
      }
      .gmk-scorebar{
        display:flex; align-items:center; justify-content:center; gap:10px;
        width:100%; max-width:${SVG_SIZE}px;
      }
      .gmk-scorecard{
        flex:1; display:flex; flex-direction:column; align-items:center;
        gap:2px; padding:10px 8px; border-radius:12px;
        background:var(--gmk-bg); border:1px solid var(--gmk-line);
        transition: box-shadow .2s ease, border-color .2s ease;
        min-width:0;
      }
      .gmk-scorecard.active{
        border-color: var(--gmk-accent);
        box-shadow: 0 0 0 1px var(--gmk-accent), 0 4px 16px rgba(224,164,92,.18);
      }
      .gmk-scorecard .gmk-name{
        font-size:11px; color:#9aa1b3; font-weight:600; letter-spacing:.02em;
        display:flex; align-items:center; gap:6px; max-width:100%;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .gmk-swatch{ width:11px; height:11px; border-radius:50%; flex-shrink:0; border:1px solid rgba(0,0,0,.25); }
      .gmk-swatch.w{ background:var(--gmk-w); }
      .gmk-swatch.b{ background:var(--gmk-b); }
      .gmk-vs{ font-size:11px; color:#565c6e; font-weight:700; flex-shrink:0; }
      .gmk-boardwrap{
        touch-action: manipulation;
        max-width:100%; overflow:visible;
        border-radius:10px; padding:4px;
        background: linear-gradient(135deg, #b9814a, #8a5e34);
        box-shadow: 0 10px 30px rgba(0,0,0,.35);
      }
      .gmk-boardwrap svg{ display:block; max-width:100%; height:auto; border-radius:7px; }
      .gmk-cellhit{ fill:transparent; cursor:pointer; }
      .gmk-cellhit.taken{ cursor:default; }
      .gmk-star{ fill: var(--gmk-board-line); opacity:.55; }
      .gmk-stone{ pointer-events:none; }
      .gmk-stone.w{ fill: var(--gmk-w); stroke:#00000022; stroke-width:1; }
      .gmk-stone.b{ fill: var(--gmk-b); stroke:#ffffff14; stroke-width:1; }
      .gmk-stone-shadow{ fill:rgba(0,0,0,.25); pointer-events:none; }
      .gmk-last-marker{ fill:none; stroke: var(--gmk-accent); stroke-width:2.5px; pointer-events:none; }
      .gmk-win-line{ stroke: #ff5a5a; stroke-width:5px; stroke-linecap:round; pointer-events:none; opacity:0; transition: opacity .2s ease; }
      .gmk-win-line.shown{ opacity:.85; }
      .gmk-turnbadge{
        font-size:12px; color:#9aa1b3; font-weight:600;
        display:flex; align-items:center; gap:6px;
      }
      .gmk-turnbadge .dot{ width:8px; height:8px; border-radius:50%; background:var(--gmk-accent); flex-shrink:0; }
      @keyframes gmkPop{ 0%{ transform:scale(.4); opacity:0; } 70%{ transform:scale(1.08); opacity:1; } 100%{ transform:scale(1); opacity:1; } }
      .gmk-pop{ animation: gmkPop .16s ease-out; transform-origin: center; transform-box: fill-box; }
    `;
    container.appendChild(style);

    const root = document.createElement('div');
    root.className = 'gmk-root';

    // scorebar
    const scorebar = document.createElement('div');
    scorebar.className = 'gmk-scorebar';

    const meCard = document.createElement('div');
    meCard.className = 'gmk-scorecard me';
    const meName = document.createElement('div'); meName.className = 'gmk-name';
    const meSwatch = document.createElement('span'); meSwatch.className = 'gmk-swatch';
    const meNameText = document.createElement('span'); meNameText.textContent = 'You';
    meName.appendChild(meSwatch); meName.appendChild(meNameText);
    meCard.appendChild(meName);

    const vs = document.createElement('div'); vs.className = 'gmk-vs'; vs.textContent = 'VS';

    const oppCard = document.createElement('div');
    oppCard.className = 'gmk-scorecard opp';
    const oppNameEl = document.createElement('div'); oppNameEl.className = 'gmk-name';
    const oppSwatch = document.createElement('span'); oppSwatch.className = 'gmk-swatch';
    const oppNameText = document.createElement('span'); oppNameText.textContent = 'Opponent';
    oppNameEl.appendChild(oppSwatch); oppNameEl.appendChild(oppNameText);
    oppCard.appendChild(oppNameEl);

    scorebar.appendChild(meCard); scorebar.appendChild(vs); scorebar.appendChild(oppCard);
    root.appendChild(scorebar);

    // turn badge
    const turnBadge = document.createElement('div');
    turnBadge.className = 'gmk-turnbadge';
    const badgeDot = document.createElement('span'); badgeDot.className = 'dot';
    const badgeText = document.createElement('span'); badgeText.textContent = '';
    turnBadge.appendChild(badgeDot); turnBadge.appendChild(badgeText);
    root.appendChild(turnBadge);

    // board
    const boardWrap = document.createElement('div');
    boardWrap.className = 'gmk-boardwrap';
    const svg = svgns('svg');
    svg.setAttribute('viewBox', `0 0 ${SVG_SIZE} ${SVG_SIZE}`);
    svg.setAttribute('width', String(SVG_SIZE));
    svg.setAttribute('height', String(SVG_SIZE));

    const bg = svgns('rect');
    bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
    bg.setAttribute('width', String(SVG_SIZE)); bg.setAttribute('height', String(SVG_SIZE));
    bg.setAttribute('fill', '#c8975f');
    svg.appendChild(bg);

    // grid lines
    for (let i = 0; i < SIZE; i++) {
      const [x1, y1] = pt(i, 0);
      const [x2, y2] = pt(i, SIZE - 1);
      const hLine = svgns('line');
      hLine.setAttribute('x1', String(x1)); hLine.setAttribute('y1', String(y1));
      hLine.setAttribute('x2', String(x2)); hLine.setAttribute('y2', String(y2));
      hLine.setAttribute('stroke', '#8a6539'); hLine.setAttribute('stroke-width', '1');
      svg.appendChild(hLine);

      const [x1v, y1v] = pt(0, i);
      const [x2v, y2v] = pt(SIZE - 1, i);
      const vLine = svgns('line');
      vLine.setAttribute('x1', String(x1v)); vLine.setAttribute('y1', String(y1v));
      vLine.setAttribute('x2', String(x2v)); vLine.setAttribute('y2', String(y2v));
      vLine.setAttribute('stroke', '#8a6539'); vLine.setAttribute('stroke-width', '1');
      svg.appendChild(vLine);
    }

    // star points (traditional gomoku/go board markers)
    const starPositions = [3, 7, 11];
    starPositions.forEach(r => {
      starPositions.forEach(c => {
        const [x, y] = pt(r, c);
        const star = svgns('circle');
        star.setAttribute('cx', String(x)); star.setAttribute('cy', String(y));
        star.setAttribute('r', '2.5');
        star.setAttribute('class', 'gmk-star');
        svg.appendChild(star);
      });
    });

    // win line (hidden until a win)
    const winLine = svgns('line');
    winLine.setAttribute('class', 'gmk-win-line');
    svg.appendChild(winLine);
    els.winLineEl = winLine;

    // hit targets (one per intersection)
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const [x, y] = pt(r, c);
        const hit = svgns('rect');
        hit.setAttribute('x', String(x - CELL / 2));
        hit.setAttribute('y', String(y - CELL / 2));
        hit.setAttribute('width', String(CELL));
        hit.setAttribute('height', String(CELL));
        hit.setAttribute('class', 'gmk-cellhit');
        svg.appendChild(hit);
        const key = r + '-' + c;
        els.cellHit.set(key, hit);
        hit.addEventListener('click', () => onCellClick(r, c));
        hit.addEventListener('touchstart', function (e) { e.preventDefault(); onCellClick(r, c); }, { passive: false });
      }
    }

    // last-move marker (hidden ring, repositioned each render)
    const lastMarker = svgns('circle');
    lastMarker.setAttribute('r', String(STONE_R + 3));
    lastMarker.setAttribute('class', 'gmk-last-marker');
    lastMarker.style.display = 'none';
    svg.appendChild(lastMarker);
    els.lastMarker = lastMarker;

    boardWrap.appendChild(svg);
    root.appendChild(boardWrap);
    container.appendChild(root);

    els.root = root;
    els.boardWrap = boardWrap;
    els.svg = svg;
    els.scoreMeName = meNameText;
    els.scoreOppName = oppNameText;
    els.meSwatch = meSwatch;
    els.oppSwatch = oppSwatch;
    els.turnBadge = badgeText;
    els.badgeDot = badgeDot;
  }

  // ============================================================
  // GAME LOGIC
  // ============================================================
  const DIRS = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diag \
    [1, -1],  // diag /
  ];

  function checkWinAt(board, r, c, color) {
    for (const [dr, dc] of DIRS) {
      const line = [{ r, c }];
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === color) {
        line.push({ r: rr, c: cc });
        rr += dr; cc += dc;
      }
      rr = r - dr; cc = c - dc;
      while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === color) {
        line.unshift({ r: rr, c: cc });
        rr -= dr; cc -= dc;
      }
      if (line.length >= WIN_LEN) return line;
    }
    return null;
  }

  function boardFull() {
    return state.moveCount >= SIZE * SIZE;
  }

  function applyMove(r, c, byColor) {
    if (state.board[r][c]) return { ok: false };
    state.board[r][c] = byColor;
    state.moveCount++;
    state.lastMove = { r, c };
    const win = checkWinAt(state.board, r, c, byColor);
    if (win) state.winLine = win;
    if (!win) state.turn = byColor === 'w' ? 'b' : 'w';
    return { ok: true, win: !!win, draw: !win && boardFull() };
  }

  function resolveEndIfNeeded(result, byColor) {
    if (result.win) {
      if (localMode) {
        const title = byColor === 'w' ? 'Player 1 wins' : 'Player 2 wins';
        endGame(title, 'Five in a row.', 'win', byColor);
      } else {
        const iWon = byColor === myColor;
        endGame(iWon ? 'You win' : 'You lose', 'Five in a row.', iWon ? 'win' : 'lose');
      }
      return true;
    }
    if (result.draw) {
      endGame('Draw', 'Board is full.', 'draw');
      return true;
    }
    return false;
  }

  function onCellClick(r, c) {
    if (gameEnded) return;
    if (!canIPlay()) { toast('Not your turn'); return; }
    if (state.board[r][c]) return;

    const mover = localMode ? state.turn : myColor;
    const result = applyMove(r, c, mover);
    if (!result.ok) return;

    sndMove();
    render();
    gameSend({ kind: 'move', r, c, by: mover });
    setStatusLine();
    resolveEndIfNeeded(result, mover);
  }

  // ============================================================
  // CONTROLLER
  // ============================================================
  function init(isHostOrLocal, resetState) {
    if (resetState || !state) {
      state = freshState();
      // clear any stone elements from a previous game
      els.stoneEls.forEach(entry => { if (entry.stone) entry.stone.remove(); if (entry.shadow) entry.shadow.remove(); });
      els.stoneEls.clear();
      els.cellHit.forEach(hit => hit.classList.remove('taken'));
      if (els.winLineEl) els.winLineEl.classList.remove('shown');
      if (els.lastMarker) els.lastMarker.style.display = 'none';
    }
    if (els.scoreMeName) els.scoreMeName.textContent = localMode ? 'Player 1' : 'You';
    if (els.scoreOppName) els.scoreOppName.textContent = localMode ? 'Player 2' : (oppName || 'Opponent');
    if (!localMode) {
      els.meSwatch.className = 'gmk-swatch ' + myColor;
      els.oppSwatch.className = 'gmk-swatch ' + (myColor === 'w' ? 'b' : 'w');
    } else {
      els.meSwatch.className = 'gmk-swatch w';
      els.oppSwatch.className = 'gmk-swatch b';
    }
    render();
  }

  function ensureStone(r, c, color) {
    const key = r + '-' + c;
    let entry = els.stoneEls.get(key);
    if (entry) return entry;
    const [x, y] = pt(r, c);
    const shadow = svgns('circle');
    shadow.setAttribute('cx', String(x + 1));
    shadow.setAttribute('cy', String(y + 1.5));
    shadow.setAttribute('r', String(STONE_R));
    shadow.setAttribute('class', 'gmk-stone-shadow');
    const stone = svgns('circle');
    stone.setAttribute('cx', String(x));
    stone.setAttribute('cy', String(y));
    stone.setAttribute('r', String(STONE_R));
    stone.setAttribute('class', 'gmk-stone ' + color + ' gmk-pop');
    // insert before the last-move marker so overlays (marker/win line) stay on top
    els.svg.insertBefore(shadow, els.lastMarker);
    els.svg.insertBefore(stone, els.lastMarker);
    entry = { stone, shadow };
    els.stoneEls.set(key, entry);
    return entry;
  }

  function render() {
    if (!els.svg) return;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const color = state.board[r][c];
        const key = r + '-' + c;
        if (color) {
          if (!els.stoneEls.has(key)) ensureStone(r, c, color);
          const hit = els.cellHit.get(key);
          if (hit) hit.classList.add('taken');
        }
      }
    }

    // last move marker
    if (state.lastMove && !state.winLine) {
      const [x, y] = pt(state.lastMove.r, state.lastMove.c);
      els.lastMarker.setAttribute('cx', String(x));
      els.lastMarker.setAttribute('cy', String(y));
      els.lastMarker.style.display = '';
    } else if (!state.lastMove) {
      els.lastMarker.style.display = 'none';
    }

    // win line
    if (state.winLine && state.winLine.length >= 2) {
      els.lastMarker.style.display = 'none';
      const first = state.winLine[0];
      const last = state.winLine[state.winLine.length - 1];
      const [x1, y1] = pt(first.r, first.c);
      const [x2, y2] = pt(last.r, last.c);
      els.winLineEl.setAttribute('x1', String(x1));
      els.winLineEl.setAttribute('y1', String(y1));
      els.winLineEl.setAttribute('x2', String(x2));
      els.winLineEl.setAttribute('y2', String(y2));
      els.winLineEl.classList.add('shown');
    }

    // turn highlight
    const meCard = els.root.querySelector('.gmk-scorecard.me');
    const oppCard = els.root.querySelector('.gmk-scorecard.opp');
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
        els.badgeDot.style.background = (localMode ? p1TurnLocal : myTurnNow) ? '#e0a45c' : '#565c6e';
      }
    }
  }

  function onData(payload) {
    if (!payload || payload.kind !== 'move') return;
    const { r, c, by } = payload;
    if (state.board[r][c]) return;
    const result = applyMove(r, c, by);
    if (!result.ok) return;
    sndMove();
    render();
    setStatusLine();
    resolveEndIfNeeded(result, by);
  }

  function statusText() {
    if (gameEnded) return 'Game over';
    if (localMode) {
      return (state.turn === 'w' ? 'Player 1 (white)' : 'Player 2 (black)') + '\u2019s turn';
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
