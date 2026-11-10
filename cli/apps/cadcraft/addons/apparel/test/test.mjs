#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test.mjs — the Apparel add-on's Node tests (0.5 track AP). Runs the add-on's DOM-free modules, then the add-on itself in
 * CadCraft's own loader and command line (t-addon.mjs), and every other t-*.mjs here.
 *   node public_html/assets/apps/cadcraft/dev/addons/apparel/test/test.mjs [--verbose] [--keep] [--corpus <dir>]
 * --corpus: the DXF-AAMA sample files (default /var/www/CADCRAFT/testfiles/apparel-corpus; missing = those checks skip).
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDON = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const KEEP = args.includes('--keep');
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CORPUS = arg('--corpus', process.env.APPAREL_CORPUS || '/var/www/CADCRAFT/testfiles/apparel-corpus');
const APP = path.resolve(ADDON, '../..');
const ROOT = path.resolve(APP, '../../../../..');
const load = (f) => import(pathToFileURL(path.join(APP, f)).href);
const mine = (f) => import(pathToFileURL(path.join(ADDON, f)).href);

const I18n = await load('i18n.js');
I18n.init({ strings: JSON.parse(fs.readFileSync(path.join(APP, 'lang/en.json'), 'utf8')) });
const EN = JSON.parse(fs.readFileSync(path.join(ADDON, 'lang/en.json'), 'utf8'));
const Text = await mine('lib/text.js');
Text.setT(Text.lookupFrom(EN));
const { Doc } = await load('doc.js');
const C = await mine('lib/curve.js');
const S = await mine('lib/seam.js');
const PC = await mine('lib/piece.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; if (VERBOSE) console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const section = (s) => console.log('\n' + s);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearPts = (got, want, tol = 0.01) => got.length === want.length && got.every((p, i) => near(p.x, want[i][0], tol) && near(p.y, want[i][1], tol));
const show = (pts) => JSON.stringify(pts.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]));
globalThis.__apTest = { ok, section, near, nearPts, show, load, mine, ADDON, APP, ROOT, KEEP, VERBOSE, EN, Doc, CORPUS };

// ------------------------------------------------------------------------------------------------ outlines
section('Outlines: corners, curve points, edges (curve.js)');
{
  const rect = C.ptsOf([[0, 0], [100, 0], [100, 50], [0, 50]]);
  const es = C.edges(rect);
  ok(es.length === 4 && es.map((e) => e.start + '-' + e.end).join() === '0-1,1-2,2-3,3-0', 'a rectangle has four edges, corner to corner');
  const { path } = C.sampled(rect);
  ok(path.length === 5 && near(C.length(path), 300) && near(C.area(path), 5000), 'sampled: straight between corners, perimeter 300, area 5000');
  // a curved edge: corner, three curve points, corner → one edge
  const arcish = C.ptsOf([[0, 0], [100, 0, 0], [130, 50, 1], [100, 100, 0], [0, 100, 0]]);
  ok(C.edges(arcish).length === 4 && C.edges(arcish)[1].idx.join() === '1,2,3', 'a curve point does not end an edge');
  const ep = C.edgePath(arcish, C.edges(arcish)[1]);
  ok(ep.length === 1 + 2 * C.STEPS && near(ep[C.STEPS].x, 130) && near(ep[C.STEPS].y, 50) && near(ep[0].x, 100) && near(ep[ep.length - 1].y, 100), 'the curve runs through its curve point and ends on the corners');
  ok(ep.every((p) => p.x >= 100 - 1e-9 && p.x <= 131), 'the curve bulges out between the corners, no wild swing', show(ep.filter((p) => p.x < 100 || p.x > 131)));
  // a smooth closed outline (no corners): one edge, near a circle
  const ring = C.ptsOf(Array.from({ length: 12 }, (_, i) => [50 * Math.cos(i * Math.PI / 6), 50 * Math.sin(i * Math.PI / 6), 1]));
  const re = C.edges(ring);
  ok(re.length === 1 && re[0].smooth, 'no corners: one closed smooth edge');
  const rp = C.sampled(ring).path;
  const radii = rp.map((p) => Math.hypot(p.x, p.y));
  ok(Math.min(...radii) > 49.8 && Math.max(...radii) < 50.01, 'twelve curve points on a circle stay within 0.4 % of it', Math.min(...radii) + ' ' + Math.max(...radii));
  ok(near(C.length(rp), 2 * Math.PI * 50, 0.6), 'its length is the circle\'s (to 0.6)', String(C.length(rp)));
  const q = C.pointAt(path, 150);
  ok(near(q.x, 100) && near(q.y, 50) && near(q.tx, -1) || (near(q.x, 100) && near(q.y, 50)), 'pointAt walks round the outline');
  const nn = C.nearest(path, { x: 50, y: -3 });
  ok(near(nn.d, 50) && near(nn.dist, 3), 'nearest: distance along and away');
  const cw = C.ptsOf([[0, 0], [0, 50], [100, 50], [100, 0]]);
  ok(C.area(C.sampled(C.orientCCW(cw)).path) > 0, 'orientCCW turns a clockwise outline round');
}

