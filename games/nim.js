// games/nim.js
// Nim — Twoplay module. Self-contained. No external deps.
//
// Rules: 4 piles of stones (3,5,7,9). On your turn, remove 1+ stones from
// exactly one pile. Whoever takes the last stone loses (misère Nim).

(function () {
  const ID = 'nim';
  const INITIAL_PILES = [3, 5, 7, 9];

  let state = null;

  function freshState() {
    return {
      piles: INITIAL_PILES.slice(),
      turn: 'w',
      ended: false,
      selectedPile: null,   // index of pile currently being adjusted
      pendingTake: 1        // how many stones queued to remove from selectedPile
    };
  }

  // ---- DOM refs ----
  let els = {
    root: null,
    pilesWrap: null,
    pileEls: [],      // per-pile container
    stoneEls: [],      // per-pile array of stone elements
    controls: null,
    takeLabel: null,
    minusBtn: null,
    plusBtn: null,
    confirmBtn: null,
  };

  function canIPlay() {
    if (!state || state.ended) return false;
    if (typeof localMode !== 'undefined' && localMode) return true;
    return state.turn === myColor;
  }

  function myTurnColor() {
    return (typeof localMode !== 'undefined' && localMode) ? state.turn : myColor;
  }

  function mount(container) {
    container.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      .nim-wrap { display:flex; flex-direction:column; align-items:center; gap:16px; padding:10px 8px; touch-action: manipulation; }
      .nim-piles { display:flex; flex-direction:column; gap:10px; width:100%; max-width:340px; }
      .nim-pile-row { display:flex; align-items:center; gap:10px; background:#181a22; border:1px solid #262a35; border-radius:10px; padding:8px 10px; cursor:pointer; transition:border-color .12s ease, background .12s ease; }
      .nim-pile-row.active { border-color:#e9a23b; background:#221c14; }
      .nim-pile-row.disabled { opacity:.45; cursor:default; }
      .nim-pile-label { font-size:11px; color:#8890a0; width:44px; flex-shrink:0; font-weight:600; }
      .nim-stones { display:flex; flex-wrap:wrap; gap:5px; flex:1; min-height:22px; align-items:center; }
      .nim-stone { width:16px; height:16px; border-radius:50%; background:#4a5064; transition: background .15s ease, transform .15s ease, opacity .15s ease; }
      .nim-stone.queued { background:#e9a23b; transform:scale(1.15); }
      .nim-stone.removed { opacity:0; transform:scale(0); }

      .nim-controls { display:flex; align-items:center; gap:14px; background:#14161c; border:1px solid #262a35; border-radius:12px; padding:10px 14px; width:100%; max-width:340px; justify-content:center; }
      .nim-ctrl-btn { width:36px; height:36px; border-radius:9px; background:#1e212b; border:1px solid #2c303c; color:#e7e9ee; font-size:18px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; touch-action: manipulation; }
      .nim-ctrl-btn:disabled { opacity:.3; cursor:not-allowed; }
      .nim-take-label { font-size:13px; color:#c7ccd6; min-width:90px; text-align:center; font-weight:600; }
      .nim-confirm { background:linear-gradient(135deg,#6ee7b7,#3fb98a); color:#08231a; border:none; border-radius:9px; padding:10px 18px; font-weight:700; font-size:12.5px; cursor:pointer; touch-action: manipulation; }
      .nim-confirm:disabled { opacity:.3; cursor:not-allowed; }

      .nim-hint { font-size:11px; color:#767c8c; text-align:center; max-width:320px; line-height:1.5; }
    `;
    container.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'nim-wrap';

    const hint = document.createElement('div');
    hint.className = 'nim-hint';
    hint.textContent = 'Tap a pile, choose how many stones to remove, confirm. Whoever takes the last stone loses.';
    wrap.appendChild(hint);

    const pilesWrap = document.createElement('div');
    pilesWrap.className = 'nim-piles';
    wrap.appendChild(pilesWrap);

    const controls = document.createElement('div');
    controls.className = 'nim-controls';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'nim-ctrl-btn';
    minusBtn.textContent = '−';
    minusBtn.addEventListener('click', () => adjustTake(-1));

    const takeLabel = document.createElement('div');
    takeLabel.className = 'nim-take-label';
    takeLabel.textContent = 'select a pile';

    const plusBtn = document.createElement('button');
    plusBtn.className = 'nim-ctrl-btn';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => adjustTake(1));

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'nim-confirm';
    confirmBtn.textContent = 'Take';
    confirmBtn.addEventListener('click', confirmTake);

    controls.appendChild(minusBtn);
    controls.appendChild(takeLabel);
    controls.appendChild(plusBtn);
    wrap.appendChild(controls);
    wrap.appendChild(confirmBtn);

    container.appendChild(wrap);

    els.root = wrap;
    els.pilesWrap = pilesWrap;
    els.minusBtn = minusBtn;
    els.plusBtn = plusBtn;
    els.takeLabel = takeLabel;
    els.confirmBtn = confirmBtn;
    els.pileEls = [];
    els.stoneEls = [];

    buildPileRows();
  }

  function buildPileRows() {
    els.pilesWrap.innerHTML = '';
    els.pileEls = [];
    els.stoneEls = [];

    INITIAL_PILES.forEach((count, i) => {
      const row = document.createElement('div');
      row.className = 'nim-pile-row';
      row.addEventListener('click', () => selectPile(i));

      const label = document.createElement('div');
      label.className = 'nim-pile-label';
      label.textContent = 'Pile ' + (i + 1);

      const stones = document.createElement('div');
      stones.className = 'nim-stones';

      const stoneEls = [];
      for (let s = 0; s < count; s++) {
        const stone = document.createElement('div');
        stone.className = 'nim-stone';
        stones.appendChild(stone);
        stoneEls.push(stone);
      }

      row.appendChild(label);
      row.appendChild(stones);
      els.pilesWrap.appendChild(row);
      els.pileEls.push(row);
      els.stoneEls.push(stoneEls);
    });
  }

  function selectPile(i) {
    if (!canIPlay()) return;
    if (state.piles[i] <= 0) return;
    state.selectedPile = i;
    state.pendingTake = 1;
    render();
  }

  function adjustTake(delta) {
    if (!canIPlay() || state.selectedPile === null) return;
    const max = state.piles[state.selectedPile];
    state.pendingTake = Math.min(max, Math.max(1, state.pendingTake + delta));
    render();
  }

  function confirmTake() {
    if (!canIPlay() || state.selectedPile === null) return;
    const pileIdx = state.selectedPile;
    const amount = state.pendingTake;
    if (amount < 1 || amount > state.piles[pileIdx]) return;

    const color = myTurnColor();
    applyTake(pileIdx, amount, color);
    sndMove();
    render();
    gameSend({ kind: 'take', pileIdx, amount, color });

    if (!checkGameEnd(color)) {
      state.turn = state.turn === 'w' ? 'b' : 'w';
      state.selectedPile = null;
      state.pendingTake = 1;
      render();
      setStatusLine();
    }
  }

  function applyTake(pileIdx, amount, color) {
    state.piles[pileIdx] = Math.max(0, state.piles[pileIdx] - amount);
  }

  function checkGameEnd(lastMoverColor) {
    const totalStones = state.piles.reduce((a, b) => a + b, 0);
    if (totalStones === 0) {
      state.ended = true;
      // misère rule: the player who took the last stone LOSES
      const loser = lastMoverColor;
      const winner = loser === 'w' ? 'b' : 'w';

      if (typeof localMode !== 'undefined' && localMode) {
        endGame(
          (winner === 'w' ? 'Blue' : 'Red') + ' wins!',
          (loser === 'w' ? 'Blue' : 'Red') + ' took the last stone',
          'win',
          winner
        );
      } else {
        const iWon = winner === myColor;
        endGame(
          iWon ? 'You win!' : 'You lose!',
          iWon ? 'Opponent took the last stone' : 'You took the last stone',
          iWon ? 'win' : 'lose',
          winner
        );
      }
      return true;
    }
    return false;
  }

  function onData(payload) {
    if (!payload || payload.kind !== 'take') return;
    const { pileIdx, amount, color } = payload;
    if (pileIdx == null || amount == null) return;
    if (amount < 1 || amount > state.piles[pileIdx]) return;

    applyTake(pileIdx, amount, color);
    sndMove();
    render();

    if (!checkGameEnd(color)) {
      state.turn = state.turn === 'w' ? 'b' : 'w';
      render();
      setStatusLine();
    }
  }

  function render() {
    if (!els.pilesWrap) return;

    state.piles.forEach((count, i) => {
      const row = els.pileEls[i];
      const stoneEls = els.stoneEls[i];
      const isSelected = state.selectedPile === i;
      const playable = canIPlay() && count > 0;

      row.classList.toggle('active', isSelected);
      row.classList.toggle('disabled', !playable);

      stoneEls.forEach((stoneEl, s) => {
        const removed = s >= count;
        const queued = isSelected && !removed && s >= (count - state.pendingTake);
        stoneEl.classList.toggle('removed', removed);
        stoneEl.classList.toggle('queued', queued);
      });
    });

    const hasSelection = state.selectedPile !== null && canIPlay();
    els.minusBtn.disabled = !hasSelection || state.pendingTake <= 1;
    els.plusBtn.disabled = !hasSelection || state.pendingTake >= (state.piles[state.selectedPile] || 0);
    els.confirmBtn.disabled = !hasSelection;

    if (hasSelection) {
      els.takeLabel.textContent = 'take ' + state.pendingTake + ' from pile ' + (state.selectedPile + 1);
    } else if (!canIPlay()) {
      els.takeLabel.textContent = 'waiting…';
    } else {
      els.takeLabel.textContent = 'select a pile';
    }
  }

  function init(isHostOrLocal, resetState) {
    if (resetState || !state) {
      state = freshState();
    }
    render();
  }

  function statusText() {
    if (!state) return '';
    if (state.ended) return 'Game over';
    if (typeof localMode !== 'undefined' && localMode) {
      return (state.turn === 'w' ? 'Blue' : 'Red') + "'s turn";
    }
    return canIPlay() ? 'Your turn' : (oppName + '\u2019s turn');
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
