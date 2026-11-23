# Cube Coach

A self-contained web app that teaches a kid to solve a Rubik's Cube. Scan a real cube with a webcam (or paint the colors in), and the app walks through the beginner layer-by-layer method one move at a time, with an animated 3D cube and kid-friendly explanations of what each step does and why it works.

No build step and no dependencies: plain HTML, CSS, and JavaScript.

Try it at https://rundel.github.io/rubiks_trainer/ (allow camera access when asked, or use "Paint the colors").

## Running locally

Browsers only allow camera access on `localhost` or HTTPS, so serve the folder locally:

```sh
uv run python -m http.server 8000
```

Then open http://localhost:8000 in Chrome, Edge, Safari, or Firefox. Opening `index.html` directly also works in Chrome, but a local server is the most reliable way to get the camera.

## Features

- Guided scan: six sides in a fixed order, with a picture showing how to hold the cube for each one. A live overlay shows the colors it sees.
- Color calibration: sticker colors are matched against the six scanned centers, so it adapts to the lighting. Tap any square on the review screen to fix a misread color.
- Validation and auto-repair: it checks that the scan is a real, solvable cube (piece colors, twisted corners, flipped edges, parity) and automatically fixes common scanning mistakes such as left and right swapped, or the top or bottom held turned.
- Rescan at any time: "Rescan my cube" is always in the top bar while solving, and a whole new plan is worked out from wherever the cube is now. "Fix the colors" lets you edit the current state directly.
- Step-by-step solving across seven stages (white cross, white corners, middle layer, yellow cross, yellow edges, yellow corner positions, yellow corner twists). Each stage opens with its goal, the method as a short numbered list, and a separate "why it works". Inside a stage, moves are grouped into parts (one per piece, such as "Place the white-red edge"), shown as a checklist of single-instruction steps, each with its own short reason. The piece being worked on is outlined in pink.
- Practice scrambles and a "Learn the moves" page for notation (R, U', F2, and so on).
- Progress is saved in the browser, so a solve can be resumed later.

## Layout

| File               | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| `index.html`       | Screens and markup                                       |
| `css/style.css`    | Styling                                                  |
| `js/cube.js`       | Cube model, moves (derived from 3D geometry), validation |
| `js/solver.js`     | Beginner-method solver with explanations                 |
| `js/scanner.js`    | Webcam sampling and color classification                 |
| `js/cube3d.js`     | CSS 3D cube with animated turns                          |
| `js/app.js`        | UI flow                                                  |
| `tests/`           | Node tests for the solver and the color classifier       |

## Tests

```sh
node tests/solver.test.js 3000   # solves random scrambles and replays each plan
node tests/scanner.test.js       # classification under simulated lighting, scan repair
node tests/redorange.test.js     # red vs orange with per-side white balance drift (CAST=1 adds a blue tint)
node tests/realcapture.test.js   # a real webcam capture with a strong blue tint
node tests/repair.test.js        # auto-repair of sides scanned turned or swapped
node tests/anyway.test.js        # every side held any way up, with a blue camera tint
node tests/replay.js             # score classifiers on saved real scans in tests/scans
```
