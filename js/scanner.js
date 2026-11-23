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

      const size = Math.min(W, H) * 0.62;
      const x0 = (W - size) / 2, y0 = (H - size) / 2, cell = size / 3;
      const img = ctx.getImageData(Math.floor(x0), Math.floor(y0), Math.ceil(size), Math.ceil(size)).data;
      const stride = Math.ceil(size);
      const samples = new Array(9);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const cx = (c + 0.5) * cell, cy = (r + 0.5) * cell, half = cell * 0.18;
          const rs = [], gs = [], bs = [];
          for (let yy = Math.floor(cy - half); yy < cy + half; yy += 2) {
            for (let xx = Math.floor(cx - half); xx < cx + half; xx += 2) {
              const p = (yy * stride + xx) * 4;
              rs.push(img[p]); gs.push(img[p + 1]); bs.push(img[p + 2]);
            }
          }
          const med = (a) => { a.sort((m, n) => m - n); return a[a.length >> 1]; };
          const raw = [med(rs), med(gs), med(bs)];
          const rgb = applyGains(raw, this.gains);
          // On a mirrored picture, the displayed column c is column 2 - c of the real face.
          const fc = this.mirror ? 2 - c : c;
          samples[r * 3 + fc] = { rgb: raw, lab: rgbToLab(raw), guess: guessColor(rgb, this.roBoundary), disp: [r, c] };
        }
      }
      this.samples = samples;

      ctx.lineWidth = Math.max(3, size / 90);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 6;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        roundRect(ctx, x0 + c * cell + cell * 0.06, y0 + r * cell + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.14);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (const s of samples) {
        const [r, c] = s.disp;
        ctx.beginPath();
        ctx.arc(x0 + (c + 0.5) * cell, y0 + (r + 0.5) * cell, cell * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = C.COLOR_HEX[s.guess];
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#111';
        ctx.stroke();
        if (this.debug) {
          const [h, sat, val] = rgbToHsv(applyGains(s.rgb, this.gains));
          const wh = h > 180 ? h - 360 : h;
          const x = x0 + (c + 0.5) * cell, y = y0 + (r + 0.5) * cell + cell * 0.32;
          ctx.font = `bold ${Math.round(cell * 0.13)}px ui-monospace, Menlo, monospace`;
          ctx.textAlign = 'center';
          const txt = `h${wh.toFixed(0)} s${(sat * 100).toFixed(0)} v${(val * 100).toFixed(0)}`;
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#000';
          ctx.strokeText(txt, x, y);
          ctx.fillStyle = '#fff';
          ctx.fillText(txt, x, y);
        }
      }
    }

    capture() {
      return this.samples ? this.samples.map((s) => ({ rgb: s.rgb, lab: s.lab, guess: s.guess, disp: s.disp })) : null;
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  root.CubeScanner = { Scanner, classify, classifyScan, repair, rgbToLab, guessColor, nameCenters, warmHue, gainsFromWhite, applyGains };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.CubeScanner;
})(typeof globalThis !== 'undefined' ? globalThis : this);
