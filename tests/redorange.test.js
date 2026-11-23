// Harsh simulation: per-side auto white balance drift, close red/orange, shading, and glare.
globalThis.CubeModel = require('../js/cube.js');
const C = globalThis.CubeModel;
const SC = require('../js/scanner.js');
const RGB = { W: [205, 205, 200], Y: [205, 190, 45], G: [25, 140, 75], B: [25, 65, 150], R: [190, 38, 35], O: [220, 82, 30] };
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function simulate(truth, rand) {
  const faces = {};
  C.FACES.forEach((f, fi) => {
    const cast = process.env.CAST ? [0.75, 0.88, 1.3] : [1, 1, 1];
    const wb = [cast[0] * (1 + (rand() - 0.5) * 0.24), cast[1], cast[2] * (1 + (rand() - 0.5) * 0.24)];
    const expo = 0.75 + rand() * 0.45;
    faces[f] = truth.slice(fi * 9, fi * 9 + 9).map((c) => {
      const shade = 0.85 + rand() * 0.25;
      return RGB[c].map((v, k) => clamp(v * wb[k] * expo * shade + (rand() - 0.5) * 14));
    });
  });
  return faces;
}
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const N = +process.argv[2] || 400;
let wrongRaw = 0, wrongFinal = 0, roErrors = 0;
for (let t = 0; t < N; t++) {
  const truth = C.applyMoves(C.solvedState(), C.randomScramble(25));
  const faces = simulate(truth, rand);
  const out = SC.classifyScan(faces);
  if (out.state.join('') !== truth.join('')) wrongRaw++;
  out.state.forEach((c, i) => { if (c !== truth[i] && 'RO'.includes(c) && 'RO'.includes(truth[i])) roErrors++; });
  if (!out.final || out.final.join('') !== truth.join('')) wrongFinal++;
}
console.log(`cubes with any wrong sticker: ${wrongRaw}/${N}; red/orange sticker errors: ${roErrors}; wrong after auto-repair: ${wrongFinal}/${N}`);
