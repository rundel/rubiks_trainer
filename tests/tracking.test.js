// Face detection on synthetic camera pictures: a cube face at random places, sizes, and angles,
// with noise, a cluttered background, and fingers over the edges. Also checks that empty scenes
// are not mistaken for a cube.
const SC = require('../js/scanner.js');

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const COLS = [[235, 235, 230], [230, 210, 30], [20, 150, 70], [20, 70, 190], [190, 20, 35], [245, 110, 20]];

function scene(W, H, face, opts) {
  const img = new Uint8ClampedArray(W * H * 4);
  const bgA = [60 + rand() * 120, 60 + rand() * 120, 60 + rand() * 120];
  const blobs = [];
  for (let k = 0; k < (opts.clutter || 0); k++) {
    blobs.push({ x: rand() * W, y: rand() * H, r: 5 + rand() * 25, col: COLS[Math.floor(rand() * 6)].map((v) => v * (0.5 + rand() * 0.5)) });
  }
  const cells = face ? Array.from({ length: 9 }, () => COLS[Math.floor(rand() * 6)]) : null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let col = bgA.map((v, c) => v + (x / W) * 40 * (c - 1));
    for (const b of blobs) if (Math.hypot(x - b.x, y - b.y) < b.r) col = b.col;
    if (face) {
      const dx = x - face.cx, dy = y - face.cy;
      const u = dx * Math.cos(-face.a) - dy * Math.sin(-face.a);
      const v = dx * Math.sin(-face.a) + dy * Math.cos(-face.a);
      const q = face.s / 3, gu = u / q + 1.5, gv = v / (q * face.asp) + 1.5;
      if (gu > -0.04 && gu < 3.04 && gv > -0.04 && gv < 3.04) {
        col = [22, 22, 24];
        const c = Math.floor(gu), r = Math.floor(gv);
        const fu = gu - c, fv = gv - r;
        if (c >= 0 && c < 3 && r >= 0 && r < 3 && fu > 0.06 && fu < 0.94 && fv > 0.06 && fv < 0.94) {
          const shade = 0.75 + 0.25 * (1 - gv / 3);
          col = cells[r * 3 + c].map((x) => x * shade);
        }
      }
    }
    for (const f of opts.fingers || []) if (Math.hypot(x - f.x, (y - f.y) * 0.45) < f.r) col = [205, 150, 120];
    const p = (y * W + x) * 4;
    for (let c = 0; c < 3; c++) img[p + c] = col[c] + (rand() - 0.5) * (opts.noise || 16);
    img[p + 3] = 255;
  }
  return img;
}

const W = 240, H = 135;
let ok = 0, bad = 0, falsePos = 0, detMs = 0;
const N = +process.argv[2] || 60;
for (let i = 0; i < N; i++) {
  const s = H * (0.35 + rand() * 0.45);
  const face = { cx: W / 2 + (rand() - 0.5) * W * 0.3, cy: H / 2 + (rand() - 0.5) * H * 0.2, s, a: (rand() - 0.5) * 0.7, asp: 0.85 + rand() * 0.3 };
  face.cy = Math.max(s * 0.6, Math.min(H - s * 0.6, face.cy));
  const fingers = i % 2 ? [{ x: face.cx - s * 0.55, y: face.cy + s * 0.5, r: s * 0.16 }, { x: face.cx + s * 0.55, y: face.cy + s * 0.45, r: s * 0.14 }] : [];
  const img = SC.brightnessMap(scene(W, H, face, { clutter: 6, noise: 20, fingers }), W, H);
  const td = Date.now();
  const r = SC.trackGrid(img, null);
  detMs += Date.now() - td;
  const err = r && r.found ? Math.hypot(r.cx - face.cx, r.cy - face.cy) / s + Math.abs(r.s - face.s) / s : Infinity;
  const centersOk = r && r.found && [0, 1, 2].every((rr) => [0, 1, 2].every((cc) => {
    const [x, y] = SC.cellCenter(r, rr, cc);
    const [tx, ty] = SC.cellCenter(face, rr, cc);
    return Math.hypot(x - tx, y - ty) < s / 3 * 0.25;
  }));
  if (centersOk) ok++;
  else {
    bad++;
    console.log('miss', i, JSON.stringify(face, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)), r && { found: r.found, score: +r.score.toFixed(1), bright: r.bright, cx: +r.cx.toFixed(1), cy: +r.cy.toFixed(1), s: +r.s.toFixed(1), a: +r.a.toFixed(2) }, err.toFixed(2));
  }
  // Tracking from a nearby start, as when the cube moves between frames.
  if (centersOk) {
    const moved = Object.assign({}, face, { cx: face.cx + s * 0.08, cy: face.cy - s * 0.06, a: face.a + 0.08 });
    const img2 = SC.brightnessMap(scene(W, H, moved, { clutter: 6, noise: 20, fingers: [] }), W, H);
    const r2 = SC.trackGrid(img2, r);
    if (!r2 || !r2.found || Math.hypot(r2.cx - moved.cx, r2.cy - moved.cy) > s * 0.08) { bad++; console.log('track lost', i); }
  }
}
for (let i = 0; i < N / 2; i++) {
  const img = SC.brightnessMap(scene(W, H, null, { clutter: 12, noise: 20 }), W, H);
  const r = SC.trackGrid(img, null);
  if (r && r.found) { falsePos++; console.log('false positive', i, r.score.toFixed(1), r.bright); }
}
console.log(`found ${ok}/${N}, misses ${bad}, false positives ${falsePos}/${N / 2}, full search ~${(detMs / N).toFixed(1)} ms`);
process.exit(bad > N * 0.12 || falsePos > 0 ? 1 : 0);