// ------------------------------------------------------------------------------------------------ AP.3 seam allowance
section('AP.3 seam allowance: per-edge widths, corner rules (seam.js), against hand-worked shapes');
{
  const cut = (pts, sa) => S.cutLine(C.ptsOf(pts), sa);
  const rect = [[0, 0], [100, 0], [100, 50], [0, 50]];
  let r = cut(rect, { w: 10 });
  ok(nearPts(r, [[110, -10], [110, 60], [-10, 60], [-10, -10]]), '1 cm all round a 10 × 5 cm rectangle: corners 1 cm out both ways', show(r));
  r = cut(rect, { w: 10, e: { 0: 40 } });
  ok(nearPts(r, [[110, -40], [110, 60], [-10, 60], [-10, -40]]), 'a 4 cm hem on the bottom edge, 1 cm elsewhere', show(r));
  r = cut(rect, { w: 0, e: { 0: 40 } });
  ok(nearPts(r, [[0, -40], [100, -40], [100, 50], [0, 50]]), 'allowance on one edge only: the others are cut on the sew line', show(r));
  // a trapezoid (sides lean in by 20 over 60): hem 40 on the bottom, 10 on the sides and top. Worked by hand:
  //   side cut line: x = 100 + 20/60·(y) moved out 10 → through (109.49, 3.16), direction (−1, 3)/√10
  //   follow: meets y = −40 at x = 109.49 + (−43.16/3) = 123.87;   square: meets y = 0 at 110.54, then down to (110.54, −40)
  //   mitre: straight from (100, −40) to (109.49, 3.16);   reverse: from (110.54, 0) the side's cut line mirrored in y = 0 → (97.21, −40)
  const tz = [[0, 0], [100, 0], [80, 60], [20, 60]];
  const want = {
    follow: [[123.87, -40], [87.21, 70], [12.79, 70], [-23.87, -40]],
    square: [[110.54, -40], [110.54, 0], [87.21, 70], [12.79, 70], [-10.54, 0], [-10.54, -40]],
    mitre: [[0, -40], [100, -40], [109.49, 3.16], [87.21, 70], [12.79, 70], [-9.49, 3.16]],
    reverse: [[97.21, -40], [110.54, 0], [87.21, 70], [12.79, 70], [-10.54, 0], [2.79, -40]],
  };
  for (const k of S.RULES) { r = cut(tz, { w: 10, e: { 0: 40 }, k: { 0: k, 1: k } }); ok(nearPts(r, want[k]), 'trapezoid, hem 4 cm, corner rule "' + k + '"', show(r)); }
  // the top corners keep "follow" (no rule set): equal widths meet on the bisector
  r = cut(tz, { w: 10, e: { 0: 40 }, k: { 0: 'square' } });
  ok(r.some((p) => near(p.x, 123.87, 0.01) && near(p.y, -40, 0.01)) && r.some((p) => near(p.x, -10.54, 0.01) && near(p.y, -40, 0.01)), 'a rule is per corner: square at one, the others stay "follow"', show(r));
  r = cut([[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]], { w: 10 });
  ok(nearPts(r, [[110, -10], [110, 50], [50, 50], [50, 110], [-10, 110], [-10, -10]]), 'an inside corner is trimmed where the cut lines cross', show(r));
  // a curved edge: half a circle of radius 50 (centre 50,0) on top of a straight bottom; 10 out → radius 60
  const half = [[0, 0], [100, 0], ...Array.from({ length: 7 }, (_, i) => { const a = (i + 1) * Math.PI / 8; return [50 + 50 * Math.cos(a), 50 * Math.sin(a), 1]; }), [0, 0]].slice(0, -1);
  r = cut(half, { w: 10 });
  const sewHalf = C.sampled(C.ptsOf(half)).path;
  const onArc = r.filter((p) => p.y > 5);
  const away = onArc.map((p) => C.nearest(sewHalf, p).dist);
  ok(onArc.length > 20 && Math.min(...away) > 9.95 && Math.max(...away) < 10.05, 'a curve offsets to a parallel curve: every cut point on it is 10 from the sew line (±0.05)', Math.min(...away).toFixed(3) + ' … ' + Math.max(...away).toFixed(3));
  const radii = onArc.filter((p) => p.y > 30).map((p) => Math.hypot(p.x - 50, p.y));
  ok(Math.min(...radii) > 59.9 && Math.max(...radii) < 60.1, 'away from its ends the half circle r 50 offsets to r 60', Math.min(...radii).toFixed(3) + ' … ' + Math.max(...radii).toFixed(3));
  const low = r.filter((p) => p.y < 1);
  ok(low.length === 2 && low.every((p) => near(p.y, -10, 1e-6)) && low[0].x > 110 && low[1].x < -10, 'where the curve meets the straight bottom, the corners follow: on the bottom cut line, past the curve\'s cut line', show(low));
  // a smooth closed outline (a circle of curve points): 10 out all round
  const ring = Array.from({ length: 12 }, (_, i) => [50 * Math.cos(i * Math.PI / 6), 50 * Math.sin(i * Math.PI / 6), 1]);
  r = cut(ring, { w: 10 });
  const ringR = r.map((p) => Math.hypot(p.x, p.y));
  ok(Math.min(...ringR) > 59.7 && Math.max(...ringR) < 60.05, 'a round piece: the cut line is 10 out all round', Math.min(...ringR) + ' ' + Math.max(...ringR));
  ok(cut(rect, null).length === 4 && S.widthOf(null, 0) === 0 && S.widthOf({ w: 5, e: { 2: 0 } }, 2) === 0 && S.widthOf({ w: 5, e: {} }, 2) === 5, 'no allowance = the sew line; 0 on an edge = none there');
  ok(S.ruleOf({ k: { 1: 'bogus' } }, 1) === 'follow', 'an unknown rule reads as follow');
}

