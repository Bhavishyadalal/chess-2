// games/dotduel.js
// Dot Duel — Twoplay module. Self-contained. No external deps.
//
// Real-time chaos game: an 8x10 grid of cells. Tap a cell you own (or any
// empty cell if you have none) to plant a pulse there. Pulses grow over
// time and spread to orthogonal neighbors, capturing empty cells and
// overrunning weaker enemy pulses. Whoever controls the most cells when
// the clock hits zero wins. No turns — both players can tap simultaneously,
// as fast as they want.

(function () {
  const ID = 'dotduel';
  const COLS = 8, ROWS = 10;
  const MATCH_SECONDS = 45;
  const TICK_MS = 200;
  const GROWTH_PER_TICK = 8;
  const SPREAD_THRESHOLD = 40;   // cell power needed before it can spread
  const SPREAD_COST = 25;        // power spent to spread into a neighbor
  const MAX_POWER = 100;
  const TAP_PLANT_POWER = 20;

  let state = null;
  let tickHandle = null;

  function freshState() {
    const cells = new Array(COLS * ROWS).fill(null).map(() => ({ owner: null, power: 0 }));
    return {
      cells,
      secondsLeft: MATCH_SECONDS,
      running: false,
      ended: false
    };
  }

  function idx(c, r) { return r * COLS + c; }
  function neighbors(c, r) {
    const out = [];
    if (c > 0) out.push([c - 1, r]);
    if (c < COLS - 1) out.push([c + 1, r]);
    if (r > 0) out.push([c, r - 1]);
    if (r < ROWS - 1) out.push([c, r + 1]);
    return out;
  }

  // ---- DOM refs ----
  let els = { root: null, grid: null, cellEls: [], timerEl: null, scoreEl: null };

  function canIPlay() {
    if (!state || state.ended) return false;
    return true; // real-time — both players can always act
  }

  function myTurnColor() {
    return (typeof localMode !== 'undefined' && localMode) ? null : myColor;
  }

  function mount(container) {
    container.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      .dd-wrap { display:flex; flex-direction:column; align-items:center; gap:10px; padding:8px; touch-action: manipulation; }
      .dd-hud { display:flex; align-items:center; justify-content:space-between; width:100%; max-width:340px; gap:10px; }
      .dd-timer { font-size:22px; font-weight:800; color:#e7e9ee; font-variant-numeric: tabular-nums; }
      .dd-timer.low { color:#e2607a; }
      .dd-score { display:flex; gap:10px; font-size:13px; font-weight:700; }
      .dd-score .w { color:#6fa8dc; }
      .dd-score .b { color:#e2607a; }
      .dd-grid { display:grid; grid-template-columns: repeat(${COLS}, 1fr); gap:3px; width:100%; max-width:340px; aspect-ratio: ${COLS} / ${ROWS}; }
      .dd-cell { position:relative; border-radius:5px; background:#181a22; border:1px solid #262a35; overflow:hidden; touch-action: manipulation; }
      .dd-cell .fill { position:absolute; inset:0; opacity:0; transition: opacity .15s ease, background .15s ease; }
      .dd-cell.w .fill { background:#3ecf8e; }
      .dd-cell.b .fill { background:#e2607a; }
      .dd-hint { font-size:11px; color:#767c8c; text-align:center; max-width:320px; line-height:1.5; }
      .dd-start-btn { background:linear-gradient(135deg,#6ee7b7,#3fb98a); color:#08231a; border:none; border-radius:9px; padding:12px 22px; font-weight:800; font-size:14px; cursor:pointer; touch-action: manipulation; }
    `;
    container.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'dd-wrap';

    const hud = document.createElement('div');
    hud.className = 'dd-hud';
    const timerEl = document.createElement('div');
    timerEl.className = 'dd-timer';
    timerEl.textContent = MATCH_SECONDS + 's';
    const scoreEl = document.createElement('div');
    scoreEl.className = 'dd-score';
    scoreEl.innerHTML = '<span class="w">0</span>&nbsp;–&nbsp;<span class="b">0</span>';
    hud.appendChild(timerEl);
    hud.appendChild(scoreEl);
    wrap.appendChild(hud);

    const hint = document.createElement('div');
    hint.className = 'dd-hint';
    hint.textContent = 'Tap any cell to plant. Your cells grow and spread on their own — tap your own cells again to speed them up. Most territory when time runs out wins.';
    wrap.appendChild(hint);

    const grid = document.createElement('div');
    grid.className = 'dd-grid';
    const cellEls = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'dd-cell';
        const fill = document.createElement('div');
        fill.className = 'fill';
        cell.appendChild(fill);
        cell.addEventListener('click', () => tapCell(c, r));
        grid.appendChild(cell);
        cellEls.push(cell);
      }
    }
    wrap.appendChild(grid);

    const startBtn = document.createElement('button');
    startBtn.className = 'dd-start-btn';
    startBtn.textContent = 'Start match';
    startBtn.addEventListener('click', () => { startBtn.remove(); startMatch(); });
    wrap.appendChild(startBtn);

    container.appendChild(wrap);

    els.root = wrap;
    els.grid = grid;
    els.cellEls = cellEls;
    els.timerEl = timerEl;
    els.scoreEl = scoreEl;
  }

  function tapCell(c, r) {
    if (!state || state.ended || !state.running) return;
    const color = myTurnColor() || 'w'; // in local mode, tap = plant for whichever side is "you"; kept simple: local mode is same-device co-op chaos
    applyTap(c, r, color);
    sndMove();
    render();
    gameSend({ kind: 'tap', c, r, color });
  }

  function applyTap(c, r, color) {
    const cell = state.cells[idx(c, r)];
    if (cell.owner === null || cell.owner === color) {
      cell.owner = color;
      cell.power = Math.min(MAX_POWER, cell.power + TAP_PLANT_POWER);
    } else {
      // tapping an enemy cell chips it down — lets a losing player fight back
      cell.power -= TAP_PLANT_POWER;
      if (cell.power <= 0) { cell.owner = color; cell.power = 8; }
    }
  }

  function onData(payload) {
    if (!payload) return;
    if (payload.kind === 'tap') {
      applyTap(payload.c, payload.r, payload.color);
      sndMove();
      render();
    } else if (payload.kind === 'tick') {
      state.cells = payload.cells;
      state.secondsLeft = payload.secondsLeft;
      render();
    } else if (payload.kind === 'start') {
      state.running = true;
      render();
    }
  }

  function startMatch() {
    if (!state) state = freshState();
    state.running = true;
    gameSend({ kind: 'start' });
    render();
    runLocalTick();
  }

  // The host device drives the simulation and broadcasts state; simplest
  // reliable model for a fast-tick real-time game over an unreliable P2P
  // link — avoids both sides drifting out of sync from independent sims.
  function runLocalTick() {
    if (tickHandle) clearInterval(tickHandle);
    tickHandle = setInterval(() => {
      if (!state || state.ended || !state.running) { clearInterval(tickHandle); return; }
      simulateTick();
      state.secondsLeft -= TICK_MS / 1000;
      gameSend({ kind: 'tick', cells: state.cells, secondsLeft: state.secondsLeft });
      render();
      if (state.secondsLeft <= 0) {
        clearInterval(tickHandle);
        finishMatch();
      }
    }, TICK_MS);
  }

  function simulateTick() {
    const grown = state.cells.map(c => ({ ...c }));
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grown[idx(c, r)];
        if (!cell.owner) continue;
        cell.power = Math.min(MAX_POWER, cell.power + GROWTH_PER_TICK);
        if (cell.power >= SPREAD_THRESHOLD) {
          const targets = neighbors(c, r).map(([nc, nr]) => idx(nc, nr));
          for (const ti of targets) {
            const t = state.cells[ti];
            if (t.owner === cell.owner) continue;
            if (cell.power < SPREAD_COST) break;
            if (!t.owner) {
              grown[ti] = { owner: cell.owner, power: 15 };
              cell.power -= SPREAD_COST;
            } else if (t.owner !== cell.owner && t.power < cell.power) {
              grown[ti] = { owner: cell.owner, power: Math.max(10, cell.power - t.power) };
              cell.power -= SPREAD_COST;
            }
          }
        }
        grown[idx(c, r)] = cell;
      }
    }
    state.cells = grown;
  }

  function scores() {
    let w = 0, b = 0;
    for (const cell of state.cells) {
      if (cell.owner === 'w') w++;
      else if (cell.owner === 'b') b++;
    }
    return { w, b };
  }

  function finishMatch() {
    state.ended = true;
    const { w, b } = scores();
    let winnerColor = null;
    if (w !== b) winnerColor = w > b ? 'w' : 'b';
    if (!winnerColor) { endGame('Draw', `${w}–${b}. Dead even.`, 'draw'); return; }
    if (typeof localMode !== 'undefined' && localMode) {
      endGame((winnerColor === 'w' ? 'Green' : 'Red') + ' wins!', `${Math.max(w,b)}–${Math.min(w,b)} cells.`, 'win', winnerColor);
    } else {
      const iWon = winnerColor === myColor;
      endGame(iWon ? 'You win!' : 'You lose!', `${Math.max(w,b)}–${Math.min(w,b)} cells.`, iWon ? 'win' : 'lose', winnerColor);
    }
  }

  function render() {
    if (!els.grid || !state) return;
    for (let i = 0; i < state.cells.length; i++) {
      const cell = state.cells[i];
      const el = els.cellEls[i];
      el.classList.toggle('w', cell.owner === 'w');
      el.classList.toggle('b', cell.owner === 'b');
      const fill = el.querySelector('.fill');
      fill.style.opacity = cell.owner ? Math.max(0.25, cell.power / MAX_POWER) : 0;
    }
    const secs = Math.max(0, Math.ceil(state.secondsLeft));
    els.timerEl.textContent = secs + 's';
    els.timerEl.classList.toggle('low', secs <= 10);
    const { w, b } = scores();
    els.scoreEl.innerHTML = `<span class="w">${w}</span>&nbsp;–&nbsp;<span class="b">${b}</span>`;
  }

  function init(isHostOrLocal, resetState) {
    if (resetState || !state) {
      state = freshState();
    }
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    render();
  }

  function statusText() {
    if (!state) return '';
    if (state.ended) return 'Game over';
    if (!state.running) return 'Tap start to begin';
    return 'Tap any cell — no turns!';
  }

  function canTakeback() { return false; }

  window.GameModules = window.GameModules || {};
  window.GameControllers = window.GameControllers || {};

  window.GameModules[ID] = { mount };
  window.GameControllers[ID] = {
    init,
    render,
    onData,
    statusText,
    canTakeback
  };
})();
