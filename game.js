// game.js — UI, drag-and-drop, panning, hints, keyboard input

let currentPuzzle = null;
let tileElements = {};
let activeDrag = null;
let panState = null;
let panOffset = { x: 20, y: 20 };
let hintsUsed = 0;
let selectedCell = null; // { key, el, wordId, direction, cellData }
let suppressWin = false;

// ─── Init ──────────────────────────────────────────────────────────────────

function loadGame() {
  PuzzleGenerator.init(WORD_DATA.words);
  initBrandColor();
  initBgCycler();
  buildHintButton();
  setupPanning();
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('click', (e) => {
    if (selectedCell && !e.target.closest('#grid-panel')) deselectCell();
  });
  newPuzzle();
}

// ─── Background cycler ──────────────────────────────────────────────────────

const BG_OPTIONS = [null, 'assets/bg1.png', 'assets/bg2.png', 'assets/bg3.png', 'assets/bg4.png'];
const BG_LABELS  = ['Off', 'BG 1', 'BG 2', 'BG 3', 'BG 4'];

function initBgCycler() {
  const btn = document.getElementById('bg-cycle-btn');
  const img = document.getElementById('bg-img');
  if (!btn || !img) return;

  const savedIdx = parseInt(localStorage.getItem('crossword-bg') || '4', 10);
  applyBg(savedIdx, btn, img);

  btn.addEventListener('click', () => {
    const next = (parseInt(btn.dataset.bgIdx, 10) + 1) % BG_OPTIONS.length;
    applyBg(next, btn, img);
    localStorage.setItem('crossword-bg', next);
  });
}

function applyBg(idx, btn, img) {
  btn.dataset.bgIdx = idx;
  btn.textContent = 'BG: ' + BG_LABELS[idx];
  const src = BG_OPTIONS[idx];
  if (src) {
    img.src = src;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.src = '';
  }
}

// ─── Brand color ────────────────────────────────────────────────────────────

function initBrandColor() {
  const param = new URLSearchParams(location.search).get('brand');
  const raw = param
    ? '#' + param.replace('#', '')
    : (typeof window.BRAND_COLOR === 'string' ? window.BRAND_COLOR : null);
  if (raw && /^#[0-9a-fA-F]{6}$/.test(raw)) applyBrandColor(raw);
}

function applyBrandColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', hex);
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.18)`);
  root.style.setProperty('--cell-drop', `rgba(${r}, ${g}, ${b}, 0.12)`);
}

function newPuzzle() {
  deselectCell();
  suppressWin = false;
  hideSolvePrompt();
  currentPuzzle = PuzzleGenerator.generate([], 'hard');
  if (!currentPuzzle) {
    document.getElementById('grid-container').innerHTML =
      '<p class="error">Could not generate a puzzle. Try adjusting your topic or difficulty settings.</p>';
    return;
  }
  hintsUsed = 0;
  updateHintButton();
  panOffset = { x: 20, y: 20 }; // reset pan
  renderPuzzle();
  // Center puzzle after render (needs a frame for layout to settle)
  requestAnimationFrame(centerPuzzle);
}



// ─── Hint button ────────────────────────────────────────────────────────────

function buildHintButton() {
  const btn = document.getElementById('hint-btn');
  btn.addEventListener('click', revealLetter);
}

function updateHintButton() {
  const btn = document.getElementById('hint-btn');
  if (btn) btn.textContent = `Reveal a letter${hintsUsed > 0 ? ' (' + hintsUsed + ')' : ''}`;
}

function revealLetter() {
  if (!currentPuzzle) return;
  const { words, grid } = currentPuzzle;

  // Collect all unfilled, unlocked letter cells
  const unfilled = [];
  for (const row of grid) {
    for (const cell of row) {
      if (cell.type === 'letter' && !cell.locked && !cell.placedLetter) {
        unfilled.push(cell);
      }
    }
  }
  if (!unfilled.length) return;

  const cell = unfilled[Math.floor(Math.random() * unfilled.length)];
  const letter = cell.expectedLetter;

  // Find a matching tile in the bank and use it
  const matchingTile = Object.values(tileElements).find(
    el => el.dataset.letter === letter && !el.classList.contains('placed')
  );
  if (!matchingTile) return; // No matching tile available (shouldn't happen)

  const cellKey = `${cell.row},${cell.col}`;
  const cellEl = document.querySelector(`.letter-cell[data-key="${cellKey}"]`);
  if (!cellEl) return;

  placeTile(matchingTile.dataset.tileId, letter, cellEl, cell);
  hintsUsed++;
  updateHintButton();
}

// ─── Panning ────────────────────────────────────────────────────────────────

function setupPanning() {
  const panel = document.getElementById('grid-panel');

  panel.addEventListener('pointerdown', (e) => {
    if (activeDrag) return;
    if (e.target.closest('.tile, .bank-tile, .letter-cell')) return;
    panState = { startX: e.clientX - panOffset.x, startY: e.clientY - panOffset.y };
    panel.setPointerCapture(e.pointerId);
    panel.style.cursor = 'grabbing';
  });

  panel.addEventListener('pointermove', (e) => {
    if (!panState || activeDrag) return;
    panOffset.x = e.clientX - panState.startX;
    panOffset.y = e.clientY - panState.startY;
    updateGridTransform();
  });

  panel.addEventListener('pointerup', () => {
    panState = null;
    panel.style.cursor = '';
  });

  panel.addEventListener('pointercancel', () => {
    panState = null;
    panel.style.cursor = '';
  });
}

function updateGridTransform() {
  const grid = document.querySelector('.crossword-grid');
  if (grid) grid.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px)`;
}

