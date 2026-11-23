// Auto-repair: any side scanned turned, plus left/right swapped.
globalThis.CubeModel = require('../js/cube.js');
const C = globalThis.CubeModel;
const SC = require('../js/scanner.js');
let ok = 0, wrong = 0, none = 0, slow = 0;
const N = +process.argv[2] || 300;
for (let t = 0; t < N; t++) {
  const truth = C.applyMoves(C.solvedState(), C.randomScramble(25));
  const fc = {};
  C.FACES.forEach((f, i) => { fc[f] = truth.slice(i * 9, i * 9 + 9); });
  // Turn one or two random sides, sometimes swap left and right.
  const faces = C.FACES.slice().sort(() => Math.random() - 0.5).slice(0, 1 + (t % 2));
  faces.forEach((f) => { fc[f] = C.rotateFaceGrid(fc[f], 1 + Math.floor(Math.random() * 3)); });
  if (t % 5 === 0) [fc.R, fc.L] = [fc.L, fc.R];
  const t0 = Date.now();
  const r = SC.repair(fc);
  if (Date.now() - t0 > 500) slow++;
  if (!r) none++;
  else if (r.state.join('') === truth.join('')) ok++;
  else wrong++;
}
console.log(`repaired correctly ${ok}/${N}, repaired to a different valid cube ${wrong}, not repaired ${none}, slow (>0.5s) ${slow}`);
