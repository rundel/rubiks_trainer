// CSS 3D cube renderer with animated layer turns and drag-to-look-around.
(function (root) {
  'use strict';
  const C = root.CubeModel;

  const FACE_DIRS = [
    { n: [0, 0, 1], css: 'translateZ(var(--h))' },
    { n: [0, 0, -1], css: 'rotateY(180deg) translateZ(var(--h))' },
    { n: [1, 0, 0], css: 'rotateY(90deg) translateZ(var(--h))' },
    { n: [-1, 0, 0], css: 'rotateY(-90deg) translateZ(var(--h))' },
    { n: [0, 1, 0], css: 'rotateX(90deg) translateZ(var(--h))' },
    { n: [0, -1, 0], css: 'rotateX(-90deg) translateZ(var(--h))' },
  ];

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

      this.scene = document.createElement('div');
      this.scene.className = 'c3-scene';
      this.scene.style.setProperty('--s', this.size + 'px');
      this.scene.style.setProperty('--h', this.size / 2 + 'px');
      this.scene.style.width = this.scene.style.height = this.size * 5 + 'px';
      if (opts.mirror) this.scene.style.transform = 'scaleX(-1)';
      this.root = document.createElement('div');
      this.root.className = 'c3-root';
      this.scene.appendChild(this.root);
      container.appendChild(this.scene);

      this.cubies = [];
      for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const el = document.createElement('div');
        el.className = 'c3-cubie';
        const faces = [];
        FACE_DIRS.forEach((d) => {
          const f = document.createElement('div');
          f.className = 'c3-face';
          f.style.transform = d.css;
          const outward = d.n[0] * x + d.n[1] * y + d.n[2] * z === 1;
          if (outward) {
            const st = document.createElement('div');
            st.className = 'c3-sticker';
            f.appendChild(st);
            faces.push({ el: st, index: C.stickerAt([x, y, z], d.n) });
          }
          el.appendChild(f);
        });
        const cubie = { el, pos: [x, y, z], faces };
        cubie.base = `translate3d(${x * this.size}px, ${-y * this.size}px, ${z * this.size}px)`;
        el.style.transform = cubie.base;
        this.root.appendChild(el);
        this.cubies.push(cubie);
      }
      this.applyView();
      if (opts.interactive !== false) this.enableDrag();
      this.render();
    }

    applyView() {
      this.root.style.transform = `rotateX(${this.rx}deg) rotateY(${this.ry}deg)`;
    }

    setView(rx, ry, animate) {
      this.rx = rx;
      this.ry = ry;
      this.root.style.transition = animate ? 'transform 0.6s ease' : '';
      this.applyView();
    }

    enableDrag() {
      let start = null;
      this.scene.addEventListener('pointerdown', (e) => {
        start = { x: e.clientX, y: e.clientY, rx: this.rx, ry: this.ry };
        this.scene.setPointerCapture(e.pointerId);
        this.root.style.transition = '';
      });
      this.scene.addEventListener('pointermove', (e) => {
        if (!start) return;
        this.rx = Math.max(-80, Math.min(80, start.rx - (e.clientY - start.y) * 0.5));
        this.ry = start.ry + (e.clientX - start.x) * 0.5;
        this.applyView();
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

    render() {
      for (const c of this.cubies) {
        for (const f of c.faces) {
          const col = this.state[f.index];
          f.el.style.background = col ? C.COLOR_HEX[col] : '#555';
          f.el.classList.toggle('hl', this.highlight.has(f.index));
        }
      }
    }

    // Animate one move, then commit the new state.
    animateMove(move, duration) {
      const base = move[0];
      const def = C.MOVE_DEFS[base];
      const turns = move.endsWith('2') ? 2 : move.endsWith("'") ? -1 : 1;
      const k = def.axis;
      const angle = 90 * turns;
      const axis = `${k[0]}, ${-k[1]}, ${k[2]}`;
      const ms = (duration || 450 * Math.abs(turns) ** 0.6) / this.speed;
      const moving = this.cubies.filter((c) => def.layer(c.pos));
      const next = C.applyMove(this.state, move);
      if (this.current) this.current.forEach((a) => a.finish());
      const anims = moving.map((c) =>
        c.el.animate(
          [{ transform: `rotate3d(${axis}, 0deg) ${c.base}` }, { transform: `rotate3d(${axis}, ${angle}deg) ${c.base}` }],
          { duration: ms, easing: 'ease-in-out', fill: 'forwards' },
        ));
      this.current = anims;
      return Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => {
        if (this.current === anims) this.current = null;
        this.setState(next);
        anims.forEach((a) => a.cancel());
      });
    }
  }

  root.Cube3D = Cube3D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