function centerPuzzle() {
  const panel = document.getElementById('grid-panel');
  const grid = document.querySelector('.crossword-grid');
  if (!grid || !panel) return;

  const panelW = panel.clientWidth;
  const panelH = panel.clientHeight;
  const CELL = 55; // cell-size + gap
  const cols = currentPuzzle.grid[0].length;
  const rows = currentPuzzle.grid.length;
  const gridW = cols * CELL - 3;
  const gridH = rows * CELL - 3;

  panOffset.x = Math.max(16, (panelW - gridW) / 2);
  panOffset.y = Math.max(16, (panelH - gridH) / 2);
  updateGridTransform();
}

// ─── Rendering ─────────────────────────────────────────────────────────────

function renderPuzzle() {
  hideWin();
  renderGrid();
  renderClues();
  renderBank();
}

function renderGrid() {
  const container = document.getElementById('grid-container');
  container.innerHTML = '';

  const { grid } = currentPuzzle;
  const rows = grid.length;
  const cols = grid[0].length;

  const gridDiv = document.createElement('div');
  gridDiv.className = 'crossword-grid';
  gridDiv.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  gridDiv.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;

  // Only render letter cells; empty grid areas stay transparent
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.type !== 'letter') continue;

      const el = document.createElement('div');
      el.className = 'cell letter-cell';
      el.style.gridColumn = c + 1;
      el.style.gridRow = r + 1;
      el.dataset.key = `${r},${c}`;

      if (cell.clueNum) {
        const num = document.createElement('span');
        num.className = 'clue-num';
        num.textContent = cell.clueNum;
        el.appendChild(num);
      }

      const slot = document.createElement('span');
      slot.className = 'letter-slot';
      el.appendChild(slot);

      container.appendChild(el); // NOTE: cells go directly in container, not gridDiv
    }
  }

  // The gridDiv sets the coordinate space; cells are children of container
  // Actually: let's put cells inside gridDiv so the grid template applies
  // We need to redo this: cells go INTO gridDiv

  // Clear and rebuild properly
  container.innerHTML = '';
  container.appendChild(gridDiv);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (cell.type !== 'letter') continue;

      const el = document.createElement('div');
      el.className = 'cell letter-cell';
      el.style.gridColumn = c + 1;
      el.style.gridRow = r + 1;
      el.dataset.key = `${r},${c}`;

      if (cell.clueNum) {
        const num = document.createElement('span');
        num.className = 'clue-num';
        num.textContent = cell.clueNum;
        el.appendChild(num);
      }

      const slot = document.createElement('span');
      slot.className = 'letter-slot';
      el.appendChild(slot);

      el.addEventListener('click', (e) => { e.stopPropagation(); onCellClick(el); });
      gridDiv.appendChild(el);
    }
  }

  // Apply pan transform
  updateGridTransform();
}

function renderClues() {
  const panel = document.getElementById('clue-panel');
  const { words } = currentPuzzle;

  const across = words.filter(w => w.direction === 'H').sort((a, b) => a.clueNum - b.clueNum);
  const down   = words.filter(w => w.direction === 'V').sort((a, b) => a.clueNum - b.clueNum);

  panel.innerHTML = '';

  function section(title, list) {
    if (!list.length) return;
    const h = document.createElement('h3');
    h.textContent = title;
    panel.appendChild(h);
    for (const w of list) {
      const p = document.createElement('p');
      p.className = 'clue-entry';
      p.innerHTML = `<span class="clue-number">${w.clueNum}.</span> ${w.hint}`;
      p.dataset.wordId = w.id;
      panel.appendChild(p);
    }
  }

  section('Across', across);
  section('Down', down);
}

