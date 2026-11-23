// Cube model: 54 stickers, moves derived from 3D geometry so the permutations are never hand-typed.
// Facelet order is U, R, F, D, L, B; each face is row-major as seen in the standard unfolded net.
(function (root) {
  'use strict';

  const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  const NORMAL = {
    U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1],
    D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1],
  };
  const OPPOSITE = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

  // x points right, y up, z toward the viewer (front).
  function facePos(face, r, c) {
    switch (face) {
      case 'U': return [c - 1, 1, r - 1];
      case 'D': return [c - 1, -1, 1 - r];
      case 'F': return [c - 1, 1 - r, 1];
      case 'B': return [1 - c, 1 - r, -1];
      case 'R': return [1, 1 - r, 1 - c];
      case 'L': return [-1, 1 - r, c - 1];
    }
    throw new Error('bad face ' + face);
  }

  const vkey = (v) => v.join(',');
  const STICKERS = [];
  FACES.forEach((face, f) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        STICKERS.push({ index: f * 9 + r * 3 + c, face, row: r, col: c, pos: facePos(face, r, c), normal: NORMAL[face] });
      }
    }
  });
  const LOOKUP = new Map();
  STICKERS.forEach((s) => LOOKUP.set(vkey(s.pos) + '|' + vkey(s.normal), s.index));
  function stickerAt(pos, normal) {
    return LOOKUP.get(vkey(pos) + '|' + vkey(normal));
  }

  // Rotate v by -90 degrees about unit axis k (clockwise when looking at the face from outside).
  function rotVec(v, k) {
    const cx = k[1] * v[2] - k[2] * v[1];
    const cy = k[2] * v[0] - k[0] * v[2];
    const cz = k[0] * v[1] - k[1] * v[0];
    const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    return [-cx + k[0] * d, -cy + k[1] * d, -cz + k[2] * d];
  }

  const MOVE_DEFS = {
    U: { axis: [0, 1, 0], layer: (p) => p[1] === 1 },
    D: { axis: [0, -1, 0], layer: (p) => p[1] === -1 },
    R: { axis: [1, 0, 0], layer: (p) => p[0] === 1 },
    L: { axis: [-1, 0, 0], layer: (p) => p[0] === -1 },
    F: { axis: [0, 0, 1], layer: (p) => p[2] === 1 },
    B: { axis: [0, 0, -1], layer: (p) => p[2] === -1 },
    M: { axis: [-1, 0, 0], layer: (p) => p[0] === 0 },
    E: { axis: [0, -1, 0], layer: (p) => p[1] === 0 },
    S: { axis: [0, 0, 1], layer: (p) => p[2] === 0 },
    x: { axis: [1, 0, 0], layer: () => true },
    y: { axis: [0, 1, 0], layer: () => true },
    z: { axis: [0, 0, 1], layer: () => true },
  };

  // perm[i] = where the sticker currently at i ends up.
  const PERMS = {};
  const compose = (p, q) => p.map((j) => q[j]);
  Object.keys(MOVE_DEFS).forEach((name) => {
    const def = MOVE_DEFS[name];
    const p = STICKERS.map((s) => (def.layer(s.pos) ? stickerAt(rotVec(s.pos, def.axis), rotVec(s.normal, def.axis)) : s.index));
    const p2 = compose(p, p);
    PERMS[name] = p;
    PERMS[name + '2'] = p2;
    PERMS[name + "'"] = compose(p2, p);
  });

  function applyMove(state, move) {
    const p = PERMS[move];
    if (!p) throw new Error('Unknown move ' + move);
    const out = new Array(54);
    for (let i = 0; i < 54; i++) out[p[i]] = state[i];
    return out;
  }

  function applyMoves(state, moves) {
    let s = state;
    for (const m of moves) s = applyMove(s, m);
    return s;
  }

  function parseAlg(str) {
    if (Array.isArray(str)) return str.slice();
    return str
      .replace(/[’′`]/g, "'")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace("2'", '2'))
      .map((t) => {
        if (!PERMS[t]) throw new Error('Unknown move ' + t);
        return t;
      });
  }

  function invertMove(m) {
    if (m.endsWith('2')) return m;
    if (m.endsWith("'")) return m.slice(0, -1);
    return m + "'";
  }

  function invertAlg(moves) {
    return parseAlg(moves).reverse().map(invertMove);
  }

  // Pieces: group stickers by cubie position.
  const byPos = new Map();
  STICKERS.forEach((s) => {
    const k = vkey(s.pos);
    if (!byPos.has(k)) byPos.set(k, []);
    byPos.get(k).push(s.index);
  });
  const PRIORITY = { U: 0, D: 0, F: 1, B: 1, R: 2, L: 2 };
  const EDGES = [];
  const CORNERS = [];
  const det3 = (a, b, c) =>
    a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  byPos.forEach((list) => {
    if (list.length === 2) {
      list.sort((a, b) => PRIORITY[STICKERS[a].face] - PRIORITY[STICKERS[b].face]);
      EDGES.push(list);
    } else if (list.length === 3) {
      list.sort((a, b) => PRIORITY[STICKERS[a].face] - PRIORITY[STICKERS[b].face]);
      const [a, b, c] = list;
      if (det3(STICKERS[a].normal, STICKERS[b].normal, STICKERS[c].normal) < 0) CORNERS.push([a, c, b]);
      else CORNERS.push([a, b, c]);
    }
  });

  const SCHEME = { U: 'W', R: 'R', F: 'G', D: 'Y', L: 'O', B: 'B' };
  const COLOR_NAMES = { W: 'white', Y: 'yellow', G: 'green', B: 'blue', R: 'red', O: 'orange' };
  const COLOR_HEX = { W: '#ffffff', Y: '#ffd500', G: '#00a05a', B: '#0a55c8', R: '#c8102e', O: '#ff6a00' };
  const COLOR_OPPOSITE = { W: 'Y', Y: 'W', G: 'B', B: 'G', R: 'O', O: 'R' };

  function solvedState() {
    return STICKERS.map((s) => SCHEME[s.face]);
  }

  const centerIndex = (face) => FACES.indexOf(face) * 9 + 4;

  function isSolved(state) {
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 9; i++) if (state[f * 9 + i] !== state[f * 9 + 4]) return false;
    }
    return true;
  }

  function parity(perm) {
    const seen = new Array(perm.length).fill(false);
    let swaps = 0;
    for (let i = 0; i < perm.length; i++) {
      if (seen[i]) continue;
      let j = i;
      let len = 0;
      while (!seen[j]) {
        seen[j] = true;
        j = perm[j];
        len++;
      }
      swaps += len - 1;
    }
    return swaps % 2;
  }

  // Checks that a colored state is a real, solvable cube. Errors carry sticker indices to highlight.
  function validate(state) {
    const errors = [];
    const centers = FACES.map((f) => state[centerIndex(f)]);
    if (centers.some((c) => !c)) {
      errors.push({ code: 'blank', msg: 'Some stickers have no color yet.', stickers: [] });
      return { ok: false, errors };
    }
    if (new Set(centers).size !== 6) {
      errors.push({
        code: 'centers',
        msg: 'Two sides have the same center color. Every side of the cube has a different center.',
        stickers: FACES.map(centerIndex),
      });
      return { ok: false, errors };
    }
    const blank = [];
    state.forEach((c, i) => { if (!c) blank.push(i); });
    if (blank.length) {
      errors.push({ code: 'blank', msg: 'Some stickers have no color yet.', stickers: blank });
      return { ok: false, errors };
    }
    const counts = {};
    state.forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
    for (const c of Object.keys(counts)) {
      if (!centers.includes(c)) {
        const st = [];
        state.forEach((x, i) => { if (x === c) st.push(i); });
        errors.push({ code: 'count', msg: `A color that is not on any center was found.`, stickers: st });
      }
    }
    for (const c of centers) {
      const n = counts[c] || 0;
      if (n !== 9) {
        const st = [];
        state.forEach((x, i) => { if (x === c) st.push(i); });
        errors.push({ code: 'count', color: c, count: n, msg: `There should be 9 {${c}} stickers but there ${n === 1 ? 'is' : 'are'} ${n}.`, stickers: n > 9 ? st : [] });
      }
    }
    if (errors.length) return { ok: false, errors };

    const colorFace = {};
    centers.forEach((c, i) => { colorFace[c] = FACES[i]; });
    const f = state.map((c) => colorFace[c]);

    const cornerHome = CORNERS.map((cs) => cs.map((i) => STICKERS[i].face));
    const edgeHome = EDGES.map((es) => es.map((i) => STICKERS[i].face));
    const cornerPerm = [];
    const edgePerm = [];
    let twist = 0;
    let flip = 0;
    const cornerSeen = {};
    const edgeSeen = {};
    CORNERS.forEach((cs, k) => {
      const t = cs.map((i) => f[i]);
      let found = -1;
      let ori = 0;
      cornerHome.forEach((h, j) => {
        for (let o = 0; o < 3; o++) {
          if (t[o] === h[0] && t[(o + 1) % 3] === h[1] && t[(o + 2) % 3] === h[2]) { found = j; ori = o; }
        }
      });
      if (found < 0) {
        errors.push({ code: 'badCorner', msg: 'This corner has colors that cannot be on a real corner piece.', stickers: cs });
      } else if (cornerSeen[found] !== undefined) {
        errors.push({ code: 'dupCorner', msg: 'Two corners have the same colors.', stickers: cs.concat(CORNERS[cornerSeen[found]]) });
      } else {
        cornerSeen[found] = k;
      }
      cornerPerm.push(found);
      twist += ori;
    });
    EDGES.forEach((es, k) => {
      const t = es.map((i) => f[i]);
      let found = -1;
      let ori = 0;
      edgeHome.forEach((h, j) => {
        if (t[0] === h[0] && t[1] === h[1]) { found = j; ori = 0; }
        if (t[0] === h[1] && t[1] === h[0]) { found = j; ori = 1; }
      });
      if (found < 0) {
        errors.push({ code: 'badEdge', msg: 'This edge has colors that cannot be on a real edge piece.', stickers: es });
      } else if (edgeSeen[found] !== undefined) {
        errors.push({ code: 'dupEdge', msg: 'Two edges have the same colors.', stickers: es.concat(EDGES[edgeSeen[found]]) });
      } else {
        edgeSeen[found] = k;
      }
      edgePerm.push(found);
      flip += ori;
    });
    if (errors.length) return { ok: false, errors };
    if (twist % 3 !== 0) errors.push({ code: 'twist', msg: 'One corner looks twisted. This can happen if a sticker was read wrong, or if a corner was twisted by hand.', stickers: [] });
    if (flip % 2 !== 0) errors.push({ code: 'flip', msg: 'One edge looks flipped. This can happen if a sticker was read wrong, or if the cube was taken apart and put back together.', stickers: [] });
    if (parity(cornerPerm) !== parity(edgePerm)) errors.push({ code: 'parity', msg: 'Two pieces look swapped. Check the colors carefully against your cube.', stickers: [] });
    return { ok: errors.length === 0, errors };
  }

  function randomScramble(n) {
    const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
    const sfx = ['', "'", '2'];
    const out = [];
    let last = null;
    let prev = null;
    while (out.length < (n || 20)) {
      const f = faces[Math.floor(Math.random() * 6)];
      if (f === last) continue;
      if (prev && OPPOSITE[f] === last && f === prev) continue;
      out.push(f + sfx[Math.floor(Math.random() * 3)]);
      prev = last;
      last = f;
    }
    return out;
  }

  // Rotate a 3x3 face (9 colors, row-major) clockwise k quarter turns.
  function rotateFaceGrid(cells, k) {
    let g = cells.slice();
    for (let t = 0; t < ((k % 4) + 4) % 4; t++) {
      const n = new Array(9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) n[r * 3 + c] = g[(2 - c) * 3 + r];
      g = n;
    }
    return g;
  }

  const api = {
    FACES, NORMAL, OPPOSITE, STICKERS, EDGES, CORNERS, PERMS, MOVE_DEFS, SCHEME,
    COLOR_NAMES, COLOR_HEX, COLOR_OPPOSITE,
    stickerAt, applyMove, applyMoves, parseAlg, invertMove, invertAlg,
    solvedState, isSolved, validate, centerIndex, randomScramble, rotateFaceGrid,
  };
  root.CubeModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
