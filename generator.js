// generator.js — Puzzle generation engine (fully-connected layouts only)

const PuzzleGenerator = (() => {
  let library = [];
  let ixIndex = {}; // ixIndex[wordA][wordB] = [{ai: pos_in_A, bi: pos_in_B}]

  // Build intersection index at load time
  function buildIndex(words) {
    const idx = {};
    for (const a of words) {
      idx[a.word] = {};
      for (const b of words) {
        if (a.word === b.word) continue;
        const pairs = [];
        for (let i = 0; i < a.word.length; i++) {
          for (let j = 0; j < b.word.length; j++) {
            if (a.word[i] === b.word[j]) pairs.push({ ai: i, bi: j });
          }
        }
        if (pairs.length) idx[a.word][b.word] = pairs;
      }
    }
    return idx;
  }

  function init(words) {
    library = words;
    ixIndex = buildIndex(words);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pickThree(full, preferred) {
    const chosen = [];
    const used = new Set();
    if (preferred.length > 0) {
      const p = preferred[Math.floor(Math.random() * preferred.length)];
      chosen.push(p); used.add(p.word);
    }
    const remaining = shuffle(full.filter(w => !used.has(w.word)));
    for (const w of remaining) {
      if (chosen.length >= 3) break;
      chosen.push(w); used.add(w.word);
    }
    return chosen.length === 3 ? chosen : null;
  }

  // Try to build a fully-connected 3-word layout.
  //
  // wM is the "middle" word (intersects both wA and wB).
  // mDir determines wM's orientation ('V' or 'H').
  //   If 'V': wM is vertical, wA and wB are horizontal.
  //   If 'H': wM is horizontal, wA and wB are vertical.
  //
  // Layout guarantee (no conflict checking needed):
  //   When mDir='V': wA and wB are in different rows (ixA.ai ≠ ixB.ai),
  //   so they can never share a cell. M's column is shared only at the
  //   two intersection cells, which are validated by the index.
  //   Symmetric argument holds for mDir='H'.
  function tryConnected(wM, wA, wB, mDir) {
    const ixMA = ixIndex[wM.word]?.[wA.word];
    const ixMB = ixIndex[wM.word]?.[wB.word];
    if (!ixMA?.length || !ixMB?.length) return null;

    // Shuffle for layout variety
    const pairsA = shuffle([...ixMA]);
    const pairsB = shuffle([...ixMB]);

    for (const ixA of pairsA) {
      for (const ixB of pairsB) {
        if (Math.abs(ixA.ai - ixB.ai) <= 1) continue; // adjacent or same position — rows/cols would touch

        const cells = {};
        let ok = true;

        function placeWord(word, startRow, startCol, dir, wordId) {
          for (let k = 0; k < word.word.length; k++) {
            const r = dir === 'H' ? startRow : startRow + k;
            const c = dir === 'H' ? startCol + k : startCol;
            const key = `${r},${c}`;
            const letter = word.word[k];
            if (cells[key]) {
              if (cells[key].expectedLetter !== letter) { ok = false; return; }
              cells[key].wordIds.push(wordId);
              cells[key].letterIndices.push(k);
            } else {
              cells[key] = {
                row: r, col: c, type: 'letter',
                wordIds: [wordId], letterIndices: [k],
                expectedLetter: letter, placedLetter: null,
                locked: false, clueNum: null,
              };
            }
          }
        }

        if (mDir === 'V') {
          // M vertical at col=0; A horizontal at row=ixA.ai; B horizontal at row=ixB.ai
          placeWord(wM, 0,       0,         'V', 0);
          placeWord(wA, ixA.ai, -ixA.bi,   'H', 1);
          if (ok) placeWord(wB, ixB.ai, -ixB.bi, 'H', 2);
        } else {
          // M horizontal at row=0; A vertical at col=ixA.ai; B vertical at col=ixB.ai
          placeWord(wM,  0,        0,        'H', 0);
          placeWord(wA, -ixA.bi,  ixA.ai,   'V', 1);
          if (ok) placeWord(wB, -ixB.bi, ixB.ai, 'V', 2);
        }

        if (!ok) continue;

        const placements = mDir === 'V'
          ? [
              { wordIndex: 0, direction: 'V', startRow: 0,      startCol: 0 },
              { wordIndex: 1, direction: 'H', startRow: ixA.ai, startCol: -ixA.bi },
              { wordIndex: 2, direction: 'H', startRow: ixB.ai, startCol: -ixB.bi },
            ]
          : [
              { wordIndex: 0, direction: 'H', startRow: 0,       startCol: 0 },
              { wordIndex: 1, direction: 'V', startRow: -ixA.bi, startCol: ixA.ai },
              { wordIndex: 2, direction: 'V', startRow: -ixB.bi, startCol: ixB.ai },
            ];

        return buildLayout(cells, placements);
      }
    }
    return null;
  }

  function buildLayout(cellMap, placements) {
    const allCells = Object.values(cellMap);
    const minRow = Math.min(...allCells.map(c => c.row));
    const minCol = Math.min(...allCells.map(c => c.col));

    // Normalize so top-left of bounding box is (0, 0)
    const norm = {};
    for (const cell of allCells) {
      const r = cell.row - minRow;
      const c = cell.col - minCol;
      norm[`${r},${c}`] = { ...cell, row: r, col: c };
    }

    const normPlacements = placements.map(p => ({
      ...p,
      startRow: p.startRow - minRow,
      startCol: p.startCol - minCol,
    }));

    const maxRow = Math.max(...Object.values(norm).map(c => c.row));
    const maxCol = Math.max(...Object.values(norm).map(c => c.col));

    // Build 2D grid array for easy (row, col) lookup
    const grid = [];
    for (let r = 0; r <= maxRow; r++) {
      grid[r] = [];
      for (let c = 0; c <= maxCol; c++) {
        grid[r][c] = norm[`${r},${c}`] || { row: r, col: c, type: 'blank' };
      }
    }

    // Assign clue numbers: scan left-to-right, top-to-bottom
    let clueNum = 1;
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const cell = grid[r][c];
        if (cell.type !== 'letter') continue;
        const startsWord = cell.wordIds.some(id => {
          const p = normPlacements[id];
          return r === p.startRow && c === p.startCol;
        });
        if (startsWord) cell.clueNum = clueNum++;
      }
    }

    return { grid, placements: normPlacements };
  }

  function generate(selectedTopics = [], difficulty = 'easy') {
    if (library.length < 3) return null;

    // Difficulty maps to word pool size
    let full;
    if (difficulty === 'easy')   full = library.filter(w => w.difficulty === 'easy');
    else if (difficulty === 'medium') full = library.filter(w => w.difficulty === 'easy' || w.difficulty === 'medium');
    else full = [...library]; // 'hard' = all words

    if (full.length < 3) return null;

    const preferred = selectedTopics.length > 0
      ? full.filter(w => w.topics.some(t => selectedTopics.includes(t)))
      : [];

    const mDirs = ['V', 'H'];

    for (let attempt = 0; attempt < 400; attempt++) {
      const three = pickThree(full, preferred);
      if (!three) break;

      // Try each word as the "middle" word, in both orientations
      for (let mIdx = 0; mIdx < 3; mIdx++) {
        const wM = three[mIdx];
        const wA = three[(mIdx + 1) % 3];
        const wB = three[(mIdx + 2) % 3];

        for (const mDir of mDirs) {
          const layout = tryConnected(wM, wA, wB, mDir);
          if (!layout) continue;

          const wordOrder = [wM, wA, wB];
          const words = wordOrder.map((w, i) => ({
            id: i,
            word: w.word, hint: w.hint,
            topics: w.topics, difficulty: w.difficulty,
            direction: layout.placements[i].direction,
            startRow: layout.placements[i].startRow,
            startCol: layout.placements[i].startCol,
            locked: false,
            clueNum: null,
          }));

          // Attach clue numbers from grid
          for (const w of words) {
            const cell = layout.grid[w.startRow]?.[w.startCol];
            w.clueNum = cell?.clueNum ?? null;
          }

          return { words, grid: layout.grid };
        }
      }
    }

    // Fallback: relax topic filter, then difficulty
    if (selectedTopics.length > 0) return generate([], difficulty);
    if (difficulty !== 'hard') return generate([], 'hard');
    return null;
  }

  function getTopics() {
    const topics = new Set();
    for (const w of library) for (const t of w.topics) topics.add(t);
    return [...topics].sort();
  }

  return { init, generate, getTopics };
})();