function renderBank() {
  const bank = document.getElementById('tile-bank');
  bank.innerHTML = '';
  tileElements = {};

  const tiles = [];
  for (const w of currentPuzzle.words) {
    for (let i = 0; i < w.word.length; i++) {
      tiles.push({ id: `t-${w.id}-${i}`, letter: w.word[i] });
    }
  }

  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  for (const { id, letter } of tiles) {
    const el = makeBankTile(id, letter);
    bank.appendChild(el);
    tileElements[id] = el;
  }
}

function makeBankTile(id, letter) {
  const el = document.createElement('div');
  el.className = 'tile bank-tile';
  el.id = id;
  el.textContent = letter;
  el.dataset.letter = letter;
  el.dataset.tileId = id;
  el.addEventListener('pointerdown', onTilePointerDown);
  return el;
}

// ─── Drag core ─────────────────────────────────────────────────────────────

function setupDrag(e, letter, tileId, tileEl) {
  e.preventDefault();
  e.stopPropagation(); // Prevent pan from starting on tile drag

  const ghost = document.createElement('div');
  ghost.className = 'tile ghost-tile';
  ghost.textContent = letter;
  const HALF = 22;
  ghost.style.left = (e.clientX - HALF) + 'px';
  ghost.style.top  = (e.clientY - HALF) + 'px';
  document.body.appendChild(ghost);

  if (tileEl) tileEl.classList.add('dragging');

  activeDrag = { tileId, letter, element: tileEl, ghost, placed: false };

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
}

function onTilePointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const el = e.currentTarget;
  setupDrag(e, el.dataset.letter, el.dataset.tileId, el);
}

function onPointerMove(e) {
  if (!activeDrag) return;
  const HALF = 22;
  activeDrag.ghost.style.left = (e.clientX - HALF) + 'px';
  activeDrag.ghost.style.top  = (e.clientY - HALF) + 'px';

  // Highlight hovered cell
  activeDrag.ghost.style.pointerEvents = 'none';
  const target = document.elementFromPoint(e.clientX, e.clientY);
  activeDrag.ghost.style.pointerEvents = '';

  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
  const cellEl = target?.closest('.letter-cell');
  if (cellEl) {
    const [r, c] = cellEl.dataset.key.split(',').map(Number);
    const cell = currentPuzzle.grid[r][c];
    if (!cell.locked && !cell.placedLetter) cellEl.classList.add('drop-target');
  }
}

function onPointerUp(e) {
  if (!activeDrag) return;
  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));

  activeDrag.ghost.style.display = 'none';
  const target = document.elementFromPoint(e.clientX, e.clientY);
  activeDrag.ghost.style.display = '';

  const cellEl = target?.closest('.letter-cell');
  if (cellEl) {
    const [r, c] = cellEl.dataset.key.split(',').map(Number);
    const cell = currentPuzzle.grid[r][c];
    if (!cell.locked && !cell.placedLetter) {
      placeTile(activeDrag.tileId, activeDrag.letter, cellEl, cell);
    }
  }

  // If the tile wasn't placed (still in tileElements), make it visible in the bank
  const unplacedTile = tileElements[activeDrag.tileId];
  if (unplacedTile) {
    unplacedTile.style.visibility = '';
    unplacedTile.classList.remove('dragging');
  }

  activeDrag.ghost.remove();
  activeDrag = null;
}

// ─── Tile Placement ─────────────────────────────────────────────────────────

function placeTile(tileId, letter, cellEl, cell) {
  const tileEl = tileElements[tileId];
  if (tileEl) tileEl.remove();
  delete tileElements[tileId];

  cell.placedLetter = letter;
  cell.placedTileId = tileId;

  cellEl.classList.add('filled');
  const slot = cellEl.querySelector('.letter-slot');
  if (slot) slot.textContent = letter;

  cellEl.addEventListener('pointerdown', onPlacedCellPointerDown);

  checkWords(cell.wordIds);
}

