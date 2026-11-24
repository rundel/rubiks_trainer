// Canvas 3D cube renderer with animated layer turns and drag-to-look-around.
// Faces are projected and depth-sorted here rather than left to CSS 3D, whose plane sorting in
// Safari makes stickers flicker and pop through each other.
(function (root) {
  'use strict';
  const C = root.CubeModel;

  // Coordinates follow CSS: x right, y down, z toward the viewer.
  const FACE_DIRS = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  ];
  const toModel = (n) => [n[0], -n[1], n[2]];
  const PERSPECTIVE = 900;
  const PAD = 0.6;
  const BODY = '#151515';

  // A rounded square in face coordinates, from -a to a, as a polygon.
  function roundedSquare(a, r, steps) {
    const pts = [];
    const corners = [[a - r, a - r, 0], [-(a - r), a - r, Math.PI / 2], [-(a - r), -(a - r), Math.PI], [a - r, -(a - r), Math.PI * 1.5]];
    for (const [cx, cy, a0] of corners) {
      for (let k = 0; k <= steps; k++) {
        const t = a0 + (k / steps) * (Math.PI / 2);
        pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
      }
    }
    return pts;
  }
  const FACE_SHAPE = roundedSquare(1, 0.14, 2);
  const STICKER_SHAPE = roundedSquare(0.86, 0.24, 3);

  const mul = (A, B) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));
  const apply = (M, p) => [
    M[0][0] * p[0] + M[0][1] * p[1] + M[0][2] * p[2],
    M[1][0] * p[0] + M[1][1] * p[1] + M[1][2] * p[2],
    M[2][0] * p[0] + M[2][1] * p[1] + M[2][2] * p[2],
  ];
  function rotX(deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[1, 0, 0], [0, c, -s], [0, s, c]];
  }
  function rotY(deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
  }
  // Same matrix as CSS rotate3d(k, deg).
  function rotAxis(k, deg) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    const [x, y, z] = k;
    return [
      [c + x * x * t, x * y * t - z * s, x * z * t + y * s],
      [y * x * t + z * s, c + y * y * t, y * z * t - x * s],
      [z * x * t - y * s, z * y * t + x * s, c + z * z * t],
    ];
  }
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  class Cube3D {
    constructor(container, opts) {
      opts = opts || {};
      this.size = opts.size || 56;
      this.rx = opts.rx !== undefined ? opts.rx : -28;
      this.ry = opts.ry !== undefined ? opts.ry : -38;
      this.container = container;
      this.speed = opts.speed || 1;
      this.state = C.solvedState();
      this.highlight = new Set();
      this.anim = null;

      const px = this.size * 5;
      this.scene = document.createElement('div');
      this.scene.className = 'c3-scene';
      this.scene.style.width = this.scene.style.height = px + 'px';
      if (opts.mirror) this.scene.style.transform = 'scaleX(-1)';
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'c3-canvas';
      // The canvas is larger than the space the cube takes in the layout, so its corners are not
      // cut off when it is turned to a steep angle.
      const pad = this.size * PAD;
      this.canvas.style.width = this.canvas.style.height = px + 2 * pad + 'px';
      this.canvas.style.margin = -pad + 'px';
      this.scene.appendChild(this.canvas);
      container.appendChild(this.scene);
      this.ctx = this.canvas.getContext('2d');

      this.cubies = [];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const pos = [x, y, z];
        const center = [x * this.size, -y * this.size, z * this.size];
        const faces = FACE_DIRS.map((d) => {
          const mn = toModel(d.n);
          const outward = mn[0] * x + mn[1] * y + mn[2] * z === 1;
          return { d, sticker: outward ? C.stickerAt(pos, mn) : null };
        });
        this.cubies.push({ pos, center, faces });
      }
      if (opts.interactive !== false) this.enableDrag();
      this.render();
    }

    applyView() { this.draw(); }

    setView(rx, ry, animate) {
      if (this.viewAnim) cancelAnimationFrame(this.viewAnim);
      this.viewAnim = null;
      if (!animate) {
        this.rx = rx;
        this.ry = ry;
        this.draw();
        return;
      }
      const from = [this.rx, this.ry], t0 = performance.now(), ms = 600;
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms), e = ease(t);
        this.rx = from[0] + (rx - from[0]) * e;
        this.ry = from[1] + (ry - from[1]) * e;
        this.draw();
        this.viewAnim = t < 1 ? requestAnimationFrame(step) : null;
      };
      this.viewAnim = requestAnimationFrame(step);
    }

    enableDrag() {
      let start = null;
      this.scene.addEventListener('pointerdown', (e) => {
        start = { x: e.clientX, y: e.clientY, rx: this.rx, ry: this.ry };
        this.scene.setPointerCapture(e.pointerId);
        if (this.viewAnim) cancelAnimationFrame(this.viewAnim);
        this.viewAnim = null;
      });
      this.scene.addEventListener('pointermove', (e) => {
        if (!start) return;
        this.rx = Math.max(-80, Math.min(80, start.rx - (e.clientY - start.y) * 0.5));
        this.ry = start.ry + (e.clientX - start.x) * 0.5;
        this.draw();
      });
      const end = () => { start = null; };
      this.scene.addEventListener('pointerup', end);
      this.scene.addEventListener('pointercancel', end);
    }

    setState(state) {
      this.state = state.slice();
      this.render();
    }

    setHighlight(indices) {
      this.highlight = new Set(indices || []);
      this.render();
    }

    render() { this.draw(); }

    draw() {
      const ctx = this.ctx;
      const px = this.size * (5 + 2 * PAD);
      const dpr = Math.min(3, root.devicePixelRatio || 1);
      const want = Math.round(px * dpr);
      if (this.canvas.width !== want || this.canvas.height !== want) { this.canvas.width = want; this.canvas.height = want; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, px, px);
      const V = mul(rotX(this.rx), rotY(this.ry));
      const h = this.size / 2;
      const eye = [0, 0, PERSPECTIVE];
      const proj = (p) => {
        const k = PERSPECTIVE / (PERSPECTIVE - p[2]);
        return [px / 2 + p[0] * k, px / 2 + p[1] * k];
      };

      // During a turn the moving layer and the rest sit on either side of a plane; draw the far
      // side first. Inside each group, cubies are drawn back to front.
      const a = this.anim;
      let groups = [{ M: V, list: this.cubies }];
      if (a) {
        const M = mul(V, rotAxis(a.axis, a.angle));
        const moving = this.cubies.filter((c) => a.def.layer(c.pos));
        const still = this.cubies.filter((c) => !a.def.layer(c.pos));
        if (!still.length) groups = [{ M, list: moving }];
        else {
          const side = Math.sign(moving[0].pos[0] * a.model[0] + moving[0].pos[1] * a.model[1] + moving[0].pos[2] * a.model[2]);
          // Eye in cube coordinates: V is a rotation, so its inverse is its transpose.
          const eyeCube = [0, 1, 2].map((i) => V[0][i] * eye[0] + V[1][i] * eye[1] + V[2][i] * eye[2]);
          const eyeSide = eyeCube[0] * a.axis[0] + eyeCube[1] * a.axis[1] + eyeCube[2] * a.axis[2] - side * h;
          const g1 = { M, list: moving }, g2 = { M: V, list: still };
          groups = side && Math.sign(eyeSide) === side ? [g2, g1] : side ? [g1, g2] : [{ M: null, list: this.cubies, mixed: [V, M] }];
        }
      }
      const dist = (p) => Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      for (const g of groups) {
        const items = g.list.map((c) => {
          const M = g.M || (a.def.layer(c.pos) ? g.mixed[1] : g.mixed[0]);
          const ctr = apply(M, c.center);
          return { c, M, ctr, d: dist(ctr) };
        }).sort((p, q) => q.d - p.d);
        for (const it of items) this.drawCubie(it, h, eye, proj);
      }
    }

    drawCubie({ c, M, ctr }, h, eye, proj) {
      const ctx = this.ctx;
      for (const f of c.faces) {
        const n = apply(M, f.d.n), u = apply(M, f.d.u), v = apply(M, f.d.v);
        const fc = [ctr[0] + n[0] * h, ctr[1] + n[1] * h, ctr[2] + n[2] * h];
        if (n[0] * (eye[0] - fc[0]) + n[1] * (eye[1] - fc[1]) + n[2] * (eye[2] - fc[2]) <= 0) continue;
        const path = (shape) => {
          ctx.beginPath();
          shape.forEach(([s, t], i) => {
            const p = proj([fc[0] + (u[0] * s + v[0] * t) * h, fc[1] + (u[1] * s + v[1] * t) * h, fc[2] + (u[2] * s + v[2] * t) * h]);
            if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
          });
          ctx.closePath();
        };
        path(FACE_SHAPE);
        ctx.fillStyle = BODY;
        ctx.fill();
        // A hairline in the body color closes the antialiasing seams between neighboring faces.
        ctx.strokeStyle = BODY;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (f.sticker === null || f.sticker === undefined) continue;
        const col = this.state[f.sticker];
        path(STICKER_SHAPE);
        if (this.highlight.has(f.sticker)) {
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#ff2d95';
          ctx.lineWidth = Math.max(3, this.size * 0.15);
          ctx.stroke();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = Math.max(1.5, this.size * 0.065);
          ctx.stroke();
        }
        ctx.fillStyle = col ? C.COLOR_HEX[col] : '#555';
        ctx.fill();
      }
    }

    // Animate one move, then commit the new state.
    animateMove(move, duration) {
      if (this.anim) this.anim.finish();
      const def = C.MOVE_DEFS[move[0]];
      const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? -1 : 1;
      const k = def.axis;
      const ms = (duration || 450 * Math.abs(turns) ** 0.6) / this.speed;
      const next = C.applyMove(this.state, move);
      return new Promise((resolve) => {
        const a = { def, model: k, axis: [k[0], -k[1], k[2]], angle: 0 };
        const t0 = performance.now();
        let raf = 0;
        a.finish = () => {
          cancelAnimationFrame(raf);
          if (this.anim === a) this.anim = null;
          this.state = next;
          this.draw();
          resolve();
        };
        const step = (now) => {
          const t = Math.min(1, (now - t0) / ms);
          a.angle = 90 * turns * ease(t);
          this.draw();
          if (t < 1) raf = requestAnimationFrame(step);
          else a.finish();
        };
        this.anim = a;
        raf = requestAnimationFrame(step);
      });
    }
  }

  root.Cube3D = Cube3D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
