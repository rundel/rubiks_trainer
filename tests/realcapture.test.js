// Real capture from a webcam with a strong blue tint (2026-11-22). Rows are the physical face.
globalThis.CubeModel = require('../js/cube.js');
const SC = require('../js/scanner.js');
const screenRgb = [[137, 158, 222], [147, 155, 62], [0, 38, 141], [75, 151, 143], [223, 137, 145], [75, 108, 215], [183, 61, 85], [222, 111, 100], [152, 188, 255]];
const screenTruth = ['B', 'Y', 'W', 'B', 'O', 'G', 'W', 'O', 'R'];
// The colors were recorded in mirrored screen order, but the answers were entered from the
// physical face, so flip the answers to line them up.
const flip = (a) => a.map((_, k) => a[Math.floor(k / 3) * 3 + 2 - (k % 3)]);
const truth = flip(screenTruth);
const rgb = screenRgb;
// Calibrate from a white sticker, as the white center does in the app.
const gains = SC.gainsFromWhite(rgb[truth.indexOf('W')]);
const guesses = rgb.map((c) => SC.guessColor(SC.applyGains(c, gains)));
const bad = guesses.filter((g, k) => g !== truth[k]).length;
console.log('truth  ', truth.join(' '));
console.log('guessed', guesses.join(' '), `(${bad} wrong)`);
const uncal = rgb.map((c) => SC.guessColor(c));
console.log('no calibration', uncal.join(' '), `(${uncal.filter((g, k) => g !== truth[k]).length} wrong)`);
process.exit(bad ? 1 : 0);