function returnTileFromCell(cellEl, cell) {
  const letter = cell.placedLetter;
  const oldId = cell.placedTileId;

  cell.placedLetter = null;
  cell.placedTileId = null;
  cellEl.classList.remove('filled');
  const slot = cellEl.querySelector('.letter-slot');
  if (slot) slot.textContent = '';
  cellEl.removeEventListener('pointerdown', onPlacedCellPointerDown);

  const newId = oldId + '-r' + Date.now();
  const newTile = makeBankTile(newId, letter);
  document.getElementById('tile-bank').appendChild(newTile);
  tileElements[newId] = newTile;
  return { newId, newTile };
}

function onPlacedCellPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return;
  const cellEl = e.currentTarget;
  const [r, c] = cellEl.dataset.key.split(',').map(Number);
  const cell = currentPuzzle.grid[r][c];
  if (cell.locked || !cell.placedLetter) return;

  const { newId, newTile } = returnTileFromCell(cellEl, cell);
  newTile.style.visibility = 'hidden'; // tile is visually represented by the ghost
  setupDrag(e, newTile.dataset.letter, newId, newTile);
}

// ─── Keyboard input ─────────────────────────────────────────────────────────

function onCellClick(cellEl) {
  if (!currentPuzzle) return;
  const [r, c] = cellEl.dataset.key.split(',').map(Number);
  const cell = currentPuzzle.grid[r][c];
  if (cell.locked) return;

  if (selectedCell && selectedCell.key === cellEl.dataset.key) {
    // Re-click same cell: cycle direction at intersections
    if (cell.wordIds.length > 1) {
      const otherId = cell.wordIds.find(id => id !== selectedCell.wordId);
      if (otherId !== undefined) {
        selectedCell.wordId = otherId;
        selectedCell.direction = currentPuzzle.words[otherId].direction;
      }
    }
    return;
  }

  deselectCell();
  selectCell(cellEl, cell);
}

function selectCell(cellEl, cell, preferWordId = null) {
  let wordId;
  if (preferWordId !== null && cell.wordIds.includes(preferWordId)) {
    wordId = preferWordId;
  } else if (cell.wordIds.length === 1) {
    wordId = cell.wordIds[0];
  } else {
    const hId = cell.wordIds.find(id => currentPuzzle.words[id].direction === 'H');
    wordId = hId !== undefined ? hId : cell.wordIds[0];
  }
  const direction = currentPuzzle.words[wordId].direction;
  cellEl.classList.add('keyboard-focus');
  selectedCell = { key: cellEl.dataset.key, el: cellEl, wordId, direction, cellData: cell };
}

function deselectCell() {
  if (!selectedCell) return;
  selectedCell.el.classList.remove('keyboard-focus');
  selectedCell = null;
}

function getWordCells(word) {
  return Array.from({ length: word.word.length }, (_, k) => {
    const r = word.direction === 'H' ? word.startRow : word.startRow + k;
    const c = word.direction === 'H' ? word.startCol + k : word.startCol;
    return { key: `${r},${c}`, cell: currentPuzzle.grid[r][c] };
  });
}

function advanceSelection() {
  if (!selectedCell) return;
  const { wordId } = selectedCell;
  const word = currentPuzzle.words[wordId];
  const cells = getWordCells(word);
  const idx = cells.findIndex(c => c.key === selectedCell.key);

  for (let i = idx + 1; i < cells.length; i++) {
    const { key, cell } = cells[i];
    if (!cell.locked && !cell.placedLetter) {
      const el = document.querySelector(`.letter-cell[data-key="${key}"]`);
      if (el) { deselectCell(); selectCell(el, cell, wordId); return; }
    }
  }
  deselectCell();
}

function retreatSelection() {
  if (!selectedCell) return;
  const { wordId } = selectedCell;
  const word = currentPuzzle.words[wordId];
  const cells = getWordCells(word);
  const idx = cells.findIndex(c => c.key === selectedCell.key);

  if (idx > 0) {
    const { key, cell } = cells[idx - 1];
    const el = document.querySelector(`.letter-cell[data-key="${key}"]`);
    if (el) { deselectCell(); selectCell(el, cell, wordId); }
  }
}

function handleKeyType(key) {
  if (!selectedCell) return;
  const letter = key.toUpperCase();
  const { el: cellEl, cellData: cell } = selectedCell;
  if (cell.locked) { advanceSelection(); return; }

  const tileEl = Object.values(tileElements).find(t => t.dataset.letter === letter);
  if (!tileEl) return;

  if (cell.placedLetter) returnTileFromCell(cellEl, cell);
  placeTile(tileEl.dataset.tileId, letter, cellEl, cell);
  advanceSelection();
}

