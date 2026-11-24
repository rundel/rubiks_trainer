(function () {
  'use strict';
  const C = window.CubeModel;
  const S = window.CubeSolver;
  const SC = window.CubeScanner;
  const $ = (sel) => document.querySelector(sel);
  const NAMES = C.COLOR_NAMES;

  // Turn {X} color tokens into colored chips.
  function fmt(text) {
    const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/\{([WYGBRO])\}/g, (_, c) => `<span class="chip chip-${c}">${NAMES[c]}</span>`);
  }

  // ---------- Move descriptions and icons ----------
  const MOVE_TEXT = {
    U: ['Turn the TOP layer to the left', 'The top row slides from right to left.'],
    "U'": ['Turn the TOP layer to the right', 'The top row slides from left to right.'],
    U2: ['Turn the TOP layer twice', 'A half turn. Either direction works.'],
    D: ['Turn the BOTTOM layer to the right', 'The bottom row slides from left to right.'],
    "D'": ['Turn the BOTTOM layer to the left', 'The bottom row slides from right to left.'],
    D2: ['Turn the BOTTOM layer twice', 'A half turn. Either direction works.'],
    R: ['Turn the RIGHT side up', 'The front of the right side goes up, away from you.'],
    "R'": ['Turn the RIGHT side down', 'The front of the right side comes down, toward you.'],
    R2: ['Turn the RIGHT side twice', 'A half turn. Either direction works.'],
    L: ['Turn the LEFT side down', 'The front of the left side goes down, toward you.'],
    "L'": ['Turn the LEFT side up', 'The front of the left side goes up, away from you.'],
    L2: ['Turn the LEFT side twice', 'A half turn. Either direction works.'],
    F: ['Turn the FRONT clockwise', 'Like turning a steering wheel to the right.'],
    "F'": ['Turn the FRONT counterclockwise', 'Like turning a steering wheel to the left.'],
    F2: ['Turn the FRONT twice', 'A half turn. Either direction works.'],
    B: ['Turn the BACK side', 'Looking from the front, its top moves to the left.'],
    "B'": ['Turn the BACK side the other way', 'Looking from the front, its top moves to the right.'],
    B2: ['Turn the BACK side twice', 'A half turn. Either direction works.'],
    y: ['Turn the WHOLE cube to the left', 'The side on your right comes to the front.'],
    "y'": ['Turn the WHOLE cube to the right', 'The side on your left comes to the front.'],
    y2: ['Turn the WHOLE cube around', 'The back comes to the front.'],
  };

  // Move pictures can be drawn flat (the front face) or as an isometric cube.
  let iconStyle = localStorage.getItem('cubeCoachIcons') === 'iso' ? 'iso' : 'flat';
  function moveIcon(m) {
    return iconStyle === 'iso' ? moveIconIso(m) : moveIconFlat(m);
  }

  // Arrow paths run along the turning layer, over the edges of the cube, in cube coordinates
  // (x right, y up, z toward you; the cube spans -1.5 to 1.5).
  const ISO_ARROWS = {
    U: [[1.5, 1, -0.75], [1.5, 1, 1.5], [-0.75, 1, 1.5]],
    D: [[-0.75, -1, 1.5], [1.5, -1, 1.5], [1.5, -1, -0.75]],
    R: [[1, -0.75, 1.5], [1, 1.5, 1.5], [1, 1.5, -0.75]],
    L: [[-1, 1.5, -0.75], [-1, 1.5, 1.5], [-1, -0.75, 1.5]],
    F: [[-0.75, 1.5, 1], [1.5, 1.5, 1], [1.5, -0.75, 1]],
    B: [[1.5, -0.75, -1], [1.5, 1.5, -1], [-0.75, 1.5, -1]],
    y: [[1.5, 0, -0.75], [1.5, 0, 1.5], [-0.75, 0, 1.5]],
  };
  function moveIconIso(m) {
    const base = m[0];
    const prime = m.includes("'");
    const dbl = m.includes('2');
    const def = C.MOVE_DEFS[base];
    const k = 8.8, cos30 = Math.cos(Math.PI / 6);
    const P = ([x, y, z]) => [32 + (x - z) * cos30 * k, 33 - y * k + (x + z) * 0.5 * k];
    const pt = (p) => P(p).map((v) => v.toFixed(2)).join(',');
    // Each visible face: its outward axis and how a cell (r, c) maps to cube coordinates.
    const faces = [
      { fill: ['#f4f5fa', '#ffe07a'], at: (r, c, s, t) => [c - 1 + s, 1.5, r - 1 + t], pos: (r, c) => [c - 1, 1, r - 1] },
      { fill: ['#dfe3ee', '#f5c836'], at: (r, c, s, t) => [c - 1 + s, 1 - r - t, 1.5], pos: (r, c) => [c - 1, 1 - r, 1] },
      { fill: ['#c6cddf', '#dcab17'], at: (r, c, s, t) => [1.5, 1 - r - t, 1 - c - s], pos: (r, c) => [1, 1 - r, 1 - c] },
    ];
    const outline = [[-1.5, 1.5, -1.5], [1.5, 1.5, -1.5], [1.5, -1.5, -1.5], [1.5, -1.5, 1.5], [-1.5, -1.5, 1.5], [-1.5, 1.5, 1.5]];
    let cells = `<polygon points="${outline.map(pt).join(' ')}" fill="#1d2340" stroke="#1d2340" stroke-width="2" stroke-linejoin="round"/>`;
    const e = 0.42;
    for (const f of faces) {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const on = def.layer(f.pos(r, c));
        const quad = [[-e, -e], [e, -e], [e, e], [-e, e]].map(([s, t]) => pt(f.at(r, c, s, t)));
        cells += `<polygon points="${quad.join(' ')}" fill="${f.fill[on ? 1 : 0]}" stroke-linejoin="round"/>`;
      }
    }
    let path = (ISO_ARROWS[base] || []).map(P);
    if (prime) path = path.reverse();
    let arrow = '';
    if (path.length) {
      const [x2, y2] = path[path.length - 1];
      const [x1, y1] = path[path.length - 2];
      const a = Math.atan2(y2 - y1, x2 - x1);
      const tip = [x2 + 3 * Math.cos(a), y2 + 3 * Math.sin(a)];
      const head = 11;
      const h = (d) => `${(tip[0] + head * Math.cos(a + d)).toFixed(2)},${(tip[1] + head * Math.sin(a + d)).toFixed(2)}`;
      const d = path.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
      arrow = `<path d="${d}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<path d="${d}" fill="none" stroke="#c81d5e" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<polygon points="${tip.map((v) => v.toFixed(2)).join(',')} ${h(Math.PI * 0.82)} ${h(-Math.PI * 0.82)}" fill="#c81d5e" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>`;
    }
    const badge = dbl ? '<circle cx="54" cy="54" r="9" fill="#1d2340"/><text x="54" y="58" font-size="11" font-weight="800" text-anchor="middle" fill="#fff">×2</text>' : '';
    return `<svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">${cells}${arrow}${badge}</svg>`;
  }

  function moveIconFlat(m) {
    const base = m[0];
    const prime = m.includes("'");
    const dbl = m.includes('2');
    const sel = {
      U: (r) => r === 0, D: (r) => r === 2, R: (r, c) => c === 2, L: (r, c) => c === 0,
    }[base] || (() => true);
    let cells = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const on = sel(r, c);
      const fill = base === 'B' ? '#e6e9f1' : on ? '#ffd54a' : '#e6e9f1';
      cells += `<rect x="${3 + c * 19}" y="${3 + r * 19}" width="17" height="17" rx="3" fill="${fill}" stroke="#1d2340" stroke-width="1.2" ${base === 'B' ? 'stroke-dasharray="3 2"' : ''}/>`;
    }
    const line = (x1, y1, x2, y2) => {
      const a = Math.atan2(y2 - y1, x2 - x1);
      const h = (d) => `${x2 + 8 * Math.cos(a + d)},${y2 + 8 * Math.sin(a + d)}`;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c81d5e" stroke-width="4" stroke-linecap="round"/>` +
        `<polygon points="${x2 + 3 * Math.cos(a)},${y2 + 3 * Math.sin(a)} ${h(Math.PI * 0.8)} ${h(-Math.PI * 0.8)}" fill="#c81d5e"/>`;
    };
    const arc = (cw) => {
      const r = 19, cx = 31.5, cy = 31.5;
      const a0 = cw ? -2.4 : -0.74, a1 = cw ? 1.6 : -4.74;
      const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [x0, y0] = p(a0);
      const [x1, y1] = p(a1);
      const tang = a1 + (cw ? Math.PI / 2 : -Math.PI / 2);
      const h = (d) => `${x1 + 9 * Math.cos(tang + Math.PI + d)},${y1 + 9 * Math.sin(tang + Math.PI + d)}`;
      return `<path d="M${x0},${y0} A${r},${r} 0 1 ${cw ? 1 : 0} ${x1},${y1}" fill="none" stroke="#c81d5e" stroke-width="4" stroke-linecap="round"/>` +
        `<polygon points="${x1 + 4 * Math.cos(tang)},${y1 + 4 * Math.sin(tang)} ${h(0.5)} ${h(-0.5)}" fill="#c81d5e"/>`;
    };
    let arrow = '';
    if (base === 'U') arrow = prime ? line(10, 12, 50, 12) : line(53, 12, 13, 12);
    else if (base === 'D') arrow = prime ? line(53, 50, 13, 50) : line(10, 50, 50, 50);
    else if (base === 'R') arrow = prime ? line(50, 10, 50, 50) : line(50, 53, 50, 13);
    else if (base === 'L') arrow = prime ? line(12, 53, 12, 13) : line(12, 10, 12, 50);
    else if (base === 'F') arrow = arc(!prime);
    else if (base === 'B') arrow = arc(prime);
    else if (base === 'y') arrow = prime ? line(6, 31, 56, 31) : line(57, 31, 7, 31);
    const badge = dbl ? '<circle cx="54" cy="54" r="9" fill="#1d2340"/><text x="54" y="58" font-size="11" font-weight="800" text-anchor="middle" fill="#fff">×2</text>' : '';
    return `<svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">${cells}${arrow}${badge}</svg>`;
  }

  // ---------- Screens ----------
  const screens = ['home', 'scan', 'review', 'practice', 'solve', 'learn'];
  let currentScreen = 'home';
  function show(name) {
    closePicker();
    screens.forEach((s) => { $('#' + s).hidden = s !== name; });
    if (currentScreen === 'scan' && name !== 'scan') scanner.stop();
    currentScreen = name;
    $('#topRescan').hidden = !(name === 'solve' || name === 'review');
    window.scrollTo(0, 0);
    if (name === 'learn') initLearn();
    if (name === 'home') $('#resumeBtn').hidden = !loadSaved();
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));

  // ---------- Home ----------
  const heroCube = new Cube3D($('#heroCube'), { size: 46, interactive: true });
  heroCube.setState(C.applyMoves(C.solvedState(), C.parseAlg("R U R' U' F2 L D'")));
  (function spin() {
    let i = 0;
    const seq = C.parseAlg("U R F' L D B' U' R'");
    setInterval(() => {
      if (currentScreen !== 'home' || document.hidden) return;
      heroCube.animateMove(seq[i % seq.length], 500);
      i++;
    }, 1300);
  })();

  // ---------- Scanning ----------
  // White goes first: its center tells us the camera's color tint, which corrects every later side.
  // Which way up each side is held does not matter: the app works that out from the pieces.
  const SCAN_STEPS = [
    { face: 'U', rot: "x'", expect: 'W', title: 'Show the side with the {W} center' },
    { face: 'F', rot: '', expect: 'G', title: 'Show the side with the {G} center' },
    { face: 'R', rot: 'y', expect: 'R', title: 'Show the side with the {R} center' },
    { face: 'B', rot: 'y2', expect: 'B', title: 'Show the side with the {B} center' },
    { face: 'L', rot: "y'", expect: 'O', title: 'Show the side with the {O} center' },
    { face: 'D', rot: 'x', expect: 'Y', title: 'Last one! Show the side with the {Y} center' },
  ];
  const list = (items) => `<ol class="how-list">${items.map((t) => `<li>${fmt(t)}</li>`).join('')}</ol>`;

  const scanner = new SC.Scanner($('#videoCanvas'));
  const scanIllus = new Cube3D($('#scanIllus'), { size: 30, interactive: false, mirror: true, rx: -22, ry: -24 });
  let scan = null;

  async function startScan(opts) {
    opts = opts || {};
    scan = { step: 0, samples: {}, only: opts.only || null, fromSolve: !!opts.fromSolve, keep: opts.keep || null };
    if (!scan.only) scanner.roBoundary = null;
    scanner.paused = false;
    if (scan.only) {
      scan.samples = Object.assign({}, scanData.samples);
      scan.step = SCAN_STEPS.findIndex((s) => s.face === scan.only);
    }
    show('scan');
    $('#scanPanel').hidden = false;
    $('#testPanel').hidden = true;
    renderScanStep();
    await openCamera();
  }

  async function openCamera() {
    $('#videoMsg').textContent = 'Starting the camera...';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#videoMsg').innerHTML = 'This browser cannot use the camera here. Try opening the app from <b>http://localhost</b> in Chrome, or use "Paint the colors" instead.';
      return;
    }
    try {
      await scanner.start($('#camSelect').value || undefined);
      $('#videoMsg').textContent = '';
      fillCameraList();
    } catch (e) {
      $('#videoMsg').innerHTML = `I could not open the camera (${e.name || e.message}). Check that the browser is allowed to use it, or use "Paint the colors" instead.`;
    }
  }

  async function fillCameraList() {
    const sel = $('#camSelect');
    const cams = await SC.Scanner.cameras();
    const cur = scanner.stream && scanner.stream.getVideoTracks()[0] && scanner.stream.getVideoTracks()[0].getSettings().deviceId;
    sel.innerHTML = cams.map((c, i) => `<option value="${c.deviceId}">${c.label || 'Camera ' + (i + 1)}</option>`).join('');
    if (cur) sel.value = cur;
  }
  $('#camSelect').addEventListener('change', () => scanner.start($('#camSelect').value).catch(() => {}));
  $('#mirrorChk').addEventListener('change', (e) => { scanner.mirror = e.target.checked; });
  $('#debugChk').checked = scanner.debug = localStorage.getItem('cubeCoachDebug') === '1';
  $('#debugChk').addEventListener('change', (e) => {
    scanner.debug = e.target.checked;
    localStorage.setItem('cubeCoachDebug', e.target.checked ? '1' : '0');
  });

  // Save raw camera colors plus the corrected answer, so the classifier can be tuned on real scans.
  $('#saveScan').addEventListener('click', () => {
    const samples = {};
    C.FACES.forEach((f) => { samples[f] = scanData.samples[f].map((s) => s.rgb.map(Math.round)); });
    const data = {
      version: 1,
      when: new Date().toISOString(),
      mirror: scanner.mirror,
      userAgent: navigator.userAgent,
      samples,
      auto: scanData.auto,
      truth: review.state.slice(),
      valid: C.validate(review.state).ok,
    };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cube-scan-${data.when.replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  function renderScanStep() {
    const st = SCAN_STEPS[scan.step];
    $('#scanStepNum').textContent = scan.only ? 'Rescanning one side' : `Side ${scan.step + 1} of 6`;
    $('#scanTitle').innerHTML = fmt(st.title);
    // First step: calibrate on the white center before the first capture.
    const needCal = scan.step === 0 && !scan.only;
    const confirming = !!scan.pending;
    const intro = scan.step === 0 && scan.fromSolve && !scan.only
      ? `<p>${fmt('No problem! I will work out new steps from wherever your cube is now.')}</p>`
      : '';
    $('#scanText').innerHTML = intro + list([
      `Hold the side with the {${st.expect}} center square up to the camera. Any way up is fine.`,
      'Fill the squares with the stickers and hold still.',
      needCal ? 'Press Calibrate.' : 'Press Capture.',
    ]) + (needCal
      ? `<p class="note-why"><b>Why calibrate?</b> ${fmt('I know the {W} center is white, so it shows me how your camera tints colors. That helps me read every other side.')}</p>`
      : '');
    $('#scanWarn').hidden = true;
    $('#scanBack').disabled = scan.only ? true : scan.step === 0;
    $('#scanCalibrate').hidden = !needCal || confirming;
    $('#captureBtn').hidden = needCal;
    $('#scanConfirm').hidden = !confirming;
    const illus = C.applyMoves(C.solvedState(), C.parseAlg(st.rot || []));
    scanIllus.setState(illus);
    scanIllus.setHighlight([18, 19, 20, 21, 22, 23, 24, 25, 26]);
    const thumbs = SCAN_STEPS.map((s, i) => {
      const smp = scan.samples[s.face];
      const cells = new Array(9).fill(0).map((_, k) => `<i style="${smp ? 'background:' + C.COLOR_HEX[smp[k].guess] : ''}"></i>`).join('');
      return `<div class="thumb ${smp ? 'done' : ''} ${i === scan.step ? 'current' : ''}" title="${s.face}">${cells}</div>`;
    });
    $('#scanThumbs').innerHTML = thumbs.join('');
  }

  function capture() {
    if (currentScreen !== 'scan' || !scan) return;
    const smp = scanner.capture();
    if (!smp) return;
    const st = SCAN_STEPS[scan.step];
    const flash = $('#flash');
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 60);
    const center = smp[4].guess;
    // Same center as an earlier side? Compare measured colors, not guesses, so red and orange stay apart.
    const sameCenter = (a, b) =>
      Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]) < 12 &&
      Math.abs(SC.warmHue(a.rgb) - SC.warmHue(b.rgb)) < 5;
    const dup = Object.entries(scan.samples).find(([f, s]) => f !== st.face && !scan.warned && sameCenter(smp[4], s[4]));
    scan.samples[st.face] = smp;
    if (dup && !scan.only) {
      scan.warned = true;
      $('#scanWarn').innerHTML = fmt(`Hmm, this center looks {${center}}, like a side you already showed me. If this is the right side, press Capture again. If not, turn the cube and try again.`);
      $('#scanWarn').hidden = false;
      delete scan.samples[st.face];
      return;
    }
    scan.warned = false;
    calibrateLive();
    if (scan.only) return finishScan();
    scan.step++;
    if (scan.step >= 6) return finishScan();
    renderScanStep();
  }
  // ---------- One-side color test ----------
  const test = { captures: [] };
  async function startTest() {
    scan = { test: true };
    scanner.roBoundary = null;
    scanner.paused = false;
    show('scan');
    $('#scanPanel').hidden = true;
    $('#testPanel').hidden = false;
    renderCalib();
    renderTest();
    await openCamera();
  }
  function testCapture() {
    const smp = scanner.capture();
    if (!smp) return;
    const flash = $('#flash');
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 60);
    // Samples are in the order of the physical face, as you see it when you look at that side.
    const cells = smp.map((s) => ({ rgb: s.rgb.map(Math.round), guess: s.guess, truth: s.guess }));
    test.captures.unshift({ n: test.captures.length + 1, cells });
    renderTest();
  }
  const hsvText = (raw) => {
    const rgb = SC.applyGains(raw, scanner.gains);
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return { h: Math.round(SC.warmHue(rgb)), s: Math.round(max ? (max - min) / max * 100 : 0), v: Math.round(max * 100) };
  };
  function testReport() {
    const pos = ['top-left', 'top-middle', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-middle', 'bottom-right'];
    return test.captures.slice().reverse().map((cap) => {
      const wrong = cap.cells.filter((c) => c.truth !== c.guess).length;
      const lines = cap.cells.map((c, k) => {
        const t = hsvText(c.rgb);
        return `  ${pos[k].padEnd(13)} real ${c.truth} guess ${c.guess}${c.truth !== c.guess ? ' WRONG' : '      '} h${t.h} s${t.s} v${t.v} rgb(${c.rgb.join(',')})`;
      });
      return `Capture ${cap.n} (${wrong} wrong, mirror ${scanner.mirror ? 'on' : 'off'}):\n${lines.join('\n')}`;
    }).join('\n') + `\nCalibration gains: ${scanner.gains ? scanner.gains.map((x) => x.toFixed(2)).join(' ') : 'none'} (hue, s, v are after calibration; rgb is raw)`;
  }
  function renderCalib() {
    $('#testCalib').textContent = scanner.gains
      ? `Calibrated (color correction ${scanner.gains.map((x) => x.toFixed(2)).join(' / ')}).`
      : 'Not calibrated yet.';
  }
  $('#testCalibrate').addEventListener('click', () => {
    const smp = scanner.capture();
    if (!smp) return;
    const g = SC.gainsFromWhite(smp[4].rgb);
    if (!g) {
      $('#testCalib').textContent = 'That center did not look white. Show the side with the white center square and try again.';
      return;
    }
    setGains(g);
    renderCalib();
    renderTest();
  });
  function renderTest() {
    const box = $('#testResult');
    box.innerHTML = test.captures.map((cap, ci) => {
      const wrong = cap.cells.filter((c) => c.truth !== c.guess).length;
      const cells = cap.cells.map((c, k) => {
        const t = hsvText(c.rgb);
        const fix = c.truth !== c.guess ? `<i class="fix" style="background:${C.COLOR_HEX[c.truth]}"></i>` : '';
        return `<button class="test-cell" data-cap="${ci}" data-k="${k}" style="background:${C.COLOR_HEX[c.guess]}">${fix}<span>h${t.h} s${t.s}</span></button>`;
      }).join('');
      const sw = Object.keys(NAMES).map((c) => `<button class="swatch" data-cap="${ci}" data-set="${c}" style="background:${C.COLOR_HEX[c]}" title="${NAMES[c]}"></button>`).join('');
      return `<div class="test-capture"><h4>Capture ${cap.n}: ${wrong ? wrong + ' wrong' : 'all as guessed'}</h4>
        <div class="test-grid">${cells}</div>
        <div class="test-pick">Tap a wrong square to fix it, or set all 9 to: ${sw}</div></div>`;
    }).join('') || '<p class="hint">No captures yet.</p>';
    $('#testCopy').disabled = !test.captures.length;
    const ta = $('#testText');
    ta.hidden = !test.captures.length;
    ta.value = testReport();
  }
  $('#testResult').addEventListener('click', (e) => {
    const el = e.target.closest('[data-cap]');
    if (!el) return;
    const cap = test.captures[+el.dataset.cap];
    if (el.dataset.k !== undefined) {
      const k = +el.dataset.k;
      pickColor(el, cap.cells[k].truth, (c) => {
        cap.cells[k].truth = c;
        renderTest();
      });
      return;
    }
    if (el.dataset.set) cap.cells.forEach((cell) => { cell.truth = el.dataset.set; });
    renderTest();
  });
  $('#testCapture').addEventListener('click', testCapture);
  $('#testCopy').addEventListener('click', async () => {
    const txt = testReport();
    try {
      await navigator.clipboard.writeText(txt);
      $('#testCopy').textContent = 'Copied!';
    } catch (e) {
      $('#testText').select();
      document.execCommand('copy');
      $('#testCopy').textContent = 'Copied!';
    }
    setTimeout(() => { $('#testCopy').textContent = 'Copy results'; }, 1500);
  });
  $('#testExit').addEventListener('click', () => show('home'));
  $('#testStart').addEventListener('click', startTest);
  $('#homeTest').addEventListener('click', startTest);

  // Once the red and orange sides are in, split the live dots halfway between their center hues.
  function setGains(g) {
    if (!g) return;
    scanner.gains = g;
    try { localStorage.setItem('cubeCoachGains', JSON.stringify(g)); } catch (e) { /* ignore */ }
  }
  try {
    const g = JSON.parse(localStorage.getItem('cubeCoachGains'));
    if (Array.isArray(g) && g.length === 3) scanner.gains = g;
  } catch (e) { /* ignore */ }

  function calibrateLive() {
    const r = scan.samples.R, o = scan.samples.L;
    if (!r || !o) return;
    const hr = SC.warmHue(SC.applyGains(r[4].rgb, scanner.gains)), ho = SC.warmHue(SC.applyGains(o[4].rgb, scanner.gains));
    if (Math.abs(ho - hr) < 4 || Math.abs(ho - hr) > 60) return;
    scanner.roBoundary = (hr + ho) / 2;
  }
  function scanCalibrate() {
    if (currentScreen !== 'scan' || !scan) return;
    const smp = scanner.capture();
    if (!smp) return;
    const g = SC.gainsFromWhite(smp[4].rgb);
    if (!g) {
      $('#scanWarn').innerHTML = fmt('That center square did not look {W}. Show the side with the {W} center square, fill the squares, and press Calibrate again.');
      $('#scanWarn').hidden = false;
      return;
    }
    setGains(g);
    // Redraw this frame with the new calibration, freeze it, and ask for a check before saving.
    scanner.frame();
    scanner.paused = true;
    scan.pending = scanner.capture();
    const flash = $('#flash');
    flash.classList.add('on');
    setTimeout(() => flash.classList.remove('on'), 60);
    renderScanStep();
  }
  function confirmFirst(ok) {
    if (!scan || !scan.pending) return;
    const smp = scan.pending;
    scan.pending = null;
    scanner.paused = false;
    if (!ok) {
      renderScanStep();
      $('#scanWarn').innerHTML = fmt('OK! Try brighter, even light with no glare, hold the side so the stickers fill the squares, and press Calibrate again.');
      $('#scanWarn').hidden = false;
      return;
    }
    scan.samples[SCAN_STEPS[0].face] = smp;
    scan.step = 1;
    renderScanStep();
  }
  $('#confirmYes').addEventListener('click', () => confirmFirst(true));
  $('#confirmNo').addEventListener('click', () => confirmFirst(false));
  $('#scanCalibrate').addEventListener('click', scanCalibrate);
  $('#captureBtn').addEventListener('click', capture);
  $('#scanBack').addEventListener('click', () => {
    if (!scan || scan.step === 0) return;
    scan.step--;
    delete scan.samples[SCAN_STEPS[scan.step].face];
    renderScanStep();
  });

  // Data from the most recent scan, kept so a single side can be rescanned.
  let scanData = { samples: null };

  function finishScan() {
    scanner.stop();
    if (scan.only) return finishSideRescan();
    const faces = {};
    C.FACES.forEach((f) => { faces[f] = scan.samples[f].map((s) => s.rgb); });
    scanData.samples = scan.samples;
    const out = SC.classifyScan(faces);
    let note = null;
    let final = out.state;
    if (out.final) {
      final = out.final;
      const bits = [];
      if (out.fixes.length) bits.push('I fixed a small scanning mix-up: ' + out.fixes.join(' and ') + '.');
      if (out.changed.length) bits.push(`${out.changed.length} squares were hard to read (probably {R} vs {O}), so I picked the colors that make a real cube.`);
      note = bits.join(' ') || null;
    }
    scanData.auto = final.slice();
    openReview(final, { source: 'scan', note });
  }

  // ---------- Review / paint ----------
  let review = { state: null, sel: 'W', source: 'scan' };
  const reviewCube = new Cube3D($('#reviewCube'), { size: 50 });
  const NET_POS = { U: [1, 2], L: [2, 1], F: [2, 2], R: [2, 3], B: [2, 4], D: [3, 2] };
  const FACE_LABEL = { U: 'Top', D: 'Bottom', F: 'Front', B: 'Back', L: 'Left', R: 'Right' };

  // Small popup of the six colors, shown next to the square that was tapped.
  let picker = null;
  function closePicker() {
    if (picker) picker.remove();
    picker = null;
  }
  function pickColor(anchor, current, onPick) {
    closePicker();
    const box = document.createElement('div');
    box.className = 'picker';
    box.setAttribute('role', 'dialog');
    box.innerHTML = Object.keys(NAMES).map((c) =>
      `<button class="${c === current ? 'cur' : ''}" data-c="${c}" style="background:${C.COLOR_HEX[c]}" title="${NAMES[c]}" aria-label="${NAMES[c]}"></button>`).join('');
    document.body.appendChild(box);
    const r = anchor.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = r.top - h - 8;
    box.style.left = left + window.scrollX + 'px';
    box.style.top = top + window.scrollY + 'px';
    box.addEventListener('click', (e) => {
      const c = e.target.dataset.c;
      if (!c) return;
      closePicker();
      onPick(c);
    });
    picker = box;
    box.querySelector('button').focus();
  }
  document.addEventListener('pointerdown', (e) => {
    if (picker && !picker.contains(e.target) && !e.target.closest('[data-i],[data-k]')) closePicker();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePicker(); });
  window.addEventListener('resize', closePicker);

  function openReview(state, opts) {
    review.state = state.slice();
    review.source = opts.source;
    review.note = opts.note || null;
    const cU = state[C.centerIndex('U')];
    const cF = state[C.centerIndex('F')];
    if (opts.source === 'manual') {
      $('#reviewTitle').textContent = 'Paint your cube';
      $('#reviewIntro').innerHTML = list([
        `Hold your cube with the {${cU}} center on top and the {${cF}} center facing you.`,
        'Tap each square and choose its color, until the picture matches your cube.',
      ]) + '<p class="hint">The top side is drawn the way you see it when you tip the cube toward you. The bottom side is drawn the way you see it when you tip the cube away from you.</p>';
    } else {
      $('#reviewTitle').textContent = 'Check the colors';
      $('#reviewIntro').innerHTML = `<p>${fmt(`Here is what I saw, with {${cU}} on top and {${cF}} in front.`)}</p>` + list([
        'If a square is wrong, tap it and choose the right color.',
        'Drag the 3D cube to compare it with yours.',
      ]);
    }
    $('#reviewRescan').textContent = opts.source === 'manual' ? '📷 Use the camera instead' : '📷 Scan again';
    renderNet();
    show('review');
  }

  function renderNet() {
    const v = C.validate(review.state);
    const bad = new Set();
    v.errors.forEach((e) => (e.stickers || []).forEach((i) => bad.add(i)));
    const canRescanFace = review.source === 'scan' && scanData.samples;
    let html = '';
    C.FACES.forEach((f, fi) => {
      const [r, c] = NET_POS[f];
      html += `<div class="net-face" style="grid-row:${r};grid-column:${c}">`;
      html += `<span class="lbl">${FACE_LABEL[f]}${canRescanFace ? ` · <button class="link" data-rescan="${f}">rescan</button>` : ''}</span>`;
      for (let k = 0; k < 9; k++) {
        const i = fi * 9 + k;
        const col = review.state[i];
        html += `<button class="net-sticker ${bad.has(i) ? 'bad' : ''}" data-i="${i}" style="background:${col ? C.COLOR_HEX[col] : '#666'}" aria-label="${FACE_LABEL[f]} ${k + 1}"></button>`;
      }
      html += '</div>';
    });
    $('#net').innerHTML = html;
    reviewCube.setState(review.state);
    reviewCube.setHighlight([...bad]);
    const status = $('#reviewStatus');
    if (v.ok) {
      status.className = 'review-status ok';
      status.innerHTML = (review.note ? fmt(review.note) + '<br>' : '') + 'Everything looks good! This is a real cube that can be solved.';
    } else {
      status.className = 'review-status bad';
      const msgs = [...new Set(v.errors.map((e) => e.msg))].slice(0, 3).map(fmt);
      status.innerHTML = msgs.join('<br>') + (bad.size ? '<br><small>The pink squares are the ones to check.</small>' : '');
    }
    $('#solveBtn').disabled = !v.ok;
    $('#saveScanRow').hidden = !(review.source === 'scan' && scanData.samples && scanData.auto);
  }

  $('#net').addEventListener('click', (e) => {
    const rf = e.target.dataset.rescan;
    if (rf) return startScan({ only: rf });
    const i = e.target.dataset.i;
    if (i === undefined) return;
    pickColor(e.target, review.state[+i], (c) => {
      review.state[+i] = c;
      review.note = null;
      renderNet();
    });
  });

  // Single-side rescan: classify just that side against the stored centers.
  function finishSideRescan() {
    const f = scan.only;
    const centersLab = {};
    C.FACES.forEach((g) => { centersLab[review.state[C.centerIndex(g)]] = scanData.samples[g][4].lab; });
    const fresh = scan.samples[f];
    scanData.samples[f] = fresh;
    const dist = (a, b) => Math.hypot((a[0] - b[0]) * 0.5, a[1] - b[1], a[2] - b[2]);
    const fi = C.FACES.indexOf(f);
    const next = review.state.slice();
    const centerRgb = {};
    const fix = (rgb) => SC.applyGains(rgb, scanner.gains);
    C.FACES.forEach((g) => { centerRgb[review.state[C.centerIndex(g)]] = fix(scanData.samples[g][4].rgb); });
    const roMid = centerRgb.R && centerRgb.O ? (SC.warmHue(centerRgb.R) + SC.warmHue(centerRgb.O)) / 2 : null;
    fresh.forEach((s, k) => {
      if (k === 4) return;
      let best = null;
      for (const [col, lab] of Object.entries(centersLab)) {
        const d = dist(s.lab, lab);
        if (!best || d < best.d) best = { d, col };
      }
      // Red and orange are told apart by hue, which survives lighting changes better.
      if ((best.col === 'R' || best.col === 'O') && roMid !== null) best.col = SC.warmHue(fix(s.rgb)) < roMid ? 'R' : 'O';
      next[fi * 9 + k] = best.col;
    });
    // The side may have been held any way up: keep the quarter turn that makes a real cube, or else
    // the one with the fewest problems.
    const cells = next.slice(fi * 9, fi * 9 + 9);
    let pick = null;
    for (let k = 0; k < 4; k++) {
      const s = next.slice();
      s.splice(fi * 9, 9, ...C.rotateFaceGrid(cells, k));
      const n = C.validate(s).errors.length;
      if (!pick || n < pick.n) pick = { n, s };
      if (!n) break;
    }
    scanData.auto = pick.s.slice();
    openReview(pick.s, { source: 'scan' });
  }

  $('#reviewRescan').addEventListener('click', () => startScan({ fromSolve: !!plan }));
  $('#solveBtn').addEventListener('click', () => startSolve(review.state));

  $('#goScan').addEventListener('click', () => startScan());
  $('#goManual').addEventListener('click', () => openReview(C.solvedState(), { source: 'manual' }));

  // ---------- Practice ----------
  let practice = { moves: [] };
  const practiceCube = new Cube3D($('#practiceCube'), { size: 50 });
  function newScramble() {
    practice.moves = C.randomScramble(20);
    $('#scrambleMoves').innerHTML = practice.moves.map((m) => moveChip(m, '')).join('');
    practiceCube.setState(C.applyMoves(C.solvedState(), practice.moves));
  }
  $('#goPractice').addEventListener('click', () => { newScramble(); show('practice'); });
  $('#newScramble').addEventListener('click', newScramble);
  $('#showScramble').addEventListener('click', async () => {
    const btn = $('#showScramble');
    btn.disabled = true;
    practiceCube.setState(C.solvedState());
    const chips = document.querySelectorAll('#scrambleMoves .mv');
    for (let k = 0; k < practice.moves.length; k++) {
      chips.forEach((c, j) => { c.classList.toggle('now', j === k); c.classList.toggle('done', j < k); });
      await practiceCube.animateMove(practice.moves[k], 380);
    }
    chips.forEach((c) => { c.classList.remove('now'); c.classList.remove('done'); });
    btn.disabled = false;
  });
  $('#practiceSolve').addEventListener('click', () => startSolve(C.applyMoves(C.solvedState(), practice.moves)));

  function moveChip(m, cls) {
    return `<span class="mv ${cls}">${moveIcon(m)}<b>${m}</b></span>`;
  }

  // ---------- Solve ----------
  let plan = null;
  let timeline = [];
  let pos = 0;
  let busy = false;
  const solveCube = new Cube3D($('#solveCube'), { size: 62 });

  function buildTimeline(p) {
    const tl = [];
    let s = p.start;
    p.stages.forEach((st, si) => {
      tl.push({ type: 'intro', stage: si, state: s });
      st.steps.forEach((step, pi) => {
        step.moves.forEach((m, mi) => {
          tl.push({ type: 'move', stage: si, step: pi, mi, move: m, state: s });
          s = C.applyMove(s, m);
        });
      });
    });
    tl.push({ type: 'done', stage: p.stages.length, state: s });
    return tl;
  }

  function startSolve(state, resumePos) {
    try {
      plan = S.solve(state);
    } catch (e) {
      console.error(e);
      if (e.validation) return openReview(state, { source: 'scan' });
      plan = null;
      timeline = [];
      pos = 0;
      $('#stageBar').innerHTML = '';
      show('solve');
      alertBox('Something went wrong working out the solution. Try scanning again.');
      return;
    }
    plan.input = state.slice();
    timeline = buildTimeline(plan);
    pos = resumePos && resumePos < timeline.length ? resumePos : 0;
    solveCube.setState(timeline[pos].state);
    solveCube.setView(-28, -38);
    show('solve');
    renderSolve();
  }

  function alertBox(msg) {
    const p = $('#stepPanel');
    p.innerHTML = `<p class="step-text">${fmt(msg)}</p>`;
  }

  function save() {
    try {
      localStorage.setItem('cubeCoach', JSON.stringify({ input: plan.input, pos }));
    } catch (e) { /* storage may be unavailable */ }
  }
  function loadSaved() {
    try {
      const d = JSON.parse(localStorage.getItem('cubeCoach'));
      return d && d.input && d.input.length === 54 ? d : null;
    } catch (e) {
      return null;
    }
  }
  $('#resumeBtn').addEventListener('click', () => {
    const d = loadSaved();
    if (d) startSolve(d.input, d.pos);
  });

  function renderStageBar(activeStage) {
    $('#stageBar').innerHTML = plan.stages.map((st, i) =>
      `<li class="${i < activeStage ? 'done' : i === activeStage ? 'active' : ''}">${st.short}</li>`).join('');
  }

  function stepMovesHtml(step, current) {
    const parts = [];
    const algLen = step.repeat ? step.moves.length / step.repeat : step.moves.length;
    step.moves.forEach((m, i) => {
      if (step.repeat && i && i % algLen === 0) parts.push('<span class="mv-sep"></span>');
      const cls = current === undefined ? '' : i < current ? 'done' : i === current ? 'now' : '';
      parts.push(moveChip(m, cls));
    });
    return `<div class="moves-list">${parts.join('')}</div>`;
  }

  function pieceStickers(state, cols) {
    const list = cols.length === 2 ? C.EDGES : C.CORNERS;
    const hit = list.find((p) => cols.every((c) => p.some((i) => state[i] === c)));
    return hit || [];
  }

  function renderSolve() {
    const e = timeline[pos];
    renderStageBar(e.stage);
    const focus = e.type === 'move' && plan.stages[e.stage].steps[e.step].focus;
    solveCube.setHighlight(focus ? pieceStickers(e.state, focus) : []);
    const panel = $('#stepPanel');
    const total = timeline.filter((t) => t.type === 'move').length;
    const doneMoves = timeline.slice(0, pos).filter((t) => t.type === 'move').length;
    const progress = `<div class="step-count">Move ${doneMoves} of ${total}</div>`;
    const nav = (nextLabel, extra) => `<div class="btn-row">
        <button class="btn ghost" id="backBtn" ${pos === 0 ? 'disabled' : ''}>◀ Back</button>
        <button class="btn primary huge" id="nextBtn">${nextLabel}</button>
        ${extra || ''}
      </div>`;

    if (e.type === 'intro') {
      const st = plan.stages[e.stage];
      const hold = st.id === 'hold';
      let body = `<div class="stage-tag">${hold ? 'Before we start' : 'New step'}</div>
        <h2>${fmt(st.title)}</h2>
        <p class="goal">${fmt(st.goal)}</p>`;
      if (st.steps.length || hold) {
        body += `<div class="explain"><h4>How</h4><ol>${st.how.map((h) => `<li>${fmt(h)}</li>`).join('')}</ol></div>`;
      }
      body += `<div class="explain why"><h4>Why it works</h4><p>${fmt(st.why)}</p></div>`;
      if (hold) body += '<p class="hint">The cube picture shows your cube held this way. Drag it to look around, or use "Peek at the back".</p>';
      else if (!st.steps.length) body += `<p class="step-text">${fmt('Good news: this step is already done on your cube! 🎉')}</p>`;
      else if (e.stage > 1) body += '<p class="hint">Check: your cube should look like the picture right now.</p>';
      panel.innerHTML = body + nav(hold ? "I'm holding it like that ▶" : !st.steps.length ? 'Next step ▶' : "Let's go ▶") + progress;
    } else if (e.type === 'move') {
      const st = plan.stages[e.stage];
      const step = st.steps[e.step];
      const task = st.tasks[step.task];
      const [title, sub] = MOVE_TEXT[e.move] || [e.move, ''];
      const isRot = e.move[0] === 'y';
      const header = step.repeat
        ? `<div class="repeat-head"><b>Repeat ${step.alg}</b><span class="repeat-tag">× ${step.repeat}</span></div>`
        : '';
      const round = step.repeat ? ` <small>(round ${Math.floor(e.mi / (step.moves.length / step.repeat)) + 1} of ${step.repeat})</small>` : '';
      // The part's steps as a checklist: earlier ones ticked, the current one opened up.
      const items = st.steps.map((s, i) => ({ s, i })).filter(({ s }) => s.task === step.task).map(({ s, i }) => {
        if (i !== e.step) return `<li class="${i < e.step ? 'done' : ''}">${fmt(s.text)}</li>`;
        return `<li class="now">${fmt(s.text)}
          ${s.why ? `<div class="step-why"><b>Why:</b> ${fmt(s.why)}</div>` : ''}
          ${header}${stepMovesHtml(s, e.mi)}</li>`;
      }).join('');
      panel.innerHTML = `<div class="stage-tag">${fmt(st.title)}</div>
        <div class="task">
          <div class="task-head"><h3>${fmt(task.title)}</h3><span class="task-count">Part ${step.task + 1} of ${st.tasks.length}</span></div>
          ${task.note ? `<p class="task-note">${fmt(task.note)}</p>` : ''}
          <ol class="task-steps">${items}</ol>
        </div>
        <div class="now-card ${isRot ? 'rotate-card' : ''}">
          ${moveIcon(e.move).replace('width="48" height="48"', 'width="72" height="72"')}
          <div class="big-move">${e.move}</div>
          <div class="desc">${title}${round}<small>${sub}</small></div>
        </div>` +
        nav('Show me ▶', step.moves.length - e.mi > 1 ? '<button class="btn ghost" id="stepBtn">Do the rest ⏩</button>' : '') +
        `<p class="hint">Watch the cube, then do the same move on your real cube. ${focus ? 'The piece we are working on has a pink outline. ' : ''}Keys: → next, ← back.</p>` + progress;
    } else {
      panel.innerHTML = `<div class="celebrate">
          <div class="trophy">🏆</div>
          <h2>You solved the Rubik's Cube!</h2>
          <p class="goal">Amazing work. The more you practice, the more the moves stick in your memory. Soon you won't need the app!</p>
          <div class="btn-row" style="justify-content:center">
            <button class="btn ghost" id="backBtn">◀ Back</button>
            <button class="btn primary huge" id="againBtn">Solve another one</button>
          </div>
        </div>`;
      $('#againBtn').addEventListener('click', () => show('home'));
      confetti();
    }
    const nb = $('#nextBtn');
    if (nb) nb.addEventListener('click', next);
    const bb = $('#backBtn');
    if (bb) bb.addEventListener('click', back);
    const sb = $('#stepBtn');
    if (sb) sb.addEventListener('click', doRestOfStep);
    // A finished solve is not worth resuming.
    if (e.type !== 'done') save();
    else try { localStorage.removeItem('cubeCoach'); } catch (err) { /* storage may be unavailable */ }
  }

  async function next() {
    if (busy || pos >= timeline.length - 1) return;
    const e = timeline[pos];
    if (e.type === 'move') {
      busy = true;
      setButtons(false);
      await solveCube.animateMove(e.move);
      busy = false;
    }
    pos++;
    solveCube.setState(timeline[pos].state);
    renderSolve();
  }

  async function back() {
    if (busy || pos === 0) return;
    pos--;
    const e = timeline[pos];
    if (e.type === 'move') {
      busy = true;
      setButtons(false);
      solveCube.setState(timeline[pos + 1].state);
      await solveCube.animateMove(C.invertMove(e.move));
      busy = false;
    }
    solveCube.setState(e.state);
    renderSolve();
  }

  async function doRestOfStep() {
    if (busy) return;
    const start = timeline[pos];
    busy = true;
    setButtons(false);
    while (pos < timeline.length - 1) {
      const e = timeline[pos];
      if (e.type !== 'move' || e.stage !== start.stage || e.step !== start.step) break;
      document.querySelectorAll('#stepPanel .mv').forEach((el, i) => {
        el.classList.toggle('done', i < e.mi);
        el.classList.toggle('now', i === e.mi);
      });
      await solveCube.animateMove(e.move);
      pos++;
    }
    busy = false;
    solveCube.setState(timeline[pos].state);
    renderSolve();
  }

  function setButtons(on) {
    document.querySelectorAll('#stepPanel .btn').forEach((b) => { b.disabled = !on; });
  }

  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (currentScreen === 'scan' && (e.code === 'Space' || e.code === 'Enter')) {
      e.preventDefault();
      if (scan && scan.test) testCapture();
      else if (scan && scan.pending) confirmFirst(true);
      else if (scan && scan.step === 0 && !scan.only) scanCalibrate();
      else capture();
    } else if (currentScreen === 'solve') {
      if (e.code === 'ArrowRight' || e.code === 'Space') { e.preventDefault(); next(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); back(); }
    }
  });

  $('#viewFront').addEventListener('click', () => solveCube.setView(-28, -38, true));
  $('#viewBack').addEventListener('click', () => solveCube.setView(-28, 142, true));
  $('#speed').addEventListener('input', (e) => { solveCube.speed = +e.target.value; });
  $('#solveRescan').addEventListener('click', () => startScan({ fromSolve: true }));
  $('#topRescan').addEventListener('click', () => startScan({ fromSolve: !!plan }));
  $('#solveFix').addEventListener('click', () => openReview(timeline[pos].state, { source: 'manual' }));

  function confetti() {
    const box = $('#confetti');
    const cols = Object.values(C.COLOR_HEX);
    box.innerHTML = '';
    for (let i = 0; i < 120; i++) {
      const el = document.createElement('i');
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = cols[i % cols.length];
      el.style.animationDuration = 2 + Math.random() * 2.5 + 's';
      el.style.animationDelay = Math.random() * 0.8 + 's';
      box.appendChild(el);
    }
    setTimeout(() => { box.innerHTML = ''; }, 6000);
  }

  // ---------- Learn ----------
  let learnCube = null;
  const LEARN_MOVES = ['R', "R'", 'L', "L'", 'U', "U'", 'D', "D'", 'F', "F'", 'B', "B'", 'R2', 'U2', 'y', "y'"];
  function renderLearnGrid() {
    $('#learnGrid').innerHTML = LEARN_MOVES.map((m) =>
      `<button class="learn-btn" data-m="${m}">${moveIcon(m)}<span><b>${m}</b><small>${MOVE_TEXT[m][0]}</small></span></button>`).join('');
  }

  // ---------- Move picture style ----------
  function syncIconToggles() {
    document.querySelectorAll('.icon-style [data-style]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.style === iconStyle));
    });
  }
  document.querySelectorAll('.icon-style').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-style]');
    if (!b || b.dataset.style === iconStyle) return;
    iconStyle = b.dataset.style;
    try { localStorage.setItem('cubeCoachIcons', iconStyle); } catch (err) { /* storage may be unavailable */ }
    syncIconToggles();
    if (learnCube) renderLearnGrid();
    if (practice.moves.length) $('#scrambleMoves').innerHTML = practice.moves.map((m) => moveChip(m, '')).join('');
    if (currentScreen === 'solve' && plan && !busy && timeline[pos] && timeline[pos].type !== 'done') renderSolve();
  }));
  syncIconToggles();
  function initLearn() {
    if (learnCube) return;
    learnCube = new Cube3D($('#learnCube'), { size: 54 });
    renderLearnGrid();
    let learnBusy = false;
    $('#learnGrid').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-m]');
      if (!b || learnBusy) return;
      learnBusy = true;
      const m = b.dataset.m;
      $('#learnCaption').innerHTML = `<b>${m}</b>: ${MOVE_TEXT[m][0]}. ${MOVE_TEXT[m][1]}`;
      await learnCube.animateMove(m, 700);
      learnBusy = false;
    });
    $('#learnReset').addEventListener('click', () => learnCube.setState(C.solvedState()));
  }

  window.cubeCoachDebug = { scanner, testCapture };
  show('home');
})();
