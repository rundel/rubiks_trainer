// Every side held any way up, plus a red/orange misread, with a blue camera tint.
globalThis.CubeModel = require('../js/cube.js');
const C = globalThis.CubeModel;
const SC = require('../js/scanner.js');
const RGB = { W: [205, 205, 200], Y: [205, 190, 45], G: [25, 140, 75], B: [25, 65, 150], R: [190, 38, 35], O: [212, 70, 30] };
let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const N = +process.argv[2] || 200;
let ok = 0;
const t0 = Date.now();
for (let t = 0; t < N; t++) {
  const truth = C.applyMoves(C.solvedState(), C.randomScramble(25));
  const faces = {};
  C.FACES.forEach((f, fi) => {
    const wb = [0.75 * (1 + (rand() - 0.5) * 0.3), 0.88, 1.3 * (1 + (rand() - 0.5) * 0.3)];
    const cells = truth.slice(fi * 9, fi * 9 + 9).map((c) => RGB[c].map((v, k) => Math.max(0, Math.min(255, v * wb[k] * (0.85 + rand() * 0.25) + (rand() - 0.5) * 14))));
    // The center stays put when a side is turned, so turning is safe to simulate for every side.
    faces[f] = C.rotateFaceGrid(cells, Math.floor(rand() * 4));
  });
  const out = SC.classifyScan(faces);
  // Compare up to each side's rotation by checking against all rotations of the truth.
  if (out.final && C.validate(out.final).ok) {
    const same = C.FACES.every((f, fi) => [0, 1, 2, 3].some((k) => C.rotateFaceGrid(truth.slice(fi * 9, fi * 9 + 9), k).join('') === out.final.slice(fi * 9, fi * 9 + 9).join('')));
    if (same) ok++;
  }
}
console.log(`any-way-up scans with blue tint: ${ok}/${N} correct, ${((Date.now() - t0) / N).toFixed(0)} ms per scan`);