function handleBackspace() {
  if (!selectedCell) return;
  const { el: cellEl, cellData: cell } = selectedCell;
  if (cell.locked) { retreatSelection(); return; }

  if (cell.placedLetter) {
    returnTileFromCell(cellEl, cell);
  } else {
    retreatSelection();
  }
}

function onKeyDown(e) {
  if (!selectedCell) return;
  if (e.key === 'Escape') { deselectCell(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(); return; }
  if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
    e.preventDefault();
    handleKeyType(e.key);
  }
}

// ─── Word Checking ──────────────────────────────────────────────────────────

function checkWords(wordIds) {
  const { words, grid } = currentPuzzle;

  for (const wid of wordIds) {
    const word = words[wid];
    if (word.locked) continue;

    const cells = [];
    for (let k = 0; k < word.word.length; k++) {
      const r = word.direction === 'H' ? word.startRow : word.startRow + k;
      const c = word.direction === 'H' ? word.startCol + k : word.startCol;
      cells.push({ cell: grid[r][c], row: r, col: c, k });
    }

    if (!cells.every(({ cell }) => cell.placedLetter)) continue;
    if (!cells.every(({ cell, k }) => cell.placedLetter === word.word[k])) continue;

    word.locked = true;
    for (const { cell, row, col } of cells) {
      cell.locked = true;
      const cellEl = document.querySelector(`.letter-cell[data-key="${row},${col}"]`);
      if (cellEl) {
        cellEl.classList.remove('filled', 'drop-target');
        cellEl.classList.add('locked');
        cellEl.removeEventListener('pointerdown', onPlacedCellPointerDown);
        if (selectedCell && selectedCell.key === `${row},${col}`) deselectCell();
      }
    }

    const clueEl = document.querySelector(`.clue-entry[data-word-id="${wid}"]`);
    if (clueEl) clueEl.classList.add('solved');

    if (words.every(w => w.locked) && !suppressWin) {
      setTimeout(showWin, 450);
    }
  }
}

// ─── Win State ──────────────────────────────────────────────────────────────

function showWin() {
  const overlay = document.getElementById('win-overlay');
  const sub = document.getElementById('win-sub');
  if (sub) sub.textContent = hintsUsed === 0
    ? 'All words decoded. The network is secure.'
    : `All words decoded — with ${hintsUsed} hint${hintsUsed > 1 ? 's' : ''}.`;
  overlay.classList.remove('hidden');
}

function hideWin() {
  document.getElementById('win-overlay').classList.add('hidden');
}

// ─── Solution / Debrief ─────────────────────────────────────────────────────

function solveAll() {
  suppressWin = true;
  deselectCell();
  const { grid } = currentPuzzle;

  for (const row of grid) {
    for (const cell of row) {
      if (cell.type !== 'letter' || cell.locked || cell.placedLetter) continue;
      const letter = cell.expectedLetter;
      const tileEl = Object.values(tileElements).find(t => t.dataset.letter === letter);
      if (!tileEl) continue;
      const cellEl = document.querySelector(`.letter-cell[data-key="${cell.row},${cell.col}"]`);
      if (cellEl) placeTile(tileEl.dataset.tileId, letter, cellEl, cell);
    }
  }

  document.getElementById('solve-prompt').classList.remove('hidden');
}

function showDebrief() {
  hideWin();
  const { words } = currentPuzzle;
  const container = document.getElementById('debrief-words');
  container.innerHTML = '';

  for (const word of words) {
    const wordData = WORD_DATA.words.find(w => w.word === word.word);
    const div = document.createElement('div');
    div.className = 'debrief-word';

    const label = document.createElement('div');
    label.className = 'debrief-word-label';
    label.textContent = word.word;
    div.appendChild(label);

    const def = document.createElement('div');
    def.className = 'debrief-word-def';
    def.textContent = wordData?.definition ?? wordData?.hint ?? '';
    div.appendChild(def);

    container.appendChild(div);
  }

  document.getElementById('debrief-overlay').classList.remove('hidden');
}

function hideDebrief() {
  document.getElementById('debrief-overlay').classList.add('hidden');
}

function hideSolvePrompt() {
  document.getElementById('solve-prompt').classList.add('hidden');
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('learn-btn').addEventListener('click', showDebrief);
  document.getElementById('play-again-btn').addEventListener('click', () => { hideDebrief(); newPuzzle(); });
  document.getElementById('solve-btn').addEventListener('click', solveAll);
  document.getElementById('tell-more-btn').addEventListener('click', () => { hideSolvePrompt(); showDebrief(); });
  loadGame();
});
