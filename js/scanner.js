// Webcam capture, sticker sampling, and color classification.
(function (root) {
  'use strict';
  const C = root.CubeModel;

  function srgbToLinear(v) {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function rgbToLab([r, g, b]) {
    const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
    let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    X = f(X); Y = f(Y); Z = f(Z);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  }
  function rgbToHsv([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max ? d / max : 0, max];
  }

  function labDist(a, b) {
    const dL = (a[0] - b[0]) * 0.5;
    return Math.sqrt(dL * dL + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }

  // Rough guess for the live preview only; the final answer is calibrated against the scanned centers.
  function guessColor(rgb, roBoundary) {
    const [h, s, v] = rgbToHsv(rgb);
    if (s < 0.28 && v > 0.35) return 'W';
    const wh = h > 180 ? h - 360 : h;
    const cut = roBoundary !== undefined && roBoundary !== null ? roBoundary : 8;
    if (wh > -40 && wh < cut) return 'R';
    if (wh >= cut && h < 40) return 'O';
    if (h < 70) return 'Y';
    if (h < 165) return 'G';
    if (h < 260) return 'B';
    return 'R';
  }

  const PROTO = {
    W: rgbToLab([225, 225, 225]), Y: rgbToLab([220, 210, 40]), G: rgbToLab([30, 160, 80]),
    B: rgbToLab([30, 80, 190]), R: rgbToLab([185, 25, 40]), O: rgbToLab([240, 110, 30]),
  };
  const PAIRS = [['W', 'Y'], ['G', 'B'], ['R', 'O']];
  const FACE_PAIRS = [['U', 'D'], ['F', 'B'], ['R', 'L']];
  const hueAngle = (lab) => Math.atan2(lab[2], lab[1]);

  function permutations(a) {
    if (a.length <= 1) return [a];
    const out = [];
    a.forEach((x, i) => permutations(a.slice(0, i).concat(a.slice(i + 1))).forEach((p) => out.push([x].concat(p))));
    return out;
  }

  // Decide which color name each center is. Opposite sides must get opposite colors.
  function nameCenters(centerLab) {
    let best = null;
    for (const perm of permutations([0, 1, 2])) {
      for (let flips = 0; flips < 8; flips++) {
        const names = {};
        let score = 0;
        FACE_PAIRS.forEach((fp, i) => {
          const cp = PAIRS[perm[i]];
          const flip = (flips >> i) & 1;
          names[fp[0]] = cp[flip];
          names[fp[1]] = cp[1 - flip];
        });
        for (const f of C.FACES) score += labDist(centerLab[f], PROTO[names[f]]);
        if (!best || score < best.score) best = { score, names };
      }
    }
    const n = best.names;
    // Inside each pair, use relative features, which are much more robust than absolute ones.
    FACE_PAIRS.forEach(([a, b]) => {
      const pair = [n[a], n[b]].sort().join('');
      let aIsFirst;
      if (pair === 'WY') aIsFirst = centerLab[a][2] < centerLab[b][2];
      else if (pair === 'BG') aIsFirst = centerLab[a][2] < centerLab[b][2];
      else aIsFirst = hueAngle(centerLab[a]) < hueAngle(centerLab[b]);
      const order = pair === 'WY' ? ['W', 'Y'] : pair === 'BG' ? ['B', 'G'] : ['R', 'O'];
      n[a] = aIsFirst ? order[0] : order[1];
      n[b] = aIsFirst ? order[1] : order[0];
    });
    return n;
  }

  // Hue in degrees with red near 0: reds are slightly negative or small, oranges are larger.
  function warmHue(rgb) {
    const h = rgbToHsv(rgb)[0];
    return h > 180 ? h - 360 : h;
  }

  // Per-channel gains that make a known white sticker neutral gray. Returns null if the sample does
  // not look like a plausible white (too dark, or it would need a huge correction).
  function gainsFromWhite(rgb) {
    const [, , v] = rgbToHsv(rgb);
    if (v < 0.35) return null;
    const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
    const g = rgb.map((x) => avg / Math.max(x, 1));
    if (g.some((x) => x < 0.55 || x > 1.8)) return null;
    return g;
  }
  const applyGains = (rgb, g) => (g ? rgb.map((v, c) => Math.min(255, v * g[c])) : rgb);

  // faces: { U: [9 rgb], ... }. Full pipeline: camera tint correction from the white center,
  // white balance per side, cluster, split red and orange by hue, then fix borderline stickers
  // using the rules of a real cube. opts.gains overrides the tint correction.
  function classifyScan(facesIn, opts) {
    opts = opts || {};
    const g0 = opts.gains !== undefined ? opts.gains : gainsFromWhite(facesIn.U[4]);
    const facesRgb = {};
    C.FACES.forEach((f) => { facesRgb[f] = facesIn[f].map((rgb) => applyGains(rgb, g0)); });
    const toLab = (fr) => {
      const out = {};
      C.FACES.forEach((f) => { out[f] = fr[f].map(rgbToLab); });
      return out;
    };
    const first = cluster(toLab(facesRgb));

    // Each side was captured with its own auto white balance. White stickers should be neutral,
    // so use the ones on each side to undo that side's color cast.
    const gains = {};
    const all = [];
    C.FACES.forEach((f, fi) => {
      const whites = facesRgb[f].filter((_, k) => first.state[fi * 9 + k] === 'W' && Math.max(...facesRgb[f][k]) < 250);
      if (whites.length) {
        const m = [0, 1, 2].map((c) => whites.reduce((s, w) => s + w[c], 0) / whites.length);
        const avg = (m[0] + m[1] + m[2]) / 3;
        gains[f] = m.map((v) => avg / Math.max(v, 1));
        all.push(gains[f]);
      }
    });
    const meanGain = all.length ? [0, 1, 2].map((c) => all.reduce((s, g) => s + g[c], 0) / all.length) : [1, 1, 1];
    const corrected = {};
    C.FACES.forEach((f) => {
      const g = gains[f] || meanGain;
      corrected[f] = facesRgb[f].map((rgb) => rgb.map((v, c) => Math.min(255, v * g[c])));
    });

    const res = cluster(toLab(corrected));
    const state = res.state;
    const hue = (i) => warmHue(corrected[C.FACES[Math.floor(i / 9)]][i % 9]);

    // Red and orange: rank the 16 non-center stickers by hue and split them 8 and 8.
    const centerIdx = C.FACES.map((f) => C.centerIndex(f));
    const rCenter = centerIdx.find((i) => state[i] === 'R');
    const oCenter = centerIdx.find((i) => state[i] === 'O');
    if (hue(rCenter) > hue(oCenter)) {
      state[rCenter] = 'O';
      state[oCenter] = 'R';
    }
    const ro = [];
    state.forEach((c, i) => { if ((c === 'R' || c === 'O') && !centerIdx.includes(i)) ro.push(i); });
    ro.sort((a, b) => hue(a) - hue(b));
    const half = ro.length / 2;
    const boundary = ro.length >= 2 ? (hue(ro[half - 1]) + hue(ro[half])) / 2 : 0;
    ro.forEach((i, k) => { state[i] = k < half ? 'R' : 'O'; });

    // Borderline stickers and what they would be otherwise, for the repair search.
    const doubts = [];
    ro.forEach((i) => doubts.push({ i, alt: state[i] === 'R' ? 'O' : 'R', margin: Math.abs(hue(i) - boundary) * 1.5 }));
    res.second.forEach((s) => {
      if (!ro.includes(s.i) && s.alt) doubts.push({ i: s.i, alt: state[centerIdx[s.alt]], margin: s.margin });
    });

    const fc = {};
    C.FACES.forEach((f, fi) => { fc[f] = state.slice(fi * 9, fi * 9 + 9); });
    const fixed = repair(fc, doubts);
    return { state, final: fixed && fixed.state, fixes: fixed ? fixed.fixes : null, changed: fixed ? fixed.changed : [] };
  }

  function cluster(faces) {
    const state = classify(faces);
    return { state, second: classify.lastSecond || [] };
  }

  // faces: { U: [9 lab], R: [...], ... } in facelet order. Returns 54 color letters.
  function classify(faces) {
    const centerLab = {};
    C.FACES.forEach((f) => { centerLab[f] = faces[f][4]; });
    const names = nameCenters(centerLab);
    const refs = C.FACES.map((f) => centerLab[f].slice());
    const items = [];
    C.FACES.forEach((f, fi) => faces[f].forEach((lab, k) => { if (k !== 4) items.push({ i: fi * 9 + k, lab }); }));
    let assign = {};
    for (let iter = 0; iter < 4; iter++) {
      const pairs = [];
      items.forEach((it) => refs.forEach((r, c) => pairs.push({ i: it.i, c, d: labDist(it.lab, r) })));
      pairs.sort((a, b) => a.d - b.d);
      const cap = [8, 8, 8, 8, 8, 8];
      assign = {};
      for (const p of pairs) {
        if (assign[p.i] !== undefined || cap[p.c] === 0) continue;
        assign[p.i] = p.c;
        cap[p.c]--;
      }
      for (let c = 0; c < 6; c++) {
        const members = items.filter((it) => assign[it.i] === c).map((it) => it.lab);
        members.push(centerLab[C.FACES[c]], centerLab[C.FACES[c]]);
        refs[c] = [0, 1, 2].map((k) => members.reduce((s, m) => s + m[k], 0) / members.length);
      }
    }
    const state = new Array(54);
    C.FACES.forEach((f, fi) => { state[fi * 9 + 4] = names[f]; });
    items.forEach((it) => { state[it.i] = names[C.FACES[assign[it.i]]]; });
    classify.lastSecond = items.map((it) => {
      const ds = refs.map((r, c) => ({ c, d: labDist(it.lab, r) })).filter((x) => x.c !== assign[it.i]).sort((a, b) => a.d - b.d);
      const own = labDist(it.lab, refs[assign[it.i]]);
      return { i: it.i, alt: ds[0].c, margin: Math.max(0, ds[0].d - own) };
    });
    return state;
  }

  // Swap pairs of borderline stickers (keeping 9 of each color) until the cube is a real one.
  function swapSearch(state, doubts) {
    if (C.validate(state).ok) return { state, changed: [] };
    if (!doubts || !doubts.length) return null;
    const byIdx = {};
    doubts.forEach((d) => { byIdx[d.i] = d; });
    const pairs = [];
    const ds = doubts.slice().sort((a, b) => a.margin - b.margin).slice(0, 24);
    for (let a = 0; a < ds.length; a++) {
      for (let b = a + 1; b < ds.length; b++) {
        const x = ds[a], y = ds[b];
        if (x.alt === state[y.i] && y.alt === state[x.i]) pairs.push({ x, y, cost: x.margin + y.margin });
      }
    }
    pairs.sort((p, q) => p.cost - q.cost);
    const top = pairs.slice(0, 40);
    const apply = (list) => {
      const s = state.slice();
      list.forEach((p) => { s[p.x.i] = p.x.alt; s[p.y.i] = p.y.alt; });
      return s;
    };
    const options = top.map((p) => ({ list: [p], cost: p.cost }));
    for (let a = 0; a < top.length; a++) {
      for (let b = a + 1; b < top.length; b++) {
        const ids = new Set([top[a].x.i, top[a].y.i]);
        if (ids.has(top[b].x.i) || ids.has(top[b].y.i)) continue;
        options.push({ list: [top[a], top[b]], cost: top[a].cost + top[b].cost });
      }
    }
    options.sort((p, q) => p.cost - q.cost);
    for (const o of options) {
      const s = apply(o.list);
      if (C.validate(s).ok) return { state: s, changed: o.list.flatMap((p) => [p.x.i, p.y.i]) };
    }
    return null;
  }

  // Work out which way up each side was held (any of 4 turns each, since that is hard to keep
  // consistent with a scrambled cube), whether left and right were swapped, and fix borderline
  // colors, until the cube is a real one. Indices in doubts refer to the faces as scanned.
  function repair(faceColors, doubts) {
    const tryState = (fc) => C.FACES.flatMap((f) => fc[f]);
    // Track where each scanned sticker lands so the borderline list can follow it.
    const ids = {};
    C.FACES.forEach((f, fi) => { ids[f] = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => fi * 9 + k); });
    const transform = (src, o) => {
      const fc = Object.assign({}, src);
      if (o.swapRL) { fc.R = src.L; fc.L = src.R; }
      C.FACES.forEach((f) => { fc[f] = C.rotateFaceGrid(fc[f], o.rot[f]); });
      return fc;
    };
    const describe = (o) => (o.swapRL ? ['the left and right sides were swapped'] : []);

    // Score every option by how many pieces come out impossible; the real answer has none.
    const scored = [];
    for (const swapRL of [false, true]) {
      for (let n = 0; n < 4096; n++) {
        const rot = {};
        let turned = 0;
        C.FACES.forEach((f, i) => { rot[f] = (n >> (2 * i)) & 3; if (rot[f]) turned++; });
        const o = { swapRL, rot, cost: (swapRL ? 10 : 0) + turned };
        const s = tryState(transform(faceColors, o));
        const v = C.validate(s);
        if (v.ok) scored.push({ o, s, bad: 0 });
        else scored.push({ o, s, bad: v.errors.length });
      }
    }
    scored.sort((a, b) => a.bad - b.bad || a.o.cost - b.o.cost);
    if (scored[0].bad === 0) return { state: scored[0].s, fixes: describe(scored[0].o), changed: [] };
    if (!(doubts && doubts.length)) return null;

    // No perfect fit: some colors are probably misread. Try the closest options with color swaps.
    for (const cand of scored.slice(0, 8)) {
      const order = tryState(transform(ids, cand.o));
      const where = {};
      order.forEach((scanned, k) => { where[scanned] = k; });
      const found = swapSearch(cand.s, doubts.map((dd) => Object.assign({}, dd, { i: where[dd.i] })));
      if (found) return { state: found.state, fixes: describe(cand.o), changed: found.changed };
    }
    return null;
  }

  // ---------- Finding the cube face in the picture ----------
  // The picture is reduced to brightness (the largest of r, g, b, so blue and red stickers count as
  // bright). A face is a 3x3 grid of bright, even cells separated by dark lines. The dark lines are
  // widened with a minimum filter scaled to the grid size, so a guess that is a little off still
  // lands on them. Grid: center cx, cy, width s, height s * asp, turned by angle a (radians).
  function brightnessMap(rgba, w, h) {
    const v = new Float32Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) v[i] = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
    return { v, w, h, eroded: {} };
  }

  function eroded(img, r) {
    if (img.eroded[r]) return img.eroded[r];
    const { v, w, h } = img;
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let m = 255;
        for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (v[row + k] < m) m = v[row + k];
        tmp[row + x] = m;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let m = 255;
        for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] < m) m = tmp[k * w + x];
        out[y * w + x] = m;
      }
    }
    img.eroded[r] = out;
    return out;
  }
  const radiusFor = (s) => Math.max(1, Math.min(8, Math.round(s * 0.045)));

  // Sample points in grid units (one cell = 1, grid center = 0): cell interiors, the lines between
  // cells, and the outer border, one list per side, so a side that is not dark (the grid is off by
  // a row) can be told apart from one partly covered by fingers.
  function gridPoints(fast) {
    const offs = fast ? [[0, 0], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]
      : [-0.22, 0, 0.22].flatMap((a) => [-0.22, 0, 0.22].map((b) => [a, b]));
    const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(offs.map(([du, dv]) => [c - 1 + du, r - 1 + dv]));
    const lines = [];
    const along = fast ? [0] : [-0.28, 0, 0.28];
    for (const k of [-0.5, 0.5]) for (let j = -1; j <= 1; j++) for (const t of along) lines.push([k, j + t], [j + t, k]);
    const sides = [[], [], [], []];
    const around = fast ? [-0.25, 0.25] : [-0.3, 0, 0.3];
    for (let j = -1; j <= 1; j++) for (const t of around) {
      sides[0].push([-1.5, j + t]);
      sides[1].push([1.5, j + t]);
      sides[2].push([j + t, -1.5]);
      sides[3].push([j + t, 1.5]);
    }
    return { cells, lines, sides };
  }
  const PTS_FAST = gridPoints(true), PTS_FULL = gridPoints(false);

  function scoreGrid(img, p, fast, radius) {
    const { w, h } = img;
    const v = eroded(img, radius || radiusFor(p.s));
    const pts = fast ? PTS_FAST : PTS_FULL;
    const qx = p.s / 3, qy = (p.s * p.asp) / 3;
    const ca = Math.cos(p.a), sa = Math.sin(p.a);
    const at = (gu, gv) => {
      const u = gu * qx, vv = gv * qy;
      const x = Math.round(p.cx + u * ca - vv * sa), y = Math.round(p.cy + u * sa + vv * ca);
      if (x < 0 || y < 0 || x >= w || y >= h) return -1;
      return v[y * w + x];
    };
    // Quick test first: cell centers must be clearly brighter than the lines between them.
    let lsum = 0;
    for (const [gu, gv] of pts.lines) {
      const val = at(gu, gv);
      if (val < 0) return null;
      lsum += val;
    }
    const line = lsum / pts.lines.length;
    if (fast) {
      let csum = 0;
      for (const cell of pts.cells) {
        const val = at(cell[0][0], cell[0][1]);
        if (val < 0) return null;
        csum += val;
      }
      if (csum / 9 - line < 30) return null;
    }
    let worst = 0;
    for (const side of pts.sides) {
      const vals = [];
      for (const [gu, gv] of side) {
        const val = at(gu, gv);
        if (val < 0) return null;
        vals.push(val);
      }
      vals.sort((x, y) => x - y);
      worst = Math.max(worst, vals[Math.floor(vals.length * 0.4)]);
    }
    let total = 0, sdSum = 0, bright = 0;
    for (const cell of pts.cells) {
      let s1 = 0, s2 = 0;
      for (const [gu, gv] of cell) {
        const val = at(gu, gv);
        if (val < 0) return null;
        s1 += val;
        s2 += val * val;
      }
      const m = s1 / cell.length;
      const sd = Math.sqrt(Math.max(0, s2 / cell.length - m * m));
      const con = m - line;
      total += Math.max(-40, Math.min(80, con));
      sdSum += sd;
      if (con > 18) bright++;
    }
    const score = total / 9 - 0.6 * (sdSum / 9) - 0.7 * Math.max(0, worst - line);
    return { score, bright, line };
  }

  const FOUND_SCORE = 32, KEEP_SCORE = 22;

  function normAngle(p) {
    const q = Object.assign({}, p);
    while (q.a > Math.PI / 4) { q.a -= Math.PI / 2; q.asp = 1 / q.asp; q.s /= q.asp; }
    while (q.a < -Math.PI / 4) { q.a += Math.PI / 2; q.asp = 1 / q.asp; q.s /= q.asp; }
    return q;
  }

  // Polish a guess by trying small changes to each setting, halving the steps when nothing helps.
  function refineGrid(img, p0, rounds, radius) {
    radius = radius || radiusFor(p0.s);
    let best = { cx: p0.cx, cy: p0.cy, s: p0.s, a: p0.a, asp: p0.asp };
    let bs = scoreGrid(img, best, false, radius);
    if (!bs) return null;
    let st = { cx: p0.s * 0.06, cy: p0.s * 0.06, s: 0.06, a: 0.08, asp: 0.06 };
    for (let round = 0; round < (rounds || 4); round++) {
      let improved = true, guard = 0;
      while (improved && guard++ < 10) {
        improved = false;
        for (const key of ['cx', 'cy', 's', 'a', 'asp']) {
          for (const dir of [-1, 1]) {
            const q = Object.assign({}, best);
            if (key === 's') q.s *= 1 + dir * st.s;
            else if (key === 'asp') q.asp = Math.max(0.7, Math.min(1.43, q.asp * (1 + dir * st.asp)));
            else q[key] += dir * st[key];
            const r = scoreGrid(img, q, false, radius);
            if (r && r.score > bs.score) { best = q; bs = r; improved = true; }
          }
        }
      }
      st = { cx: st.cx / 2, cy: st.cy / 2, s: st.s / 2, a: st.a / 2, asp: st.asp / 2 };
    }
    return Object.assign(normAngle(best), bs);
  }
  // Coarse polish with wide lines, then a fine one with narrow lines.
  function polishGrid(img, p0) {
    const wide = radiusFor(p0.s);
    const r = refineGrid(img, p0, 3, wide);
    if (!r || wide <= 1) return r;
    const fine = refineGrid(img, r, 3, Math.max(1, Math.round(wide / 2)));
    // Report the score on the wide lines so the found and lost thresholds stay comparable.
    const ws = fine && scoreGrid(img, fine, false, radiusFor(fine.s));
    return ws ? Object.assign(fine, ws) : r;
  }

  const COARSE_ANGLES = [0, -0.2, 0.2, -0.4, 0.4];

  // Look for a face anywhere near the middle of the picture, then polish the best few guesses.
  function findGrid(img) {
    const { w, h } = img;
    const cands = [];
    for (let s = h * 0.3; s <= h * 0.95; s *= 1.1) {
      const step = Math.max(2, s / 15);
      for (let cy = h * 0.2; cy <= h * 0.8; cy += step) {
        for (let cx = w * 0.2; cx <= w * 0.8; cx += step) {
          for (const a of COARSE_ANGLES) {
            const p = { cx, cy, s, a, asp: 1 };
            const r = scoreGrid(img, p, true);
            if (r && r.bright >= 7) cands.push({ p, score: r.score });
          }
        }
      }
    }
    cands.sort((x, y) => y.score - x.score);
    const picked = [];
    for (const c of cands) {
      if (picked.length >= 3) break;
      if (picked.some((q) => Math.hypot(q.p.cx - c.p.cx, q.p.cy - c.p.cy) < c.p.s * 0.2)) continue;
      picked.push(c);
    }
    let best = null;
    for (const c of picked) {
      const r = polishGrid(img, c.p);
      if (r && (!best || r.score > best.score)) best = r;
    }
    return best;
  }

  // Follow a face from the last frame; search afresh if it is lost (or when asked to).
  function trackGrid(img, prev, allowSearch) {
    if (prev) {
      const r = polishGrid(img, prev);
      if (r && r.score >= KEEP_SCORE && r.bright >= 7) return Object.assign(r, { found: true });
    }
    if (allowSearch === false) return null;
    const r = findGrid(img);
    if (r && r.score >= FOUND_SCORE && r.bright >= 8) return Object.assign(r, { found: true });
    return r ? Object.assign(r, { found: false }) : null;
  }

  // Where cell (r, c) of a grid sits in the picture.
  function cellCenter(p, r, c) {
    const u = (c - 1) * (p.s / 3), v = (r - 1) * ((p.s * p.asp) / 3);
    return [p.cx + u * Math.cos(p.a) - v * Math.sin(p.a), p.cy + u * Math.sin(p.a) + v * Math.cos(p.a)];
  }

  class Scanner {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { willReadFrequently: true });
      this.video = document.createElement('video');
      this.video.playsInline = true;
      this.video.muted = true;
      this.mirror = true;
      this.samples = null;
      this.running = false;
      this.buffer = [];
      this.steadyMs = 0;
      this.progress = 0;
      this.armed = true;
      this.autoCapture = false;
      this.holdMs = 700;
      this.onSteady = null;
    }

    async start(deviceId) {
      this.stop();
      const constraints = {
        video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();
      this.running = true;
      // Auto white balance shifts colors as different sides are shown; lock it once it has settled.
      setTimeout(() => this.lockWhiteBalance(), 1500);
      const tick = () => {
        if (!this.running) return;
        if (!this.paused) this.frame();
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    }

    lockWhiteBalance() {
      const track = this.stream && this.stream.getVideoTracks()[0];
      if (!track || !track.getCapabilities) return;
      try {
        const caps = track.getCapabilities();
        if (!caps.whiteBalanceMode || !caps.whiteBalanceMode.includes('manual')) return;
        const set = track.getSettings();
        const c = { whiteBalanceMode: 'manual' };
        if (set.colorTemperature) c.colorTemperature = set.colorTemperature;
        track.applyConstraints({ advanced: [c] }).catch(() => {});
      } catch (e) { /* not supported by this camera */ }
    }

    stop() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    static async cameras() {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        return list.filter((d) => d.kind === 'videoinput');
      } catch (e) {
        return [];
      }
    }

    // Find the face in a small copy of the picture, follow it from frame to frame, and smooth its
    // position so the grid does not jitter. Returns the grid in canvas pixels, or null.
    track(W, H) {
      const dw = DETECT_WIDTH, dh = Math.round((DETECT_WIDTH * H) / W);
      if (!this.det) {
        this.det = document.createElement('canvas');
        this.dctx = this.det.getContext('2d', { willReadFrequently: true });
      }
      if (this.det.width !== dw || this.det.height !== dh) { this.det.width = dw; this.det.height = dh; }
      this.dctx.drawImage(this.canvas, 0, 0, W, H, 0, 0, dw, dh);
      const img = brightnessMap(this.dctx.getImageData(0, 0, dw, dh).data, dw, dh);
      this.frameNo = (this.frameNo || 0) + 1;
      // A full search costs more than following, so while lost only search every few frames.
      const r = trackGrid(img, this.raw, !this.raw && this.frameNo % 3 === 0);
      if (r && r.found) {
        this.raw = r;
        this.missed = 0;
        const sm = this.smooth;
        const jump = !sm || Math.hypot(r.cx - sm.cx, r.cy - sm.cy) > sm.s * 0.3 || Math.abs(r.s - sm.s) > sm.s * 0.25 || Math.abs(r.a - sm.a) > 0.3;
        const k = 0.4;
        this.smooth = jump ? { cx: r.cx, cy: r.cy, s: r.s, a: r.a, asp: r.asp } : {
          cx: sm.cx + (r.cx - sm.cx) * k, cy: sm.cy + (r.cy - sm.cy) * k, s: sm.s + (r.s - sm.s) * k,
          a: sm.a + (r.a - sm.a) * k, asp: sm.asp + (r.asp - sm.asp) * k,
        };
      } else {
        this.raw = null;
        // Hold on to the last position for a few frames so a brief miss does not flicker.
        if (++this.missed > 6) this.smooth = null;
      }
      if (!this.smooth) return null;
      const f = W / dw, g = this.smooth;
      return { cx: g.cx * f, cy: g.cy * f, s: g.s * f, a: g.a, asp: g.asp, live: !!this.raw };
    }

    frame() {
      const v = this.video;
      if (!v.videoWidth) return;
      const W = v.videoWidth, H = v.videoHeight;
      if (this.canvas.width !== W) { this.canvas.width = W; this.canvas.height = H; }
      const ctx = this.ctx;
      ctx.save();
      if (this.mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
      ctx.drawImage(v, 0, 0, W, H);
      ctx.restore();

      const now = performance.now();
      const gap = this.lastT ? now - this.lastT : 0;
      this.lastT = now;

      let grid = null;
      try { grid = this.track(W, H); } catch (e) { grid = null; }
      const tracked = !!grid;
      const guide = Math.min(W, H) * 0.62;
      if (!grid) grid = { cx: W / 2, cy: H / 2, s: guide, a: 0, asp: 1 };
      const qx = grid.s / 3, qy = (grid.s * grid.asp) / 3;

      // Sample a small patch in the middle of each cell (median, so stray pixels do not matter).
      const centers = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) centers.push(cellCenter(grid, r, c));
      const half = Math.max(2, Math.min(qx, qy) * 0.16);
      const bx0 = Math.max(0, Math.floor(Math.min(...centers.map((p) => p[0])) - half));
      const by0 = Math.max(0, Math.floor(Math.min(...centers.map((p) => p[1])) - half));
      const bx1 = Math.min(W, Math.ceil(Math.max(...centers.map((p) => p[0])) + half + 1));
      const by1 = Math.min(H, Math.ceil(Math.max(...centers.map((p) => p[1])) + half + 1));
      const bw = Math.max(1, bx1 - bx0), bh = Math.max(1, by1 - by0);
      const img = ctx.getImageData(bx0, by0, bw, bh).data;
      const step = Math.max(1, Math.round(half / 6));
      const samples = new Array(9);
      centers.forEach(([x, y], k) => {
        const r = Math.floor(k / 3), c = k % 3;
        const rs = [], gs = [], bs = [];
        for (let yy = Math.round(y - half); yy <= y + half; yy += step) {
          for (let xx = Math.round(x - half); xx <= x + half; xx += step) {
            const px = xx - bx0, py = yy - by0;
            if (px < 0 || py < 0 || px >= bw || py >= bh) continue;
            const p = (py * bw + px) * 4;
            rs.push(img[p]); gs.push(img[p + 1]); bs.push(img[p + 2]);
          }
        }
        const raw = rs.length ? [median(rs), median(gs), median(bs)] : [0, 0, 0];
        // On a mirrored picture, the displayed column c is column 2 - c of the real face.
        const fc = this.mirror ? 2 - c : c;
        samples[r * 3 + fc] = { rgb: raw, lab: rgbToLab(raw), guess: guessColor(applyGains(raw, this.gains), this.roBoundary), disp: [r, c] };
      });
      this.samples = samples;
      this.updateSteady(grid, tracked, gap);
      this.drawOverlay(grid, tracked, samples);
    }

    // Track how long the cube has been held still. Colors seen while still are kept, so a capture
    // can use the median of several frames instead of one possibly blurred frame.
    updateSteady(grid, tracked, gap) {
      const prev = this.lastGrid;
      this.lastGrid = tracked ? grid : null;
      const labs = this.samples.map((s) => s.lab);
      let still = tracked && prev && gap < 250;
      if (still) {
        const move = Math.hypot(grid.cx - prev.cx, grid.cy - prev.cy) / grid.s + Math.abs(grid.s - prev.s) / grid.s + Math.abs(grid.a - prev.a);
        still = move < 0.025;
      }
      if (still && this.buffer.length) {
        const ref = this.buffer[this.buffer.length - 1].labs;
        still = labs.every((l, k) => labDist(l, ref[k]) < 14);
      }
      if (still) {
        this.steadyMs += gap;
        this.buffer.push({ rgb: this.samples.map((s) => s.rgb), labs });
        if (this.buffer.length > 15) this.buffer.shift();
      } else {
        this.steadyMs = 0;
        this.buffer = [{ rgb: this.samples.map((s) => s.rgb), labs }];
      }

      // After a capture, wait until a different side is shown (or the cube leaves the picture).
      if (!this.armed) {
        this.awayMs = tracked ? 0 : (this.awayMs || 0) + gap;
        const center = labs[4];
        if (this.awayMs > 500 || (tracked && this.refLab && labDist(center, this.refLab) > 22)) this.armed = true;
        if (this.armed) this.steadyMs = 0;
      }
      this.progress = this.autoCapture && this.armed && tracked ? Math.min(1, this.steadyMs / this.holdMs) : 0;
      if (this.progress >= 1 && this.onSteady) {
        this.armed = false;
        this.refLab = labs[4];
        this.onSteady();
      }
    }

    drawOverlay(grid, tracked, samples) {
      const ctx = this.ctx;
      const qx = grid.s / 3, qy = (grid.s * grid.asp) / 3, cell = Math.min(qx, qy);
      const H = this.canvas.height, W = this.canvas.width;
      ctx.save();
      ctx.translate(grid.cx, grid.cy);
      ctx.rotate(grid.a);
      ctx.lineWidth = Math.max(3, grid.s / 90);
      const done = this.progress >= 1;
      ctx.strokeStyle = tracked ? (done ? 'rgba(43,212,125,0.95)' : 'rgba(255,255,255,0.95)') : 'rgba(255,255,255,0.7)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      if (!tracked) ctx.setLineDash([cell * 0.12, cell * 0.1]);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        roundRect(ctx, (c - 1.5) * qx + qx * 0.06, (r - 1.5) * qy + qy * 0.06, qx * 0.88, qy * 0.88, cell * 0.14);
        ctx.stroke();
      }
      ctx.restore();

      for (const s of samples) {
        const [r, c] = s.disp;
        const [x, y] = cellCenter(grid, r, c);
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = C.COLOR_HEX[s.guess];
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#111';
        ctx.stroke();
        if (this.debug) {
          const [h, sat, val] = rgbToHsv(applyGains(s.rgb, this.gains));
          const wh = h > 180 ? h - 360 : h;
          ctx.font = `bold ${Math.round(cell * 0.13)}px ui-monospace, Menlo, monospace`;
          ctx.textAlign = 'center';
          const txt = `h${wh.toFixed(0)} s${(sat * 100).toFixed(0)} v${(val * 100).toFixed(0)}`;
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#000';
          ctx.strokeText(txt, x, y + cell * 0.32);
          ctx.fillStyle = '#fff';
          ctx.fillText(txt, x, y + cell * 0.32);
        }
      }

      // A ring around the middle dot fills up while the cube is held still.
      if (this.progress > 0) {
        ctx.beginPath();
        ctx.arc(grid.cx, grid.cy, cell * 0.27, -Math.PI / 2, -Math.PI / 2 + this.progress * Math.PI * 2);
        ctx.lineWidth = Math.max(5, cell * 0.08);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#2bd47d';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      const msg = !tracked ? 'Looking for your cube...' : this.autoCapture && this.armed ? 'Hold still...' : '';
      if (msg) {
        const fs = Math.round(H * 0.045);
        ctx.font = `700 ${fs}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        const tw = ctx.measureText(msg).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, W / 2 - tw / 2 - fs * 0.6, fs * 0.5, tw + fs * 1.2, fs * 1.6, fs * 0.8);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(msg, W / 2, fs * 1.65);
      }
    }

    // Wait for a different side before taking a picture by itself again.
    disarm() {
      this.armed = false;
      this.awayMs = 0;
      this.refLab = this.samples ? this.samples[4].lab : null;
    }

    arm() {
      this.armed = true;
      this.steadyMs = 0;
    }

    // The colors of the current side: the median over the frames the cube was held still.
    capture() {
      if (!this.samples) return null;
      const buf = this.buffer.length >= 3 ? this.buffer : [{ rgb: this.samples.map((s) => s.rgb) }];
      const out = this.samples.map((s, k) => {
        const rgb = [0, 1, 2].map((ch) => median(buf.map((b) => b.rgb[k][ch])));
        return { rgb, lab: rgbToLab(rgb), guess: guessColor(applyGains(rgb, this.gains), this.roBoundary), disp: s.disp };
      });
      this.disarm();
      return out;
    }
  }

  const DETECT_WIDTH = 240;
  const median = (a) => { const b = a.slice().sort((m, n) => m - n); return b[b.length >> 1]; };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  root.CubeScanner = { Scanner, brightnessMap, scoreGrid, trackGrid, findGrid, cellCenter, classify, classifyScan, repair, rgbToLab, guessColor, nameCenters, warmHue, gainsFromWhite, applyGains };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CubeScanner;
})(typeof globalThis !== 'undefined' ? globalThis : this);
