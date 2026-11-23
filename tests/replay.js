// Score color classifiers on real saved scans.
// Usage: node tests/replay.js [files or folders...]   (default: tests/scans)
const fs = require('fs');
const path = require('path');
globalThis.CubeModel = require('../js/cube.js');
const C = globalThis.CubeModel;
const SC = require('../js/scanner.js');

const METHODS = {
  // First version: Lab distance to centers, then orientation repair only.
  v1: (faces) => {
    const lab = {};
    C.FACES.forEach((f) => { lab[f] = faces[f].map(SC.rgbToLab); });
    const s = SC.classify(lab);
    const fc = {};
    C.FACES.forEach((f, i) => { fc[f] = s.slice(i * 9, i * 9 + 9); });
    const r = SC.repair(fc);
    return { raw: s, final: r ? r.state : s };
  },
  // Current: white balance per side, hue split for red and orange, borderline swaps.
  v2: (faces) => {
    const out = SC.classifyScan(faces);
    return { raw: out.state, final: out.final || out.state };
  },
};

let args = process.argv.slice(2);
if (!args.length) args = [path.join(__dirname, 'scans')];
const files = args.flatMap((a) => (fs.statSync(a).isDirectory()
  ? fs.readdirSync(a).filter((f) => f.endsWith('.json')).map((f) => path.join(a, f))
  : [a]));
if (!files.length) {
  console.log('No scan files found.');
  process.exit(0);
}

const fmtHsv = (rgb) => {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return `rgb(${rgb.join(',')}) hue ${SC.warmHue(rgb).toFixed(0)} sat ${max ? ((max - min) / max * 100).toFixed(0) : 0} val ${(max * 100).toFixed(0)}`;
};

const totals = {};
for (const file of files) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n=== ${path.basename(file)}${d.valid ? '' : '  (truth is NOT a valid cube; check the corrections)'}`);
  for (const [name, fn] of Object.entries(METHODS)) {
    const res = fn(d.samples);
    const wrong = [];
    const truth = typeof d.truth === "string" ? d.truth.split("") : d.truth;
    res.final.forEach((c, i) => { if (c !== truth[i]) wrong.push(i); });
    const rawWrong = res.raw.filter((c, i) => c !== truth[i]).length;
    totals[name] = totals[name] || { stickers: 0, cubes: 0 };
    totals[name].stickers += wrong.length;
    totals[name].cubes += wrong.length ? 1 : 0;
    console.log(`  ${name}: ${wrong.length} wrong after repair (${rawWrong} before)`);
    wrong.forEach((i) => {
      const f = C.FACES[Math.floor(i / 9)];
      console.log(`     ${f}${i % 9}: truth ${truth[i]} got ${res.final[i]}  ${fmtHsv(d.samples[f][i % 9])}`);
    });
  }
  // Per-side table of the real red and orange stickers, the hardest pair.
  const rows = [];
  C.FACES.forEach((f, fi) => {
    const cells = d.samples[f]
      .map((rgb, k) => ({ c: (typeof d.truth === "string" ? d.truth : d.truth.join(""))[fi * 9 + k], h: SC.warmHue(rgb) }))
      .filter((x) => x.c === 'R' || x.c === 'O')
      .map((x) => `${x.c}${x.h.toFixed(0)}`);
    if (cells.length) rows.push(`${f}: ${cells.join(' ')}`);
  });
  console.log('  red/orange hues by side: ' + rows.join(' | '));
}
console.log('\nTotals over ' + files.length + ' scans:');
for (const [name, t] of Object.entries(totals)) console.log(`  ${name}: ${t.stickers} wrong stickers, ${t.cubes} cubes with errors`);
