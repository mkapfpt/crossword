// Quick smoke test - run with: node test.js
const fs = require('fs');
// Use Function constructor so const at top-level becomes accessible via return
const src = fs.readFileSync('words.js', 'utf8') + '\n' +
            fs.readFileSync('generator.js', 'utf8');
const combined = new Function(src + '\nreturn { PuzzleGenerator, WORD_DATA };');
const { PuzzleGenerator, WORD_DATA } = combined();

PuzzleGenerator.init(WORD_DATA.words);
console.log('Library size:', WORD_DATA.words.length, 'words');
console.log('Topics:', PuzzleGenerator.getTopics().join(', '));
console.log('');

let successes = 0, failures = 0;
for (let i = 0; i < 50; i++) {
  const p = PuzzleGenerator.generate();
  if (p) {
    successes++;
    if (i === 0) {
      console.log('Sample puzzle:');
      for (const w of p.words) {
        console.log(` [${w.clueNum}] ${w.direction === 'H' ? 'Across' : 'Down'}: ${w.word} — ${w.hint}`);
      }
      console.log('Grid:', p.grid.length + ' rows × ' + p.grid[0].length + ' cols');
      const letterCells = p.grid.flat().filter(c => c.type === 'letter');
      console.log('Letter cells:', letterCells.length, '  Intersections:', letterCells.filter(c => c.wordIds.length > 1).length);
    }
  } else {
    failures++;
  }
}
console.log('');
console.log(`50 random puzzles: ${successes} succeeded, ${failures} failed`);

// Topic-filtered test
const topicPuzzle = PuzzleGenerator.generate(['phishing']);
console.log('Topic-filtered (phishing):', topicPuzzle
  ? topicPuzzle.words.map(w => w.word).join(', ')
  : 'FAILED');
