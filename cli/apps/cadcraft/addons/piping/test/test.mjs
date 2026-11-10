#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test.mjs — the Piping add-on's Node tests (0.5 MQ.2, MQ.5). The tables against the standards' printed figures, runs, fittings,
 * slope and the schedule against examples worked by hand (each worked beside it), then the add-on in CadCraft (t-addon.mjs),
 * files with and without it (t-files.mjs) and the TakeoffCraft link (t-takeoff.mjs).
 *   node public_html/assets/apps/cadcraft/dev/addons/piping/test/test.mjs [--verbose]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDON = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const APP = path.resolve(ADDON, '../..');
const ROOT = path.resolve(APP, '../../../../..');
const load = (f) => import(pathToFileURL(path.join(APP, f)).href);
const mine = (f) => import(pathToFileURL(path.join(ADDON, f)).href);

const I18n = await load('i18n.js');
I18n.init({ strings: JSON.parse(fs.readFileSync(path.join(APP, 'lang/en.json'), 'utf8')) });
const EN = JSON.parse(fs.readFileSync(path.join(ADDON, 'lang/en.json'), 'utf8'));
const M = await mine('lib/mep-core.js');
const missing = new Set();
const look = M.lookupFrom(EN);
M.setT((k, v) => { if (!Object.prototype.hasOwnProperty.call(EN, k)) missing.add(k); return look(k, v); });
const T = await mine('lib/tables.js');
const PP = await mine('lib/pipe.js');
const SY = await mine('lib/symbols.js');
const MAIN = await mine('main.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; if (VERBOSE) console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const section = (s) => console.log('\n' + s);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const rel = (a, b, r) => Math.abs(a - b) <= r * Math.abs(b);
globalThis.__ppTest = { ok, section, near, rel, load, mine, ADDON, APP, ROOT, VERBOSE, EN, missing };

section('The shared core: one file, two byte-identical copies');
{
  const a = fs.readFileSync(path.join(ADDON, 'lib/mep-core.js')), b = fs.readFileSync(path.join(ADDON, '../hvac/lib/mep-core.js'));
  ok(Buffer.compare(a, b) === 0, 'piping/lib/mep-core.js is byte-identical to hvac/lib/mep-core.js (the canonical one)');
}

section('Tables: the standards\' printed figures');
{
  const s2 = T.pipeSize('steel', '40', '2');
  ok(s2 && s2.od === 2.375 && s2.wall === 0.154 && near(s2.id, 2.067, 1e-9) && s2.dn === 50, 'ASME B36.10M: NPS 2 Sch 40 — OD 2.375, wall 0.154, ID 2.067 in, DN 50', JSON.stringify(s2));
  const s4 = T.pipeSize('steel', '80', '4');
  ok(s4 && near(s4.id, 3.826, 1e-9), 'NPS 4 Sch 80: ID 4.500 − 2 × 0.337 = 3.826 in');
  ok(T.pipeSize('steel', '40', '24').od === 24 && T.pipeSize('steel', '40', '1/8').od === 0.405 && T.pipeSize('steel', '80', '12').wall === 0.688, 'NPS 1/8 to 24: 0.405 … 24 in; NPS 12 Sch 80 wall 0.688');
  const c = T.pipeSize('copper', 'L', '3/4'), m = T.pipeSize('copper', 'M', '1/2');
  ok(c && c.od === 0.875 && c.wall === 0.045 && near(c.id, 0.785, 1e-9) && m && near(m.id, 0.569, 1e-9), 'ASTM B88: 3/4 type L — OD 0.875 (nominal + 1/8), wall 0.045, ID 0.785; 1/2 type M ID 0.569');
  ok(T.pipeSize('copper', 'M', '1/4') === null && T.pipeSize('copper', 'M', '5/8') === null && T.pipeSize('copper', 'K', '5/8').wall === 0.049, 'type M is not made in 1/4 or 5/8 (refused); 5/8 K is');
  const p = T.pipeSize('pvc', '40', '4');
  ok(p && p.od === 4.5 && p.wall === 0.237 && T.pipeSize('pvc', '80', '10').wall === 0.593 && T.pipeSize('pvc', '40', '1/4') === null, 'ASTM D1785: 4 Sch 40 OD 4.500 (as steel), wall 0.237; 10 Sch 80 0.593; no 1/4');
  // ASTM F876, SDR 9: OD = nominal + 1/8; wall = OD/9, at least 0.070: 1/2 → 0.625/9 = 0.0694 → 0.070; 3/4 → 0.875/9 = 0.0972
  const x = T.pipeSize('pex', 'SDR9', '1/2'), y = T.pipeSize('pex', 'SDR9', '3/4');
  ok(x && x.od === 0.625 && x.wall === 0.07 && y && near(y.wall, 0.875 / 9, 1e-12) && near(y.id, 0.6806, 1e-4), 'ASTM F876: 1/2 PEX wall 0.070 (the minimum), 3/4 wall 0.0972, ID 0.681');
  // plain-end weight: 10.69 × (2.375 − 0.154) × 0.154 = 3.6563 lb/ft (B36.10M prints 3.66); SI: 0.0246615 × 56.39 × 3.91 = 0.0246615 × 220.485 = 5.4375 kg/m (5.44)
  ok(near(T.steelWeightLbFt(2.375, 0.154), 3.6563, 1e-4) && near(T.steelWeightKgM(60.3, 3.91), 5.4375, 1e-4), 'steel weight: NPS 2 Sch 40 = 3.656 lb/ft = 5.44 kg/m');
  ok(T.bendRadius(T.pipeSize('steel', '40', '2')) === 3 && T.bendRadius(T.pipeSize('steel', '40', '3/4')) === 1.12 && T.bendRadius(T.pipeSize('copper', 'L', '1')) === 1.125, 'ASME B16.9 long radius: NPS 2 → 3 in, NPS 3/4 → 1.12 in; copper drawn at one OD');
  ok(near(T.minDrainSlope(2), 0.25 / 12) && near(T.minDrainSlope(2.5), 0.25 / 12) && near(T.minDrainSlope(4), 0.125 / 12) && near(T.minDrainSlope(8), 0.0625 / 12), 'IPC Table 704.1: 2-1/2 and under 1/4 in/ft, 3–6 in 1/8, 8 in and over 1/16');
  ok(T.nominal('1-1/4') === 1.25 && T.nominal('3/8') === 0.375 && T.nominal('10') === 10 && Number.isNaN(T.nominal('x')), 'size names: 1-1/4 = 1.25, 3/8 = 0.375');
  ok(T.sizesFor('copper', 'M').length === 11 && T.sizesFor('pex', 'SDR9').length === 7 && T.sizesFor('steel', '40').length === 23, 'sizes per material and class');
}

section('Typed sizes and slopes');
{
  ok(MAIN.parseSize('1 1/2', 'steel', '40') === '1-1/2' && MAIN.parseSize('2"', 'steel', '40') === '2' && MAIN.parseSize('1.5', 'steel', '40') === '1-1/2' && MAIN.parseSize('DN50', 'steel', '40') === '2', '1 1/2, 2", 1.5 and DN50 read as NPS sizes');
  ok(MAIN.parseSize('50', 'steel', '40', 'mm') === '2' && MAIN.parseSize('50', 'steel', '40', 'in') === null && MAIN.parseSize('7', 'steel', '40') === null, 'a bare 50 is DN50 in a metric drawing; NPS 7 does not exist');
  ok(near(MAIN.parseSlope('1/4'), 0.25 / 12) && near(MAIN.parseSlope('0.125'), 0.125 / 12) && near(MAIN.parseSlope('2', 'mm'), 0.02) && near(MAIN.parseSlope('1%'), 0.01) && MAIN.parseSlope('x') === null, 'slopes: 1/4 in/ft, 0.125 in/ft, 2 % (metric), 1 % typed with its sign');
  ok(PP.slopeText({ u: 'in', slope: 0.125 / 12 }) === '1/8 in/ft' && PP.slopeText({ u: 'mm', slope: 0.02 }) === '2 %', 'slope text: 1/8 in/ft, 2 %');
}

const run = (o) => PP.cleanPipe({ id: 'pipe01', u: 'in', k: 1, mat: 'steel', cls: '40', sys: 'cw', pts: [[0, 0], [120, 0], [120, 120]], segs: [{ size: '2' }], z: 108, sym: 12, ...o });

section('Runs: data, elbows, reducers, branches, valves (a drawing in inches)');
{
  ok(PP.cleanPipe(null) === null && PP.cleanPipe({ mat: 'steel', cls: '40', pts: [[0, 0], [1, 0]], segs: [{ size: '7' }] }) === null, 'refused: nothing, an NPS that does not exist');
  const d = PP.cleanPipe({ id: 'X', mat: 'gold', cls: '99', sys: 'evil', pts: [[0, 0], [0, 0], [10, 0]], segs: [{ size: '2' }], slope: -1, lines: 'triple', valves: [{ s: 5, type: 'gate' }, { s: 50, type: 'gate' }, { s: 1, type: 'bomb' }] });
  ok(d && d.mat === 'steel' && d.cls === '40' && d.sys === 'cw' && d.id !== 'X' && d.slope === 0 && d.lines === 'single' && d.valves.length === 1 && d.pts.length === 2, 'cleanPipe: unknown material, class, system, slope, lines; valves off the run or of no kind dropped', JSON.stringify(d));
  // an L of 2" steel: B16.9 long radius R = 3 → tangent 3 tan 45° = 3
  const L = run({ lines: 'double' });
  const lay = PP.layoutPipe(L);
  ok(lay.elbows.length === 1 && lay.elbows[0].R === 3 && near(lay.elbows[0].T, 3) && near(lay.pieces[0].s1, 117) && near(lay.pieces[1].s0, 3), 'a 90° turn: a long-radius elbow R 3 in, pieces stop 3 in short');
  const ents = PP.drawPipe(L);
  const arcs = ents.filter((e) => e.type === 'arc');
  ok(arcs.length === 2 && arcs.some((a) => near(a.r, 3 + 1.1875)) && arcs.some((a) => near(a.r, 3 - 1.1875)), 'double line: the elbow\'s outside (r 4.1875) and inside (r 1.8125)', JSON.stringify(arcs.map((a) => a.r)));
  ok(ents.some((e) => e.type === 'line' && near(e.y1, 1.1875) && near(e.y2, 1.1875)), 'the sides 1.1875 in (half of 2.375) from the centerline');
  const single = PP.drawPipe(run({}));
  ok(single.filter((e) => e.type === 'line').length === 2 && !single.some((e) => e.type === 'arc') && single.some((e) => e.type === 'text' && e.s === '2" CW'), 'single line: the centerline corner to corner, labelled 2" CW', JSON.stringify(single.filter((e) => e.type === 'text').map((e) => e.s)));
  // a size change on a straight: reducer 1.5 × the larger OD = 3.5625 in
  const R = run({ pts: [[0, 0], [60, 0], [120, 0]], segs: [{ size: '2' }, { size: '1-1/2' }], lines: 'double' });
  const lr = PP.layoutPipe(R);
  ok(lr.reducers.length === 1 && near(lr.reducers[0].len, 3.5625) && lr.reducers[0].from === '2' && lr.reducers[0].to === '1-1/2', 'a size change: a concentric reducer 2 × 1-1/2, 3.5625 in long');
  // a branch: main 2" (0,0)→(240,0), branch 1" from (120,0) up
  const main = { id: 'main01', data: run({ id: 'main01', pts: [[0, 0], [240, 0]] }) };
  const br = { id: 'br0001', data: run({ id: 'br0001', pts: [[120, 0], [120, 60]], segs: [{ size: '1' }] }) };
  const lk = PP.linkPipes([main, br]);
  ok(lk.get('br0001').s && lk.get('br0001').s.kind === 'tee' && near(lk.get('br0001').s.cut, 1.1875) && lk.get('br0001').s.main === '2' && lk.get('main01').taps.length === 1, 'a branch off the main: a tee, cut back half the main\'s OD', JSON.stringify(lk.get('br0001')));
  const f = PP.fittingsOf({ ...br.data, links: lk.get('br0001') });
  ok(f.length === 1 && f[0].name === 'Reducing tee 2" × 1"', 'it is a reducing tee 2" × 1"', JSON.stringify(f));
  const wy = { id: 'br0002', data: run({ id: 'br0002', pts: [[60, 0], [120, 60]], segs: [{ size: '2' }] }) };
  ok(PP.fittingsOf({ ...wy.data, links: PP.linkPipes([main, wy]).get('br0002') })[0].name === 'Wye 2" × 2"', 'a branch at 45°: a wye');
  // valves
  const V = run({ pts: [[0, 0], [240, 0]], valves: [{ s: 60, type: 'gate' }, { s: 180, type: 'check' }] });
  const vs = PP.valvesOf(V);
  ok(vs.length === 2 && near(vs[0].p.x, 60) && vs[0].l === 12 && vs[0].h === 6, 'valves sit at 60 and 180, 12 long (the symbol size)');
  const vents = PP.drawPipe(V);
  ok(vents.filter((e) => e.type === 'line').length === 3 && vents.filter((e) => e.type === 'poly' && e.closed).length === 4 && vents.some((e) => e.type === 'hatch'), 'single line broken at both valves; a gate (two triangles) and a check (one of them filled)');
  const vd = PP.drawPipe({ ...V, lines: 'double' });
  ok(PP.valvesOf({ ...V, lines: 'double' })[0].h >= 1.4 * 2.375 && vd.filter((e) => e.type === 'line' && near(e.y1, 1.1875) && near(e.y2, 1.1875)).length === 3, 'double line: the valve body shows past the pipe; the sides broken at both valves');
  // moving
  const moved = PP.transformPipe(V, [1, 0, 0, 1, 10, 5]);
  ok(near(moved.pts[0][0], 10) && near(moved.pts[1][1], 5) && moved.valves[0].s === 60, 'MOVE: points move, valves stay where they are along the run');
  const sc = PP.transformPipe(V, [1 / 12, 0, 0, 1 / 12, 0, 0]);
  ok(near(sc.k, 12) && near(sc.valves[0].s, 5) && near(sc.sym, 1) && near(PP.odOf(sc, '2'), 2.375 / 12), 'scaled 1/12 (inches to feet): OD 2.375 in = 0.198 drawing units, the valve at 5 ft');
}

section('Slope and drainage (IPC Table 704.1)');
{
  // a 4" PVC sanitary drain, 40 ft at 1/8 in/ft: drop 40 × 1/8 = 5 in; true length 480 × √(1 + (1/96)²) = 480.026 in = 40.0022 ft
  const D = run({ mat: 'pvc', sys: 'san', pts: [[0, 0], [480, 0]], segs: [{ size: '4' }], slope: 0.125 / 12, z: 60 });
  const S = PP.schedule([D]);
  ok(near(S.runs[0].z1, 55) && near(S.pipes[0].len, 480 * Math.sqrt(1 + (1 / 96) ** 2) / 12, 1e-9) && !S.problems.length, '4" drain, 40 ft at 1/8 in/ft: falls 5 in (60 → 55), 40.0022 ft along the slope, meets the code', JSON.stringify(S.runs[0]));
  const D2 = run({ mat: 'pvc', sys: 'san', pts: [[0, 0], [480, 0]], segs: [{ size: '2' }], slope: 0.125 / 12 });
  ok(PP.schedule([D2]).problems.some((p) => p.kind === 'slope' && near(p.need, 0.25 / 12)), 'a 2" drain at 1/8 in/ft: too flat — the code asks 1/4');
  ok(PP.schedule([run({ mat: 'pvc', sys: 'storm', segs: [{ size: '4' }] })]).problems.some((p) => p.kind === 'flat'), 'a level storm drain is reported');
  ok(!PP.schedule([run({ sys: 'cw' })]).problems.length, 'a level water pipe is fine');
  const txt = PP.drawPipe(D).filter((e) => e.type === 'text').map((e) => e.s);
  ok(txt.includes('1/8 in/ft') && PP.drawPipe(D).some((e) => e.type === 'hatch'), 'a sloped run shows its slope and a flow arrow', JSON.stringify(txt));
  const rings = PP.pipeRings(D);
  const zc = (r) => r.reduce((s, p) => s + p[2], 0) / r.length;
  ok(near(zc(rings[0]), 60, 1e-9) && near(zc(rings[rings.length - 1]), 55, 1e-9), '3D: the centerline falls from 60 to 55 in');
}

section('Schedule: pipe, fittings, valves, weight (worked by hand)');
{
  // the L: 120 + 120 = 240 in = 20 ft of 2" Sch 40 → 20 × 3.6563 = 73.13 lb; one 90° elbow
  const S = PP.schedule([run({ tag: 'CW-1' })]);
  ok(S.pipes.length === 1 && near(S.pipes[0].len, 20) && near(S.pipes[0].weight, 20 * 10.69 * 2.221 * 0.154, 1e-9) && S.pipes[0].name === 'Pipe 2" steel Sch 40', '2" steel Sch 40: 20 ft (center to center), 73.13 lb', JSON.stringify(S.pipes[0]));
  ok(S.fittings.length === 1 && S.fittings[0].name === '90° elbow 2" (steel Sch 40)' && S.fittings[0].n === 1, 'one 90° elbow 2"');
  const main = run({ id: 'main01', pts: [[0, 0], [240, 0]], valves: [{ s: 60, type: 'gate' }] });
  const br = run({ id: 'br0001', pts: [[120, 0], [120, 60]], segs: [{ size: '1' }] });
  const lk = PP.linkPipes([{ id: 'main01', data: main }, { id: 'br0001', data: br }]);
  const S2 = PP.schedule([{ ...main, links: lk.get('main01') }, { ...br, links: lk.get('br0001') }]);
  ok(near(S2.pipes.find((r) => r.size === '2').len, 20) && near(S2.pipes.find((r) => r.size === '1').len, 5), 'main 2" 20 ft, branch 1" 5 ft (from the main\'s centerline)');
  ok(S2.fittings.some((f) => f.name === 'Gate valve 2" (steel Sch 40)') && S2.fittings.some((f) => f.name === 'Reducing tee 2" × 1" (steel Sch 40)') && S2.totals.valves === 1 && S2.totals.fittings === 1, 'a gate valve 2" and a reducing tee 2" × 1"');
  // metric naming: the same 2" steel in a metric drawing is DN50; 6 m of it weighs 6 × 5.44 kg
  const mm = PP.cleanPipe({ id: 'mm0001', u: 'mm', k: 1 / 25.4, mat: 'steel', cls: '40', pts: [[0, 0], [6000, 0]], segs: [{ size: '2' }], z: 2700 });
  const Sm = PP.schedule([mm]);
  ok(Sm.pipes[0].name === 'Pipe DN50 steel Sch 40' && near(Sm.pipes[0].len, 6, 1e-9) && near(Sm.pipes[0].weight, 6 * T.steelWeightKgM(2.375 * 25.4, 0.154 * 25.4), 1e-9) && rel(Sm.pipes[0].weight, 32.62, 2e-3), 'metric: DN50, 6 m, 32.6 kg', JSON.stringify(Sm.pipes[0]));
  const cu = PP.cleanPipe({ id: 'cu0001', u: 'mm', k: 1 / 25.4, mat: 'copper', cls: 'L', pts: [[0, 0], [1000, 0]], segs: [{ size: '3/4' }] });
  ok(PP.sizeLabel(cu, '3/4') === '3/4 (22.2 mm)', 'copper in a metric drawing: 3/4 (22.2 mm)');
}

section('3D: one closed solid per run');
{
  const vol = (d) => M.signedVolume(PP.pipeSolid(d));
  // a straight 2" pipe 120 in long: a 16-sided prism, area ½ · 16 · 1.1875² · sin 22.5° = 4.3172 in² → 518.07 in³
  ok(rel(vol(run({ pts: [[0, 0], [120, 0]] })), 120 * 8 * 1.1875 ** 2 * Math.sin(Math.PI / 8), 1e-9), 'a straight 2" pipe: 518.07 in³ (16-sided)');
  const L = run({});
  const want = (2 * 117 + 3 * Math.PI / 2) * 8 * 1.1875 ** 2 * Math.sin(Math.PI / 8);
  ok(rel(vol(L), want, 0.01), 'an L with its long-radius elbow: within 1 % of Pappus', vol(L) + ' vs ' + want);
}

section('Symbols');
{
  ok(SY.SYMBOLS.every((s) => SY.drawSymbol(s, 10, 5, 'PI 101').length > 0), 'every symbol draws');
  const g = SY.drawSymbol('gate', 10, 5);
  ok(g.length === 2 && g[0].pts.some((p) => near(p.x, -5) && near(p.y, 2.5)) && g[1].pts.some((p) => near(p.x, 0) && near(p.y, 0)), 'a gate valve: two triangles meeting at the center');
  const inst = SY.drawSymbol('instrument', 10, 5, 'PI 101').filter((e) => e.type === 'text').map((e) => e.s);
  ok(JSON.stringify(inst) === '["PI","101"]', 'an instrument balloon: its letters over its number');
  const pl = SY.placeEnts([{ type: 'line', x1: 1, y1: 0, x2: 2, y2: 0 }], { x: 10, y: 10 }, Math.PI / 2);
  ok(near(pl[0].x1, 10) && near(pl[0].y1, 11) && near(pl[0].y2, 12), 'placeEnts turns and moves');
}

const extra = fs.readdirSync(HERE).filter((f) => /^t-.*\.mjs$/.test(f)).sort();
for (const f of extra) await import(pathToFileURL(path.join(HERE, f)).href);

section('Words');
ok(!missing.size, 'every string the add-on asked for is in lang/en.json', [...missing].join(', '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
