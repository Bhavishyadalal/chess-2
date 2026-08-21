// ===================================================================
// TWOPLAY GAME MODULE: QUORIDOR
// 9x9 Strategic Maze Warfare.
// Advance your pawn to the opposite side of the board or place fences
// to trap and redirect your opponent. Pure chess-tier spatial mind games.
// ===================================================================

const ID = 'quoridor';
window.GameModules = window.GameModules || {};
window.GameControllers = window.GameControllers || {};

(function () {
    const SIZE = 9; // 9x9 board
    const MAX_WALLS = 10;

    // State
    let p1 = { r: 8, c: 4, walls: 10 }; // 'w' starts at bottom row 8, target row 0
    let p2 = { r: 0, c: 4, walls: 10 }; // 'b' starts at top row 0, target row 8
    let hWalls = []; // 8x8 boolean: horizontal wall spanning (r, c) and (r, c+1)
    let vWalls = []; // 8x8 boolean: vertical wall spanning (r, c) and (r+1, c)
    let turn = 'w';  // 'w' (P1 / Teal) | 'b' (P2 / Amber)
    let lastAction = null; // { type: 'move'|'wall', player, ... }
    let history = [];

    // Local UI control state
    let activeTool = 'move'; // 'move' | 'h-wall' | 'v-wall'

    // DOM cache
    let dom = null;

    function clone2D(arr) {
        return arr.map(row => row.slice());
    }

    function canIPlay() {
        return localMode ? true : turn === myColor;
    }

    function isEdgeBlocked(r1, c1, r2, c2, hW, vW) {
        hW = hW || hWalls;
        vW = vW || vWalls;

        // Moving horizontally (same row)
        if (r1 === r2) {
            const minC = Math.min(c1, c2);
            // Blocked if vertical wall at (r1, minC) or (r1 - 1, minC)
            if (vW[r1] && vW[r1][minC]) return true;
            if (r1 > 0 && vW[r1 - 1] && vW[r1 - 1][minC]) return true;
            return false;
        }

        // Moving vertically (same col)
        if (c1 === c2) {
            const minR = Math.min(r1, r2);
            // Blocked if horizontal wall at (minR, c1) or (minR, c1 - 1)
            if (hW[minR] && hW[minR][c1]) return true;
            if (c1 > 0 && hW[minR] && hW[minR][c1 - 1]) return true;
            return false;
        }

        return true;
    }

    function getLegalPawnMoves(forPlayer) {
        const me = forPlayer === 'w' ? p1 : p2;
        const opp = forPlayer === 'w' ? p2 : p1;
        const moves = [];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

        for (const [dr, dc] of dirs) {
            const nr = me.r + dr, nc = me.c + dc;
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
            if (isEdgeBlocked(me.r, me.c, nr, nc)) continue;

            if (nr === opp.r && nc === opp.c) {
                // Try straight jump over opponent
                const jumpR = nr + dr, jumpC = nc + dc;
                if (jumpR >= 0 && jumpR < SIZE && jumpC >= 0 && jumpC < SIZE && !isEdgeBlocked(nr, nc, jumpR, jumpC)) {
                    moves.push({ r: jumpR, c: jumpC, jump: true });
                } else {
                    // Straight jump blocked: check diagonal jumps
                    const sideDirs = dr === 0 ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
                    for (const [sdr, sdc] of sideDirs) {
                        const diagR = nr + sdr, diagC = nc + sdc;
                        if (diagR >= 0 && diagR < SIZE && diagC >= 0 && diagC < SIZE && !isEdgeBlocked(nr, nc, diagR, diagC)) {
                            moves.push({ r: diagR, c: diagC, jump: true });
                        }
                    }
                }
            } else {
                moves.push({ r: nr, c: nc, jump: false });
            }
        }
        return moves;
    }

    function canPlaceWall(type, r, c) {
        if (r < 0 || r >= SIZE - 1 || c < 0 || c >= SIZE - 1) return false;
        const curPlayer = turn === 'w' ? p1 : p2;
        if (curPlayer.walls <= 0) return false;

        // Check intersection and overlaps
        if (type === 'h') {
            if (hWalls[r][c]) return false;
            if (c > 0 && hWalls[r][c - 1]) return false;
            if (c < SIZE - 2 && hWalls[r][c + 1]) return false;
            if (vWalls[r][c]) return false; // Crosses vertical wall center
        } else {
            if (vWalls[r][c]) return false;
            if (r > 0 && vWalls[r - 1][c]) return false;
            if (r < SIZE - 2 && vWalls[r + 1][c]) return false;
            if (hWalls[r][c]) return false; // Crosses horizontal wall center
        }

        // BFS: ensure both players maintain a path to their goal row
        const tempHW = clone2D(hWalls);
        const tempVW = clone2D(vWalls);
        if (type === 'h') tempHW[r][c] = true;
        else tempVW[r][c] = true;

        if (!hasPathToGoal(p1.r, p1.c, 0, tempHW, tempVW)) return false;
        if (!hasPathToGoal(p2.r, p2.c, SIZE - 1, tempHW, tempVW)) return false;

        return true;
    }

    function hasPathToGoal(startR, startC, targetRow, hW, vW) {
        const visited = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
        const queue = [[startR, startC]];
        visited[startR][startC] = true;

        while (queue.length > 0) {
            const [r, c] = queue.shift();
            if (r === targetRow) return true;

            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            for (const [dr, dc] of dirs) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !visited[nr][nc]) {
                    if (!isEdgeBlocked(r, c, nr, nc, hW, vW)) {
                        visited[nr][nc] = true;
                        queue.push([nr, nc]);
                    }
                }
            }
        }
        return false;
    }

    function applyPawnMove(r, c) {
        history.push({
            p1: { ...p1 },
            p2: { ...p2 },
            hWalls: clone2D(hWalls),
            vWalls: clone2D(vWalls),
            turn,
            lastAction: lastAction ? { ...lastAction } : null
        });

        if (turn === 'w') p1 = { ...p1, r, c };
        else p2 = { ...p2, r, c };

        lastAction = { type: 'move', player: turn, r, c };
        sndMove();
        turn = turn === 'w' ? 'b' : 'w';
    }

    function applyWallPlacement(type, r, c) {
        history.push({
            p1: { ...p1 },
            p2: { ...p2 },
            hWalls: clone2D(hWalls),
            vWalls: clone2D(vWalls),
            turn,
            lastAction: lastAction ? { ...lastAction } : null
        });

        if (type === 'h') hWalls[r][c] = true;
        else vWalls[r][c] = true;

        if (turn === 'w') p1.walls--;
        else p2.walls--;

        lastAction = { type: 'wall', wallType: type, player: turn, r, c };
        sndCapture();
        turn = turn === 'w' ? 'b' : 'w';
    }

    function resolveEnd() {
        let winnerColor = null;
        if (p1.r === 0) winnerColor = 'w';
        else if (p2.r === SIZE - 1) winnerColor = 'b';

        if (winnerColor) {
            const iWon = winnerColor === myColor;
            const p1Name = localMode ? 'Player 1 (Teal)' : (myColor === 'w' ? 'You' : oppName);
            const p2Name = localMode ? 'Player 2 (Amber)' : (myColor === 'b' ? 'You' : oppName);
            const winnerName = winnerColor === 'w' ? p1Name : p2Name;

            const title = localMode ? `${winnerName} wins!` : (iWon ? 'You win' : 'You lose');
            const sub = 'Reached the opposite baseline.';
            const resultClass = localMode ? 'win' : (iWon ? 'win' : 'lose');

            setTimeout(() => {
                endGame(title, sub, resultClass, winnerColor);
            }, 300);
        }
    }

    // ===================================================================
    // DOM MOUNT & RENDER
    // ===================================================================
    GameModules[ID] = GameModules['quoridor'] = {
        mount(container) {
            container.innerHTML = `
                <style>
                    .qrd-frame {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        width: 100%;
                        max-width: 440px;
                        margin: 0 auto;
                        gap: 10px;
                        touch-action: manipulation;
                        user-select: none;
                        -webkit-user-select: none;
                    }
                    .qrd-top-card {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        width: 100%;
                        padding: 8px 14px;
                        background: linear-gradient(155deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015));
                        border: 1px solid var(--border-soft, rgba(255,255,255,0.08));
                        border-radius: var(--radius-lg, 16px);
                        backdrop-filter: blur(14px);
                        -webkit-backdrop-filter: blur(14px);
                        box-shadow: var(--shadow-soft, 0 4px 20px rgba(0,0,0,0.35));
                    }
                    .qrd-player-pill {
                        display: flex;
                        flex-direction: column;
                        gap: 3px;
                        padding: 6px 10px;
                        border-radius: 12px;
                        background: var(--surface-2, #171b24);
                        border: 1px solid transparent;
                        transition: all 0.2s ease;
                    }
                    .qrd-player-pill.p1 { color: #3ecf8e; }
                    .qrd-player-pill.p2 { color: #e0b872; }
                    .qrd-player-pill.active {
                        border-color: currentColor;
                        box-shadow: 0 0 14px currentColor;
                        background: rgba(255,255,255,0.08);
                    }
                    .qrd-pill-header {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 12px;
                        font-weight: 700;
                    }
                    .qrd-pawn-icon {
                        width: 10px;
                        height: 10px;
                        border-radius: 50%;
                        background: currentColor;
                    }
                    .qrd-wall-counter {
                        font-family: var(--font-mono, monospace);
                        font-size: 10px;
                        color: var(--text-faint, #767c8c);
                    }
                    .qrd-controls-row {
                        display: flex;
                        gap: 6px;
                        width: 100%;
                    }
                    .qrd-tool-btn {
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        padding: 8px 0;
                        font-size: 12px;
                        font-weight: 700;
                        border-radius: 10px;
                        background: var(--surface-2, #171b24);
                        border: 1px solid var(--border, rgba(255,255,255,0.1));
                        color: var(--text-dim, #a6adba);
                        transition: all 0.16s ease;
                    }
                    .qrd-tool-btn:hover:not(:disabled) {
                        background: var(--surface-3, #1d222c);
                        color: var(--text, #fff);
                    }
                    .qrd-tool-btn.active {
                        background: var(--accent-dim, rgba(224,184,114,0.18));
                        border-color: var(--accent, #e0b872);
                        color: var(--accent, #e0b872);
                        box-shadow: 0 0 10px rgba(224,184,114,0.25);
                    }
                    .qrd-svg-board {
                        width: 100%;
                        aspect-ratio: 1;
                        max-width: 440px;
                        background: radial-gradient(circle at center, #151922, #0b0d12);
                        border: 1px solid var(--border, rgba(255,255,255,0.1));
                        border-radius: var(--radius-xl, 24px);
                        box-shadow: var(--shadow-lift, 0 20px 60px rgba(0,0,0,0.6));
                        touch-action: manipulation;
                    }
                    .qrd-cell {
                        fill: #1a1f2c;
                        rx: 4px;
                        ry: 4px;
                        cursor: pointer;
                        transition: fill 0.15s ease, filter 0.15s ease;
                    }
                    .qrd-cell:hover {
                        fill: #22293a;
                    }
                    .qrd-cell.target-move {
                        fill: rgba(62,207,142,0.2);
                        stroke: #3ecf8e;
                        stroke-width: 1.5px;
                        animation: qrdTargetGlow 1.2s infinite alternate;
                    }
                    @keyframes qrdTargetGlow {
                        0% { filter: drop-shadow(0 0 2px #3ecf8e); }
                        100% { filter: drop-shadow(0 0 8px #3ecf8e); fill: rgba(62,207,142,0.35); }
                    }
                    .qrd-pawn {
                        filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));
                        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), cx 0.2s ease, cy 0.2s ease;
                        pointer-events: none;
                    }
                    .qrd-pawn.p1 { fill: #3ecf8e; stroke: #ffffff; stroke-width: 1.5px; }
                    .qrd-pawn.p2 { fill: #e0b872; stroke: #ffffff; stroke-width: 1.5px; }
                    .qrd-wall-vis {
                        fill: #ff6b6b;
                        rx: 3px;
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));
                        pointer-events: none;
                    }
                    .qrd-wall-hit {
                        fill: transparent;
                        cursor: pointer;
                    }
                    .qrd-wall-hit:hover {
                        fill: rgba(255,255,255,0.2);
                    }
                    .qrd-goal-line {
                        stroke-dasharray: 4 3;
                        stroke-width: 1.5px;
                        pointer-events: none;
                    }
                    .qrd-goal-line.p1 { stroke: rgba(62,207,142,0.4); }
                    .qrd-goal-line.p2 { stroke: rgba(224,184,114,0.4); }
                </style>

                <div class="qrd-frame">
                    <div class="qrd-top-card">
                        <div class="qrd-player-pill p1" id="qrd-pill-p1">
                            <div class="qrd-pill-header">
                                <span class="qrd-pawn-icon"></span>
                                <span id="qrd-name-p1">P1 (Teal)</span>
                            </div>
                            <span class="qrd-wall-counter" id="qrd-walls-p1">10 walls left</span>
                        </div>
                        <div class="qrd-player-pill p2" id="qrd-pill-p2">
                            <div class="qrd-pill-header">
                                <span id="qrd-name-p2">P2 (Amber)</span>
                                <span class="qrd-pawn-icon"></span>
                            </div>
                            <span class="qrd-wall-counter" id="qrd-walls-p2">10 walls left</span>
                        </div>
                    </div>

                    <div class="qrd-controls-row">
                        <button type="button" class="qrd-tool-btn active" id="qrd-tool-move">
                            <span>🏃</span> Move Pawn
                        </button>
                        <button type="button" class="qrd-tool-btn" id="qrd-tool-hwall">
                            <span>▬</span> Horiz Wall
                        </button>
                        <button type="button" class="qrd-tool-btn" id="qrd-tool-vwall">
                            <span>▮</span> Vert Wall
                        </button>
                    </div>

                    <svg class="qrd-svg-board" viewBox="0 0 380 380" id="qrd-svg"></svg>
                </div>
            `;

            setupToolButtons();
            buildSvgBoard();
        }
    };

    function setupToolButtons() {
        const moveBtn = document.getElementById('qrd-tool-move');
        const hWallBtn = document.getElementById('qrd-tool-hwall');
        const vWallBtn = document.getElementById('qrd-tool-vwall');

        const setTool = (tool) => {
            activeTool = tool;
            moveBtn.classList.toggle('active', tool === 'move');
            hWallBtn.classList.toggle('active', tool === 'h-wall');
            vWallBtn.classList.toggle('active', tool === 'v-wall');
            render();
        };

        if (moveBtn) moveBtn.addEventListener('click', () => setTool('move'));
        if (hWallBtn) hWallBtn.addEventListener('click', () => setTool('h-wall'));
        if (vWallBtn) vWallBtn.addEventListener('click', () => setTool('v-wall'));
    }

    function buildSvgBoard() {
        const svg = document.getElementById('qrd-svg');
        if (!svg) return;
        svg.innerHTML = '';

        dom = {
            pillP1: document.getElementById('qrd-pill-p1'),
            pillP2: document.getElementById('qrd-pill-p2'),
            nameP1: document.getElementById('qrd-name-p1'),
            nameP2: document.getElementById('qrd-name-p2'),
            wallsP1: document.getElementById('qrd-walls-p1'),
            wallsP2: document.getElementById('qrd-walls-p2'),
            toolMove: document.getElementById('qrd-tool-move'),
            toolHWall: document.getElementById('qrd-tool-hwall'),
            toolVWall: document.getElementById('qrd-tool-vwall'),
            cells: [],
            hWallHits: [],
            vWallHits: [],
            wallLayer: document.createElementNS('http://www.w3.org/2000/svg', 'g'),
            pawnP1: document.createElementNS('http://www.w3.org/2000/svg', 'circle'),
            pawnP2: document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        };

        const PAD = 16;
        const CELL_SIZE = 32;
        const GAP = 8;
        const PITCH = CELL_SIZE + GAP; // 40px per cell

        // 1. Cells (9x9)
        const cellLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (let r = 0; r < SIZE; r++) {
            dom.cells.push([]);
            for (let c = 0; c < SIZE; c++) {
                const x = PAD + c * PITCH;
                const y = PAD + r * PITCH;
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', x);
                rect.setAttribute('y', y);
                rect.setAttribute('width', CELL_SIZE);
                rect.setAttribute('height', CELL_SIZE);
                rect.setAttribute('class', 'qrd-cell');
                rect.addEventListener('click', () => onCellClick(r, c));
                cellLayer.appendChild(rect);
                dom.cells[r].push(rect);
            }
        }
        svg.appendChild(cellLayer);

        // 2. Goal Indicators
        const goalP1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        goalP1.setAttribute('x1', PAD);
        goalP1.setAttribute('y1', PAD - 6);
        goalP1.setAttribute('x2', PAD + 9 * PITCH - GAP);
        goalP1.setAttribute('y2', PAD - 6);
        goalP1.setAttribute('class', 'qrd-goal-line p1');
        svg.appendChild(goalP1);

        const goalP2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        goalP2.setAttribute('x1', PAD);
        goalP2.setAttribute('y1', PAD + 9 * PITCH - GAP + 6);
        goalP2.setAttribute('x2', PAD + 9 * PITCH - GAP);
        goalP2.setAttribute('y2', PAD + 9 * PITCH - GAP + 6);
        goalP2.setAttribute('class', 'qrd-goal-line p2');
        svg.appendChild(goalP2);

        // 3. Wall Layer (Rendered placed walls)
        svg.appendChild(dom.wallLayer);

        // 4. Wall Interactive Hit-Zones (8x8)
        const wallHitLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        for (let r = 0; r < SIZE - 1; r++) {
            dom.hWallHits.push([]);
            dom.vWallHits.push([]);
            for (let c = 0; c < SIZE - 1; c++) {
                // Horizontal Wall Hit Area
                const hx = PAD + c * PITCH;
                const hy = PAD + r * PITCH + CELL_SIZE;
                const hRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                hRect.setAttribute('x', hx);
                hRect.setAttribute('y', hy);
                hRect.setAttribute('width', CELL_SIZE * 2 + GAP);
                hRect.setAttribute('height', GAP);
                hRect.setAttribute('class', 'qrd-wall-hit');
                hRect.addEventListener('click', () => onWallClick('h', r, c));
                wallHitLayer.appendChild(hRect);
                dom.hWallHits[r].push(hRect);

                // Vertical Wall Hit Area
                const vx = PAD + c * PITCH + CELL_SIZE;
                const vy = PAD + r * PITCH;
                const vRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                vRect.setAttribute('x', vx);
                vRect.setAttribute('y', vy);
                vRect.setAttribute('width', GAP);
                vRect.setAttribute('height', CELL_SIZE * 2 + GAP);
                vRect.setAttribute('class', 'qrd-wall-hit');
                vRect.addEventListener('click', () => onWallClick('v', r, c));
                wallHitLayer.appendChild(vRect);
                dom.vWallHits[r].push(vRect);
            }
        }
        svg.appendChild(wallHitLayer);

        // 5. Pawns
        dom.pawnP1.setAttribute('r', '11');
        dom.pawnP1.setAttribute('class', 'qrd-pawn p1');
        svg.appendChild(dom.pawnP1);

        dom.pawnP2.setAttribute('r', '11');
        dom.pawnP2.setAttribute('class', 'qrd-pawn p2');
        svg.appendChild(dom.pawnP2);
    }

    function onCellClick(r, c) {
        if (gameEnded || !canIPlay()) return;
        const legalMoves = getLegalPawnMoves(turn);
        const match = legalMoves.find(m => m.r === r && m.c === c);
        if (!match) return;

        applyPawnMove(r, c);
        gameSend({ kind: 'move', action: 'pawn', r, c });

        if (localMode) {
            myColor = turn;
            if (typeof updateAvatars === 'function') updateAvatars();
        }

        render();
        resolveEnd();
        setStatusLine();
        if (typeof updateActionButtons === 'function') updateActionButtons();
    }

    function onWallClick(type, r, c) {
        if (gameEnded || !canIPlay()) return;
        if (!canPlaceWall(type, r, c)) {
            toast('Cannot place fence here (overlap or path blocked).');
            return;
        }

        applyWallPlacement(type, r, c);
        gameSend({ kind: 'move', action: 'wall', wallType: type, r, c });

        if (localMode) {
            myColor = turn;
            if (typeof updateAvatars === 'function') updateAvatars();
        }

        render();
        resolveEnd();
        setStatusLine();
        if (typeof updateActionButtons === 'function') updateActionButtons();
    }

    function render() {
        if (!dom || !document.getElementById('qrd-svg')) return;

        const PAD = 16, CELL_SIZE = 32, GAP = 8, PITCH = 40;
        const playable = !gameEnded && canIPlay();
        const legalMoves = playable ? getLegalPawnMoves(turn) : [];

        // 1. Highlight Cells
        for (let r = 0; r < SIZE; r++) {
            for (let c = 0; c < SIZE; c++) {
                const isTarget = activeTool === 'move' && legalMoves.some(m => m.r === r && m.c === c);
                dom.cells[r][c].classList.toggle('target-move', isTarget);
            }
        }

        // 2. Position Pawns
        dom.pawnP1.setAttribute('cx', PAD + p1.c * PITCH + CELL_SIZE / 2);
        dom.pawnP1.setAttribute('cy', PAD + p1.r * PITCH + CELL_SIZE / 2);
        dom.pawnP2.setAttribute('cx', PAD + p2.c * PITCH + CELL_SIZE / 2);
        dom.pawnP2.setAttribute('cy', PAD + p2.r * PITCH + CELL_SIZE / 2);

        // 3. Render Placed Walls
        dom.wallLayer.innerHTML = '';
        for (let r = 0; r < SIZE - 1; r++) {
            for (let c = 0; c < SIZE - 1; c++) {
                if (hWalls[r][c]) {
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', PAD + c * PITCH);
                    rect.setAttribute('y', PAD + r * PITCH + CELL_SIZE + 1);
                    rect.setAttribute('width', CELL_SIZE * 2 + GAP);
                    rect.setAttribute('height', GAP - 2);
                    rect.setAttribute('class', 'qrd-wall-vis');
                    dom.wallLayer.appendChild(rect);
                }
                if (vWalls[r][c]) {
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', PAD + c * PITCH + CELL_SIZE + 1);
                    rect.setAttribute('y', PAD + r * PITCH);
                    rect.setAttribute('width', GAP - 2);
                    rect.setAttribute('height', CELL_SIZE * 2 + GAP);
                    rect.setAttribute('class', 'qrd-wall-vis');
                    dom.wallLayer.appendChild(rect);
                }
            }
        }

        // 4. Wall Hit-Areas Visibility & Interactivity
        for (let r = 0; r < SIZE - 1; r++) {
            for (let c = 0; c < SIZE - 1; c++) {
                dom.hWallHits[r][c].style.pointerEvents = (playable && activeTool === 'h-wall') ? 'auto' : 'none';
                dom.vWallHits[r][c].style.pointerEvents = (playable && activeTool === 'v-wall') ? 'auto' : 'none';
            }
        }

        // 5. Header Badges & Stock Counters
        dom.pillP1.classList.toggle('active', turn === 'w' && !gameEnded);
        dom.pillP2.classList.toggle('active', turn === 'b' && !gameEnded);
        dom.wallsP1.textContent = `${p1.walls} fence${p1.walls === 1 ? '' : 's'} left`;
        dom.wallsP2.textContent = `${p2.walls} fence${p2.walls === 1 ? '' : 's'} left`;

        if (localMode) {
            dom.nameP1.textContent = 'P1 (Teal)';
            dom.nameP2.textContent = 'P2 (Amber)';
        } else {
            dom.nameP1.textContent = myColor === 'w' ? 'You (Teal)' : `${oppName} (Teal)`;
            dom.nameP2.textContent = myColor === 'b' ? 'You (Amber)' : `${oppName} (Amber)`;
        }

        // Disable wall tool buttons if player has 0 walls
        const curWalls = (turn === 'w' ? p1.walls : p2.walls);
        if (dom.toolHWall) dom.toolHWall.disabled = curWalls <= 0;
        if (dom.toolVWall) dom.toolVWall.disabled = curWalls <= 0;
        if (curWalls <= 0 && activeTool !== 'move') {
            activeTool = 'move';
            if (dom.toolMove) dom.toolMove.click();
        }
    }

    // ===================================================================
    // CONTROLLER INTERFACE
    // ===================================================================
    GameControllers[ID] = GameControllers['quoridor'] = {
        init(isHostOrLocal, resetState) {
            if (resetState) {
                p1 = { r: 8, c: 4, walls: MAX_WALLS };
                p2 = { r: 0, c: 4, walls: MAX_WALLS };
                hWalls = Array.from({ length: SIZE - 1 }, () => Array(SIZE - 1).fill(false));
                vWalls = Array.from({ length: SIZE - 1 }, () => Array(SIZE - 1).fill(false));
                turn = 'w';
                lastAction = null;
                activeTool = 'move';
                history = [];
            }
            if (!dom || !document.getElementById('qrd-svg')) {
                buildSvgBoard();
            }
            render();
            if (amHost && resetState && !localMode) {
                gameSend({ kind: 'sync', p1, p2, hWalls, vWalls, turn, lastAction });
            }
        },

        render() {
            render();
        },

        onData(payload) {
            if (!payload || typeof payload.kind !== 'string') return;
            if (payload.kind === 'sync') {
                p1 = payload.p1;
                p2 = payload.p2;
                hWalls = payload.hWalls;
                vWalls = payload.vWalls;
                turn = payload.turn;
                lastAction = payload.lastAction;
                render();
                resolveEnd();
                setStatusLine();
            } else if (payload.kind === 'move') {
                if (payload.action === 'pawn') applyPawnMove(payload.r, payload.c);
                else if (payload.action === 'wall') applyWallPlacement(payload.wallType, payload.r, payload.c);
                sndNotify();
                render();
                resolveEnd();
                setStatusLine();
                if (typeof updateActionButtons === 'function') updateActionButtons();
            }
        },

        doLocalTakeback() {
            if (history.length === 0) return;
            const prev = history.pop();
            p1 = prev.p1;
            p2 = prev.p2;
            hWalls = prev.hWalls;
            vWalls = prev.vWalls;
            turn = prev.turn;
            lastAction = prev.lastAction;
            gameEnded = false;
            if (localMode) {
                myColor = turn;
                if (typeof updateAvatars === 'function') updateAvatars();
            }
            render();
            setStatusLine();
            if (typeof updateActionButtons === 'function') updateActionButtons();
        },

        statusText() {
            if (gameEnded) return '';
            const curPlayerName = turn === 'w' ? (localMode ? 'Player 1' : (myColor === 'w' ? 'Your' : oppName + '\u2019s')) : (localMode ? 'Player 2' : (myColor === 'b' ? 'Your' : oppName + '\u2019s'));
            const p1Dist = p1.r;
            const p2Dist = 8 - p2.r;
            const distInfo = ` · Goal: P1 ${p1Dist} sq / P2 ${p2Dist} sq`;
            if (localMode) {
                return `${curPlayerName}'s turn${distInfo}`;
            }
            return canIPlay() ? `Your turn${distInfo}` : `${oppName}\u2019s turn${distInfo}`;
        },

        canTakeback() {
            return history.length > 0 && !gameEnded;
        }
    };
})();
