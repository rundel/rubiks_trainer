globalThis.CubeModel = require('../js/cube.js');
const C = globalThis.CubeModel;
const SC = require('../js/scanner.js');
const RGB = { W: [200, 205, 210], Y: [200, 190, 50], G: [20, 140, 70], B: [20, 60, 150], R: [160, 20, 30], O: [215, 90, 25] };
let bad = 0, N = 400, repaired = 0;
for (let t = 0; t < N; t++) {
  const truth = C.applyMoves(C.solvedState(), C.randomScramble(25));
  const warm = [1 + Math.random() * 0.15, 1, 1 - Math.random() * 0.15];
  const bright = 0.7 + Math.random() * 0.4;
  const faces = {};
  C.FACES.forEach((f, fi) => {
    faces[f] = truth.slice(fi * 9, fi * 9 + 9).map((c) => {
      const rgb = RGB[c].map((v, k) => Math.max(0, Math.min(255, v * warm[k] * bright * (0.88 + Math.random() * 0.24) + (Math.random() - 0.5) * 20)));
      return SC.rgbToLab(rgb);
    });
  });
  const s = SC.classify(faces);
  if (s.join('') !== truth.join('')) bad++;
  // simulate scanning left/right swapped and top turned
  const fc = {}; C.FACES.forEach((f, fi) => fc[f] = truth.slice(fi * 9, fi * 9 + 9));
  const broken = Object.assign({}, fc, { R: fc.L, L: fc.R, U: C.rotateFaceGrid(fc.U, 1) });
  const r = SC.repair(broken);
  if (r && r.state.join('') === truth.join('')) repaired++;
}
console.log(`misclassified cubes ${bad}/${N}; repaired ${repaired}/${N}`);
