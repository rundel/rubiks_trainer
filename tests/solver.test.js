const C = require('../js/cube.js');
const S = require('../js/solver.js');
const rots = ['', 'x', 'y', 'z', "x'", 'y2', 'z2', "x y", "z y'"];
let fail = 0, total = 0, maxMoves = 0, sum = 0;
const N = +process.argv[2] || 3000;
for (let i = 0; i < N; i++) {
  let s = C.applyMoves(C.solvedState(), C.randomScramble(25));
  const r = rots[i % rots.length];
  if (r) s = C.applyMoves(s, C.parseAlg(r));
  total++;
  try {
    const plan = S.solve(s);
    let t = plan.start;
    let n = 0;
    for (const st of plan.stages) {
      if (!st.goal || !Array.isArray(st.how) || !st.how.length || !st.why) throw new Error('stage text missing: ' + st.id);
      for (const step of st.steps) {
        if (!step.text || !step.moves.length || !st.tasks[step.task]) throw new Error('bad step in ' + st.id);
        t = C.applyMoves(t, step.moves); n += step.moves.length;
      }
      if (st.tasks.some((task, k) => !st.steps.some((step) => step.task === k))) throw new Error('empty part in ' + st.id);
    }
    if (!C.isSolved(t)) throw new Error('replay not solved');
    maxMoves = Math.max(maxMoves, n); sum += n;
  } catch (e) { fail++; if (fail < 5) console.log(e.message); }
}
// already solved and almost-solved
for (const alg of ['', 'U', "R U R' U'", 'F2']) {
  const plan = S.solve(C.applyMoves(C.solvedState(), C.parseAlg(alg || [])));
  console.log(JSON.stringify(alg), 'steps', plan.stages.map(s => s.steps.length).join(','));
}
console.log(`failures ${fail}/${total}, avg moves ${(sum / (total - fail)).toFixed(0)}, max ${maxMoves}`);
process.exit(fail ? 1 : 0);
