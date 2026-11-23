// Beginner (layer-by-layer) solver. It produces stages of explained steps, not an optimal solution.
// Text uses {X} tokens for colors (W, Y, G, B, R, O), which the UI turns into colored chips.
(function (root) {
  'use strict';
  const C = root.CubeModel || require('./cube.js');
  const { applyMove, applyMoves, parseAlg, STICKERS, EDGES, CORNERS, FACES } = C;

  const idx = (face, r, c) => FACES.indexOf(face) * 9 + r * 3 + c;
  const center = (s, face) => s[idx(face, 1, 1)];
  const faceOf = (i) => STICKERS[i].face;
  const yOf = (i) => STICKERS[i].pos[1];

  const SEXY = "R U R' U'";
  const RIGHT_ALG = "U R U' R' U' F' U F";
  const LEFT_ALG = "U' L' U L U F U' F'";
  const CROSS_ALG = "F R U R' U' F'";
  const EDGE_ALG = "R U R' U R U2 R' U";
  const CORNER_ALG = "U R U' L' U R' U' L";
  const TWIST_ALG = "R' D' R D";

  const ROTATIONS = ['', 'y', "y'", 'y2'];
  const UTURNS = ['', 'U', "U'", 'U2'];

  // Each stage has a one-sentence goal, the method as short ordered steps, and a separate reason
  // why the method works. Inside a stage, the solver groups its steps into parts (one per piece).
  const STAGES = {
    hold: {
      title: 'Get ready',
      short: 'Ready',
      goal: 'Hold your cube the right way before we start.',
      how: [
        'Hold the cube the way the picture shows.',
        'Keep holding it this way. Only turn the whole cube when a step tells you to.',
      ],
      why: 'The center squares never move, so they tell us which side is which. Every other piece belongs next to the centers that match its colors.',
    },
    cross: {
      title: 'Step 1: The white cross',
      short: 'Cross',
      goal: 'Make a {W} plus sign on the bottom, with each {W} edge also matching the center on its side.',
      how: [
        'Pick a {W} edge and turn the whole cube so the center of its other color faces you.',
        'If the edge is not in the top layer, lift it up there.',
        'Turn the top layer until the edge is right above its center.',
        'Drop the edge down to the bottom.',
      ],
      why: 'Centers never move, so they show where each edge belongs: the {W}-{R} edge goes between the {W} center and the {R} center. Lining edges up from the top lets them drop in without knocking out the ones you already placed.',
    },
    corners: {
      title: 'Step 2: The white corners',
      short: 'Corners',
      goal: 'Finish the {W} side on the bottom, so the bottom row of every side matches its center.',
      how: [
        'Pick a {W} corner and turn the whole cube so its other two colors are the front and right centers.',
        'Turn the top layer until the corner is right above the bottom-front-right spot.',
        "Repeat R U R' U' until the corner drops in with {W} facing down. It takes 1, 3, or 5 times.",
      ],
      why: "R U R' U' only moves the top layer, one middle edge, and the bottom-front-right corner. Each time, that corner comes out and goes back in twisted a new way, while the rest of your bottom layer stays put.",
    },
    middle: {
      title: 'Step 3: The middle layer',
      short: 'Middle',
      goal: 'Put the four middle-layer edges in place, so the bottom two layers are done.',
      how: [
        'Find an edge in the top layer with no {Y} on it.',
        'Turn the cube and the top layer so the edge sits above the center that matches its side color. Together they make an upside-down T.',
        'Look at the color on top of the edge. Send the edge toward the side whose center has that color, using the right move or the left move.',
      ],
      why: 'Each move lifts a bottom corner out of the way, slides the edge in next to it, and puts the corner back. Only the top layer and that one middle spot change, so your finished bottom layer is safe.',
    },
    ycross: {
      title: 'Step 4: The yellow cross',
      short: 'Y cross',
      goal: 'Make a {Y} plus sign on top. The sides do not need to match yet.',
      how: [
        'Look at the top. You have a dot, an L, a line, or already a cross.',
        'Hold an L at the back and left, or a line going left to right.',
        "Do F R U R' U' F'. Each time you get one shape closer: dot, L, line, cross.",
      ],
      why: "F R U R' U' F' only moves pieces in the top layer. It flips top edges over and leaves the bottom two layers exactly as they were.",
    },
    yedges: {
      title: 'Step 5: Match the yellow edges',
      short: 'Y edges',
      goal: 'Make the side color of each top edge match the center below it.',
      how: [
        'Turn the top layer until at least two edges match.',
        'If the two are next to each other, hold them at the back and on the right.',
        "Do R U R' U R U2 R' U to swap the other two. If the two were across from each other, do it once to make two neighbors match first.",
      ],
      why: "R U R' U R U2 R' U swaps the front and left top edges. It only moves pieces in the top layer, so the bottom two layers stay safe.",
    },
    ycorners: {
      title: 'Step 6: Yellow corners to their spots',
      short: 'Y spots',
      goal: 'Put each top corner in its right spot. It is OK if it is twisted.',
      how: [
        'Find a corner in its right spot: its three colors match the three centers around it.',
        'Turn the whole cube so that corner is at the top-front-right.',
        "Do U R U' L' U R' U' L once or twice until every corner is in its spot. If no corner is in its spot, do it once from anywhere first.",
      ],
      why: "U R U' L' U R' U' L moves three top corners around in a circle and leaves the front-right corner where it is. Nothing else on the cube changes.",
    },
    yorient: {
      title: 'Step 7: Twist the yellow corners',
      short: 'Finish',
      goal: 'Twist the last corners so the whole cube is solved!',
      how: [
        'Turn only the top layer so a twisted corner (no {Y} on top) is at the front-right.',
        "Repeat R' D' R D until that corner has {Y} on top. It takes 2 or 4 times.",
        'Turn only the top layer to bring the next twisted corner to the front-right, and repeat.',
        'When every corner is done, turn the top layer to line everything up.',
      ],
      why: "R' D' R D twists the front-right corner, but it also mixes up the bottom. Because you only turn the top layer in between, the mess cancels out once the last corner is twisted. So keep going even when the bottom looks broken, and never turn the whole cube during this step.",
    },
  };

  function search(s, moves, maxDepth, goal) {
    if (goal(s)) return [];
    const path = [];
    function dfs(st, d, lastFace) {
      if (d === 0) return goal(st);
      for (const m of moves) {
        if (m[0] === lastFace) continue;
        path.push(m);
        if (dfs(applyMove(st, m), d - 1, m[0])) return true;
        path.pop();
      }
      return false;
    }
    for (let d = 1; d <= maxDepth; d++) if (dfs(s, d, null)) return path.slice();
    return null;
  }

  function findEdge(s, a, b) {
    for (const [i, j] of EDGES) {
      if (s[i] === a && s[j] === b) return [i, j];
      if (s[j] === a && s[i] === b) return [j, i];
    }
    return null;
  }

  function findCorner(s, cols) {
    for (const cs of CORNERS) {
      const have = cs.map((i) => s[i]);
      if (cols.every((c) => have.includes(c))) return cs.map((_, k) => cs[have.indexOf(cols[k])]);
    }
    return null;
  }

  const pieceSolved = (s, stickers) => stickers.every((i) => s[i] === center(s, faceOf(i)));
  const slotWith = (list, faces) => list.find((p) => faces.every((f) => p.some((i) => faceOf(i) === f)) && p.length === faces.length);

  const CROSS_SLOTS = { F: slotWith(EDGES, ['D', 'F']), R: slotWith(EDGES, ['D', 'R']), B: slotWith(EDGES, ['D', 'B']), L: slotWith(EDGES, ['D', 'L']) };
  const D_CORNERS = CORNERS.filter((cs) => cs.some((i) => faceOf(i) === 'D'));
  const U_CORNERS = CORNERS.filter((cs) => cs.some((i) => faceOf(i) === 'U'));
  const MID_EDGES = EDGES.filter((es) => es.every((i) => yOf(i) === 0));
  const U_EDGES = EDGES.filter((es) => es.some((i) => faceOf(i) === 'U'));
  const URF = slotWith(CORNERS, ['U', 'R', 'F']);
  const DFR = slotWith(CORNERS, ['D', 'F', 'R']);
  const FR = slotWith(EDGES, ['F', 'R']);

  const crossOk = (s, side) => pieceSolved(s, CROSS_SLOTS[side]);
  const sameSlot = (a, b) => a.length === b.length && a.every((i) => STICKERS[i].pos.join() === STICKERS[b[0]].pos.join());

  // Steps are grouped into parts (one sub-goal, such as placing one piece). A step has `text`, a
  // single instruction for its moves, and an optional `why`, the reason for that one step.
  class Builder {
    constructor(state) {
      this.s = state.slice();
      this.stages = [];
      this.cur = null;
    }
    stage(id) {
      this.cur = Object.assign({ id, steps: [], tasks: [] }, STAGES[id]);
      this.focus = null;
      this.pending = null;
      this.stages.push(this.cur);
    }
    // Parts are added when their first step is, so a part that needs no moves never shows up.
    task(title, note) {
      this.pending = { title, note: note || '' };
    }
    step(text, alg, extra) {
      const moves = parseAlg(alg || []);
      const tasks = this.cur.tasks;
      if (this.pending) {
        const last = tasks[tasks.length - 1];
        if (!last || last.title !== this.pending.title) tasks.push(this.pending);
        this.pending = null;
      }
      if (!tasks.length) throw new Error('step without a part');
      this.cur.steps.push(Object.assign({ text, why: '', moves, focus: this.focus || null, task: tasks.length - 1 }, extra || {}));
      this.s = applyMoves(this.s, moves);
    }
    rotateTo(pred, text, why) {
      const r = ROTATIONS.find((m) => pred(m ? applyMove(this.s, m) : this.s));
      if (r === undefined) throw new Error('rotation not found');
      const after = r ? applyMove(this.s, r) : this.s;
      const t = typeof text === 'function' ? text(after) : text;
      if (r) this.step(t, r, { kind: 'rotate', why: why || '' });
    }
    turnTopTo(pred, text, why) {
      const u = UTURNS.find((m) => pred(m ? applyMove(this.s, m) : this.s));
      if (u === undefined) throw new Error('U turn not found');
      if (u) this.step(text, u, { kind: 'adjust', why: why || '' });
    }
    repeatUntil(alg, pred, max, text, why) {
      const moves = parseAlg(alg);
      let s = this.s;
      for (let n = 1; n <= max; n++) {
        s = applyMoves(s, moves);
        if (pred(s)) {
          const all = [];
          for (let k = 0; k < n; k++) all.push(...moves);
          this.step(typeof text === 'function' ? text(n) : text, all, { alg, repeat: n, why: why || '' });
          return n;
        }
      }
      throw new Error('repeat did not finish: ' + alg);
    }
    check(cond, what) {
      if (!cond) throw new Error('Solver check failed: ' + what);
    }
  }

  // Find the whole-cube rotation that puts white on the bottom, preferring green in front.
  function orient(state) {
    const rots = ['', 'x', "x'", 'x2', 'y', "y'", 'y2', 'z', "z'", 'z2'];
    const cands = [];
    for (const a of rots) for (const b of rots) cands.push(parseAlg((a + ' ' + b).trim() || []));
    let best = null;
    for (const seq of cands) {
      const s = applyMoves(state, seq);
      if (center(s, 'D') !== 'W') continue;
      const score = (center(s, 'F') === 'G' ? 0 : 10) + seq.length;
      if (!best || score < best.score) best = { seq, score, s };
    }
    if (!best) throw new Error('No white center found');
    return best;
  }

  const chips = (cols) => cols.map((c) => `{${c}}`).join('-');

  function solveCross(b) {
    const order = ['F', 'R', 'L', 'B'];
    const toFront = { F: '', R: 'y', L: "y'", B: 'y2' };
    for (let iter = 0; iter < 4; iter++) {
      const target = order.find((f) => !crossOk(b.s, f));
      if (!target) break;
      const c = center(b.s, target);
      b.focus = ['W', c];
      b.task(`Place the ${chips(['W', c])} edge`);
      if (toFront[target]) {
        b.step(`Turn the whole cube so the {${c}} center faces you. Keep {W} on the bottom.`, toFront[target],
          { kind: 'rotate', why: `This edge belongs between the {W} center and the {${c}} center.` });
      }
      const solvedSides = order.filter((f) => f !== 'F' && crossOk(b.s, f));
      let [iw] = findEdge(b.s, 'W', c);
      if (yOf(iw) !== 1) {
        const inMiddle = yOf(iw) === 0;
        const seq = search(b.s, ['F', "F'", 'F2', 'R', "R'", 'R2', 'L', "L'", 'L2', 'D', "D'", 'D2', 'B', "B'", 'B2'], 4, (st) => {
          const [a] = findEdge(st, 'W', c);
          return yOf(a) === 1 && solvedSides.every((f) => crossOk(st, f));
        });
        b.check(seq, 'lift cross edge');
        b.step('Lift the edge up to the top layer.', seq, {
          why: inMiddle
            ? 'It is in the middle layer. From the top layer it can be lined up with its center.'
            : 'It is on the bottom but in the wrong place. From the top layer it can be lined up with its center.',
        });
      }
      b.turnTopTo((st) => {
        const [a, d] = findEdge(st, 'W', c);
        return faceOf(a) !== 'D' && [a, d].every((i) => yOf(i) === 1 && STICKERS[i].pos[2] === 1 && STICKERS[i].pos[0] === 0);
      }, `Turn the top layer until the edge is right above the {${c}} center.`);
      if (b.s[idx('U', 2, 1)] === 'W') {
        b.step('Turn the front side twice (F2) to drop the edge into place.', 'F2',
          { why: 'The {W} sticker faces up, so a half turn brings it down facing the bottom.' });
      } else {
        b.step("Do U' R' F R to drop the edge into place.", "U' R' F R",
          { why: 'The {W} sticker faces you, so the edge is upside down. These moves flip it over as it goes in.' });
      }
      b.check(crossOk(b.s, 'F'), 'cross edge placed');
    }
    b.check(order.every((f) => crossOk(b.s, f)), 'cross complete');
  }

  function cornerPieceFor(s, slot) {
    const sides = slot.filter((i) => faceOf(i) !== 'D').map((i) => center(s, faceOf(i)));
    return ['W'].concat(sides);
  }

  function solveCorners(b) {
    for (let iter = 0; iter < 12; iter++) {
      const unsolved = D_CORNERS.filter((cs) => !pieceSolved(b.s, cs));
      if (!unsolved.length) return;
      const pieces = unsolved.map((slot) => {
        const cols = cornerPieceFor(b.s, slot);
        const loc = findCorner(b.s, cols);
        return { cols, loc, home: slot, top: yOf(loc[0]) === 1 };
      });
      pieces.sort((p, q) => (q.top ? 1 : 0) - (p.top ? 1 : 0));
      const p = pieces[0];
      b.focus = p.cols;
      b.task(`Place the ${chips(p.cols)} corner`);
      if (p.top) {
        const sideCols = p.cols.slice(1);
        b.rotateTo(
          (st) => sideCols.includes(center(st, 'F')) && sideCols.includes(center(st, 'R')),
          (st) => `Turn the whole cube so the {${center(st, 'F')}} center faces you and the {${center(st, 'R')}} center is on your right.`,
          'This corner belongs at the bottom-front-right, between those two centers and {W}.',
        );
        b.turnTopTo((st) => sameSlot(findCorner(st, p.cols), URF), 'Turn the top layer until the corner is right above the bottom-front-right spot.');
        b.repeatUntil(SEXY, (st) => pieceSolved(st, DFR), 5, "Repeat R U R' U' until the corner drops in with {W} facing down.");
      } else {
        const here = p.loc;
        b.rotateTo(
          (st) => sameSlot(findCorner(st, p.cols), DFR),
          'Turn the whole cube so the corner is at the bottom-front-right.',
          'The corner is stuck in the bottom layer, and the next moves work on that spot.',
        );
        if (sameSlot(here, p.home)) {
          b.repeatUntil(SEXY, (st) => pieceSolved(st, DFR), 5, "Repeat R U R' U' until {W} faces down.",
            'The corner is in its right spot, just twisted.');
        } else {
          b.step("Do R U R' U' once.", SEXY, { alg: SEXY, why: 'The corner is in the wrong spot. This pops it up to the top layer, where it can be placed like the others.' });
        }
      }
    }
    b.check(D_CORNERS.every((cs) => pieceSolved(b.s, cs)), 'corners complete');
  }

  function solveMiddle(b) {
    const firstTwo = () => D_CORNERS.every((cs) => pieceSolved(b.s, cs)) && Object.values(CROSS_SLOTS).every((e) => pieceSolved(b.s, e));
    for (let iter = 0; iter < 12; iter++) {
      if (MID_EDGES.every((e) => pieceSolved(b.s, e))) return;
      const Y = center(b.s, 'U');
      const tops = U_EDGES.map((e) => {
        const top = e.find((i) => faceOf(i) === 'U');
        const side = e.find((i) => faceOf(i) !== 'U');
        return { top: b.s[top], side: b.s[side], sideFace: faceOf(side) };
      }).filter((e) => e.top !== Y && e.side !== Y);
      if (tops.length) {
        const cost = { F: 0, R: 1, L: 1, B: 2 };
        tops.sort((a, c) => cost[a.sideFace] - cost[c.sideFace]);
        const e = tops[0];
        b.focus = [e.side, e.top];
        b.task(`Place the ${chips([e.side, e.top])} edge`, `It is in the top layer and has no {${Y}} on it, so it belongs in the middle layer.`);
        b.rotateTo((st) => center(st, 'F') === e.side, `Turn the whole cube so the {${e.side}} center faces you.`);
        b.turnTopTo((st) => st[idx('F', 0, 1)] === e.side && st[idx('U', 2, 1)] === e.top,
          `Turn the top layer until the edge's {${e.side}} sticker is right above the {${e.side}} center.`,
          'The edge and the center now make an upside-down T.');
        if (e.top === center(b.s, 'R')) {
          b.step(`Send the edge to the right with ${RIGHT_ALG}.`, RIGHT_ALG,
            { alg: RIGHT_ALG, why: `The top of the edge is {${e.top}}, which matches the center on the right.` });
          b.check(pieceSolved(b.s, FR), 'right insert');
        } else {
          b.check(e.top === center(b.s, 'L'), 'left color');
          b.step(`Send the edge to the left with ${LEFT_ALG}.`, LEFT_ALG,
            { alg: LEFT_ALG, why: `The top of the edge is {${e.top}}, which matches the center on the left.` });
          b.check(pieceSolved(b.s, slotWith(EDGES, ['F', 'L'])), 'left insert');
        }
      } else {
        const bad = MID_EDGES.find((e) => !pieceSolved(b.s, e));
        const cols = bad.map((i) => b.s[i]);
        b.focus = cols;
        b.task(`Free the ${chips(cols)} edge`,
          `Every edge in the top layer has {${Y}} on it, so the edge we need is stuck in the middle layer, in the wrong spot or flipped.`);
        b.rotateTo((st) => sameSlot(findEdge(st, cols[0], cols[1]), FR), 'Turn the whole cube so the edge is at the front-right.');
        b.step(`Do the right move once: ${RIGHT_ALG}.`, RIGHT_ALG,
          { alg: RIGHT_ALG, why: 'This kicks the edge up to the top layer. Then it can go back in the right way.' });
      }
      b.check(firstTwo(), 'first layer kept');
    }
    b.check(MID_EDGES.every((e) => pieceSolved(b.s, e)), 'middle complete');
  }

  function solveYellowCross(b) {
    const Y = center(b.s, 'U');
    const up = (st) => ['UB', 'UL', 'UR', 'UF'].map((k) => st[{ UB: 1, UL: 3, UR: 5, UF: 7 }[k]] === Y);
    const shape = (st) => {
      const [ub, ul, ur, uf] = up(st);
      const n = [ub, ul, ur, uf].filter(Boolean).length;
      if (n === 4) return 'cross';
      if (n === 0) return 'dot';
      return (ul && ur) || (ub && uf) ? 'line' : 'L';
    };
    for (let iter = 0; iter < 5; iter++) {
      const now = shape(b.s);
      if (now === 'cross') return;
      if (now === 'dot') {
        b.task('Turn the dot into an L', `Only the {${Y}} center is on top, with no {${Y}} edges around it.`);
      } else if (now === 'line') {
        b.task('Turn the line into a cross', `Two {${Y}} edges on top make a line with the center.`);
        b.turnTopTo((st) => { const v = up(st); return v[1] && v[2]; }, `Turn the top layer so the {${Y}} line goes from left to right.`);
      } else {
        b.task('Turn the L into a line', `Two {${Y}} edges next to each other make an L with the center.`);
        b.turnTopTo((st) => { const v = up(st); return v[0] && v[1]; },
          `Turn the top layer so the {${Y}} L points to the back and to the left.`,
          'The two {Y} edges should be at the back and on your left, like the hands of a clock at 9 o\'clock.');
      }
      b.step(`Do ${CROSS_ALG} once.`, CROSS_ALG, { alg: CROSS_ALG });
      b.check(shape(b.s) === { dot: 'L', L: 'line', line: 'cross' }[now], 'yellow cross shape');
    }
    b.check(up(b.s).every(Boolean), 'yellow cross');
  }

  const edgeMatch = (st) => ({
    F: st[idx('F', 0, 1)] === center(st, 'F'),
    R: st[idx('R', 0, 1)] === center(st, 'R'),
    B: st[idx('B', 0, 1)] === center(st, 'B'),
    L: st[idx('L', 0, 1)] === center(st, 'L'),
  });
  const matchCount = (st) => Object.values(edgeMatch(st)).filter(Boolean).length;

  function solveYellowEdges(b) {
    for (let iter = 0; iter < 6; iter++) {
      let best = UTURNS[0];
      let bestN = -1;
      for (const u of UTURNS) {
        const n = matchCount(u ? applyMove(b.s, u) : b.s);
        if (n > bestN) { bestN = n; best = u; }
      }
      const m = edgeMatch(best ? applyMove(b.s, best) : b.s);
      const adjacent = (m.F && m.R) || (m.R && m.B) || (m.B && m.L) || (m.L && m.F);
      if (bestN === 4) {
        b.task('Line up the edges', 'All four edges are already in the right order around the top.');
        if (best) b.step('Turn the top layer until all four edges match the centers below them.', best, { kind: 'adjust' });
        return;
      }
      if (adjacent) {
        b.task('Swap the last two edges');
        if (best) b.step('Turn the top layer until two edges next to each other match the centers below them.', best, { kind: 'adjust' });
        b.rotateTo((st) => { const v = edgeMatch(st); return v.B && v.R; },
          'Turn the whole cube so the two matching edges are at the back and on the right.',
          'The move swaps the front and left edges, so the matching ones need to be out of the way.');
        b.step(`Do ${EDGE_ALG} once.`, EDGE_ALG, { alg: EDGE_ALG, why: 'This swaps the front and left edges, so they match too.' });
      } else {
        b.task('Make two neighbors match', 'Right now, only two edges across from each other can match.');
        if (best) b.step('Turn the top layer until two edges across from each other match the centers below them.', best, { kind: 'adjust' });
        b.step(`Do ${EDGE_ALG} once.`, EDGE_ALG, { alg: EDGE_ALG, why: 'After this, you can line up two edges that are next to each other.' });
      }
    }
    b.check(matchCount(b.s) === 4, 'yellow edges');
  }

  function cornerHomeOk(st, slot) {
    const want = slot.map((i) => center(st, faceOf(i)));
    const have = slot.map((i) => st[i]);
    return want.every((c) => have.includes(c));
  }

  function solveYellowCornerSpots(b) {
    const Y = center(b.s, 'U');
    for (let iter = 0; iter < 6; iter++) {
      const ok = U_CORNERS.filter((cs) => cornerHomeOk(b.s, cs));
      if (ok.length === 4) return;
      if (ok.length === 0) {
        b.task('Get one corner into its spot', 'No top corner is in its right spot yet.');
        b.step(`Do ${CORNER_ALG} once.`, CORNER_ALG, { alg: CORNER_ALG, why: 'After this, one corner will be in its spot.' });
        continue;
      }
      b.task('Move the other corners into their spots', 'A corner is in its spot when its three colors match the three centers around it, even if it is twisted.');
      b.rotateTo((st) => cornerHomeOk(st, URF),
        `Turn the whole cube so the corner that is in its spot is at the top-front-right. Keep {${Y}} on top.`,
        'The move keeps the front-right corner still and moves the other three.');
      b.repeatUntil(CORNER_ALG, (st) => U_CORNERS.every((cs) => cornerHomeOk(st, cs)), 2,
        (n) => `Do ${CORNER_ALG} ${n === 1 ? 'once' : 'twice'}.`,
        'Each time, the other three corners move around in a circle.');
    }
    b.check(U_CORNERS.every((cs) => cornerHomeOk(b.s, cs)), 'corner spots');
  }

  function solveYellowCornerTwist(b) {
    const Y = center(b.s, 'U');
    const urfTop = idx('U', 2, 2);
    const total = U_CORNERS.filter((cs) => b.s[cs[0]] !== Y).length;
    for (let k = 1; k <= 10; k++) {
      const twisted = U_CORNERS.filter((cs) => b.s[cs[0]] !== Y);
      if (!twisted.length) break;
      b.task(`Twist corner ${k} of ${total}`, k === 1 ? `A twisted corner has no {${Y}} facing up.` : '');
      if (b.s[urfTop] === Y) {
        b.turnTopTo((st) => st[urfTop] !== Y,
          'Turn only the top layer until a twisted corner is at the front-right.',
          k === 1 ? '' : 'Do not turn the whole cube, or the bottom will not fix itself at the end.');
      }
      b.repeatUntil(TWIST_ALG, (st) => st[urfTop] === Y, 4, `Repeat R' D' R D until the front-right corner has {${Y}} on top.`,
        k === total
          ? 'This is the last corner, so the bottom fixes itself when it is done.'
          : 'The bottom gets mixed up while you do this. That is OK: it fixes itself after the last corner.');
    }
    b.task('Line up the top');
    b.turnTopTo((st) => C.isSolved(st), 'Turn the top layer to line everything up.', 'Every piece is in place now, and the top just needs to turn into line.');
    b.check(C.isSolved(b.s), 'solved');
  }

  // state: 54 color letters, in the orientation it was scanned.
  function solve(state) {
    const v = C.validate(state);
    if (!v.ok) {
      const e = new Error('Invalid cube');
      e.validation = v;
      throw e;
    }
    const o = orient(state);
    const b = new Builder(o.s);
    b.stage('hold');
    b.cur.holdFront = center(o.s, 'F');
    b.cur.how = [
      `Hold your cube with the {W} center on the bottom and the {${center(o.s, 'F')}} center facing you.`,
      `Check: {${center(o.s, 'U')}} is on top and {${center(o.s, 'R')}} is on your right.`,
      'Keep holding it this way. Only turn the whole cube when a step tells you to.',
    ];
    b.stage('cross'); solveCross(b);
    b.stage('corners'); solveCorners(b);
    b.stage('middle'); solveMiddle(b);
    b.stage('ycross'); solveYellowCross(b);
    b.stage('yedges'); solveYellowEdges(b);
    b.stage('ycorners'); solveYellowCornerSpots(b);
    b.stage('yorient'); solveYellowCornerTwist(b);
    return { start: o.s, orientation: o.seq, stages: b.stages, final: b.s };
  }

  const api = { solve, STAGES, orient };
  root.CubeSolver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