// ------------------------------------------------------------------------------------------------ AP.2 pieces
section('AP.2 pattern pieces: from CadCraft geometry, untrusted data, drawing, grips (piece.js)');
{
  const rectPoly = { type: 'poly', closed: true, pts: [{ x: 0, y: 0, b: 0 }, { x: 0, y: 50, b: 0 }, { x: 100, y: 50, b: 0 }, { x: 100, y: 0, b: 0 }] };
  let g = PC.fromPoly(rectPoly);
  ok(g.pts && g.pts.length === 4 && C.area(C.sampled(C.ptsOf(g.pts)).path) > 0 && g.pts.every((p) => p[2] === 0), 'a clockwise rectangle → four corners, counter-clockwise');
  // a polyline with a half-circle bulge on top: 0,0 → 100,0 → 100,50 (bulge 1: half circle to 0,50) → 0,50
  const bulged = { type: 'poly', closed: true, pts: [{ x: 0, y: 0, b: 0 }, { x: 100, y: 0, b: 0 }, { x: 100, y: 50, b: 1 }, { x: 0, y: 50, b: 0 }] };
  g = PC.fromPoly(bulged);
  const cp = g.pts.filter((p) => p[2] === 1);
  ok(cp.length >= 10 && cp.every((p) => near(Math.hypot(p[0] - 50, p[1] - 50), 50, 1e-6) && p[1] > 50), 'a bulge becomes curve points on its arc (half circle r 50 above the top)', JSON.stringify(cp.slice(0, 2)));
  g = PC.fromChain([{ type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }, { type: 'line', x1: 100, y1: 60, x2: 0, y2: 60 }, { type: 'line', x1: 0, y1: 0, x2: 0, y2: 60 }, { type: 'arc', cx: 100, cy: 30, r: 30, a0: -Math.PI / 2, a1: Math.PI / 2 }]);
  ok(g.pts && g.pts.filter((p) => !p[2]).length === 4 && g.pts.some((p) => near(p[0], 130) && near(p[1], 30, 1e-6)), 'three lines and an arc, picked in any order and either way round, join into one outline', JSON.stringify(g));
  ok(PC.fromChain([{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }, { type: 'line', x1: 5, y1: 5, x2: 6, y2: 5 }]).error === 'gap', 'lines that do not join: refused (gap)');
  ok(PC.fromChain([{ type: 'line', x1: 0, y1: 0, x2: 1, y2: 0 }, { type: 'line', x1: 1, y1: 0, x2: 1, y2: 1 }]).error === 'open', 'an open chain: refused (open)');
  ok(PC.fromPoly({ type: 'poly', closed: false, pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }).error === 'open' && PC.fromPoly({ type: 'text' }).error === 'type', 'an open polyline or a text: refused');
  ok(PC.fromPoly({ type: 'circle', cx: 0, cy: 0, r: 40 }).pts.every((p) => p[2] === 1), 'a circle → a round piece of curve points');

  // untrusted data
  ok(PC.cleanPiece(null) === null && PC.cleanPiece({ pts: [[0, 0], [1, 1]] }) === null, 'no outline (fewer than 3 points): refused');
  const dirty = PC.cleanPiece({ name: 'Front\u0000<b>', qty: 2.5, pts: [[0, 0], [10, 0], ['x', 1], [10, 10], [0, 10, 1]], sa: { w: -3, e: { 1: 5, x: 9, 99: 4 }, k: { 1: 'square', 2: 'drop table' } }, notches: [{ i: 1, d: 3, k: 'evil' }, { i: 99, d: 1 }], drills: [[1, 2], [NaN, 1]], grain: { a: [0, 0], b: [1e9, 0] }, extra: 'gone' });
  ok(dirty && dirty.pts.length === 4 && dirty.name === 'Front <b>' && dirty.qty === 1 && dirty.sa.w === 0 && JSON.stringify(dirty.sa.e) === '{"1":5}' && JSON.stringify(dirty.sa.k) === '{"1":"square"}', 'cleanPiece: bad points, widths, rules, control characters and odd quantities dropped', JSON.stringify(dirty));
  ok(dirty.notches.length === 1 && dirty.notches[0].k === 'slit' && dirty.drills.length === 1 && dirty.grain === null && !('extra' in dirty), 'cleanPiece: notches on unknown edges, unknown kinds, broken drills and far-away grain lines dropped');

  // drawing
  const data = { ...PC.emptyPiece('mm'), name: 'Front', style: 'B101', size: 'M', qty: 2, fabric: 'Linen', pts: [[0, 0, 0], [100, 0, 0], [100, 50, 0], [0, 50, 0]], sa: { w: 10, e: {}, k: {} },
    notches: [{ i: 0, d: 50, k: 'slit' }, { i: 1, d: 25, k: 'v' }, { i: 2, d: 30, k: 't' }], grain: { a: [50, 10], b: [50, 40], s: 'both' }, drills: [[30, 25]], buttons: [[70, 25, 12]], holes: [[70, 40, 16, 0]],
    lines: [{ p: [[20, 0, 0], [30, 20, 0], [40, 0, 0]] }], fold: { a: [0, 0], b: [0, 50] } };
  const ents = PC.drawPiece(data, { t: Text.t });
  const role = (r) => ents.filter((e) => e.role === r);
  ok(role('cut').length === 1 && role('cut')[0].closed && nearPts(role('cut')[0].pts, [[110, -10], [110, 60], [-10, 60], [-10, -10]]), 'the cut line, 1 cm out');
  ok(role('sew').length === 1 && role('sew')[0].lt === 'DASHED' && role('sew')[0].pts.length === 4, 'the sew line, dashed');
  const n0 = role('notch')[0];
  ok(n0.type === 'line' && near(n0.x1, 50) && near(n0.y1, -10) && near(n0.x2, 50) && near(n0.y2, -4), 'a slit notch: on the cut line, 6 mm in, square to the edge', JSON.stringify(n0));
  const v = role('notch').find((e) => e.type === 'poly');
  ok(v && near(v.pts[0].x, 110) && near(v.pts[1].x, 104) && near(v.pts[1].y, 25) && near(Math.abs(v.pts[0].y - v.pts[2].y), 3), 'a V notch: 3 mm wide at the cut line, its point 6 mm in', JSON.stringify(v && v.pts));
  ok(role('notch').length === 4, 'a T notch is a slit and its crossbar');
  ok(role('grain').length === 3 && role('fold').length === 1 && role('fold')[0].lt === 'CENTER', 'grain line with two arrowheads; fold line in centre linetype');
  ok(role('drill').length === 3 && role('button').length === 2 && role('hole').length === 3 && role('line').length === 1, 'drill hole (circle + cross), button, buttonhole (with end bars), internal line');
  const labels = role('label').map((e) => e.s);
  ok(JSON.stringify(labels) === JSON.stringify(['Front', 'Style B101', 'Size M', 'Cut 2 on fold', 'Linen']), 'the label: name, style, size, how many to cut (on the fold), fabric', JSON.stringify(labels));
  ok(JSON.stringify(PC.labelLines({ ...data, fold: null, pair: true }, Text.t)) === JSON.stringify(['Front', 'Style B101', 'Size M', 'Cut 2 pair', 'Linen']), 'a mirrored pair: "Cut 2 pair"');
  const net = PC.drawPiece({ ...data, sa: null }, { t: Text.t });
  ok(!net.some((e) => e.role === 'sew') && nearPts(net.find((e) => e.role === 'cut').pts, [[0, 0], [100, 0], [100, 50], [0, 50]]) && near(net.find((e) => e.role === 'notch').y1, 0), 'a net pattern: the cut line is the sew line, notches on it');
  ok(ents.every((e) => Object.values(e).every((x) => typeof x !== 'number' || Number.isFinite(x))), 'every number drawn is finite');
  ok(PC.drawPiece({ ...data, u: 'in' }).find((e) => e.role === 'label').h === PC.sizesFor('in').title, 'a piece in inches draws its text in inches');

  // notches follow the edge
  const nn = PC.placeNotch(data, { x: 98, y: 20 }, 'v');
  ok(nn && nn.i === 1 && near(nn.d, 20) && nn.k === 'v', 'placeNotch: the nearest edge and the distance along it');
  const moved = PC.gripMove(data, 'p2', { x: 120, y: 50 });
  const q = PC.notchPlace(moved, { i: 1, d: 25 });
  ok(moved && near(q.sx, 100 + 20 * (25 / Math.hypot(20, 50)), 1e-6) && near(q.sy, 50 * (25 / Math.hypot(20, 50)), 1e-6), 'moving a corner: the notch stays 25 along its edge');
  ok(PC.gripMove(data, 'p0', { x: 200, y: 200 }) === null, 'a grip move that turns the piece inside out is refused');
  const gr = PC.gripsOf(data).map((x) => x.key);
  ok(['p0', 'p3', 'ga', 'gb', 'fa', 'fb', 'l0.1', 'd0', 'b0', 'h0'].every((k) => gr.includes(k)), 'grips: outline points, grain and fold ends, internal line points, drill holes, buttons, buttonholes', gr.join(' '));
  ok(near(PC.gripMove(data, 'ga', { x: 5, y: 6 }).grain.a[1], 6) && PC.gripMove(data, 'zz', { x: 0, y: 0 }) === null, 'grain grip moves its end; an unknown grip does nothing');
}

const extra = fs.readdirSync(HERE).filter((f) => /^t-.*\.mjs$/.test(f)).sort();
for (const f of extra) await import(pathToFileURL(path.join(HERE, f)).href);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
