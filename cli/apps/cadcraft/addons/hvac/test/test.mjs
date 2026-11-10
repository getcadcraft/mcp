#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test.mjs — the HVAC add-on's Node tests (0.5 MQ.1, MQ.5). The DOM-free modules against examples worked by hand (each
 * worked in the comment beside it), then the add-on in CadCraft's own loader and command line (t-addon.mjs) and the
 * TakeoffCraft link (t-takeoff.mjs), and every other t-*.mjs here.
 *   node public_html/assets/apps/cadcraft/dev/addons/hvac/test/test.mjs [--verbose]
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
const S = await mine('lib/sizing.js');
const D = await mine('lib/duct.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; if (VERBOSE) console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const section = (s) => console.log('\n' + s);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const rel = (a, b, r) => Math.abs(a - b) <= r * Math.abs(b);
globalThis.__hvTest = { ok, section, near, rel, load, mine, ADDON, APP, ROOT, VERBOSE, EN, missing };

// ------------------------------------------------------------------------------------------------ friction
section('Friction: Darcy–Weisbach with Colebrook, standard air (ASHRAE Fundamentals, Duct Design)');
{
  // 1000 cfm in a 12 in round galvanized duct, worked by hand:
  //   Q = 1000 × 0.000471947 = 0.471947 m³/s;  D = 0.3048 m;  A = π/4 · 0.3048² = 0.072966 m²;  V = 6.4681 m/s (1273.2 fpm)
  //   Re = V·D/ν = 6.4681 × 0.3048 / 1.51e-5 = 130 560;  ε/D = 0.09 / 304.8 = 2.9528e-4
  //   Colebrook from f = 0.02:  f = 0.018601 → 0.018703 → 0.018695 (three steps by hand)
  //   Δp/L = (f/D) · ρV²/2 = (0.018695 / 0.3048) × (1.204 × 6.4681² / 2) = 0.061335 × 25.185 = 1.5447 Pa/m
  //        = 1.5447 / 8.17224 = 0.1890 in. w.g. per 100 ft  (a friction chart reads about 0.19 there)
  const r = S.roundLoss(1000 * S.CFM, 12 * S.IN);
  ok(rel(r.V, 6.4681, 1e-4) && rel(r.V / S.FPM, 1273.2, 1e-4), 'velocity 6.4681 m/s = 1273.2 fpm', r.V);
  ok(rel(r.Re, 130560, 1e-3), 'Reynolds number 130 560', r.Re);
  ok(rel(r.f, 0.018695, 2e-4), 'Colebrook friction factor 0.018695', r.f);
  ok(rel(r.rate, 1.5447, 1e-3) && rel(r.rate / S.PER_100FT, 0.1890, 2e-3), 'friction 1.5447 Pa/m = 0.1890 in. w.g./100 ft', r.rate + ' ' + r.rate / S.PER_100FT);
  // Altshul–Tsal, ASHRAE's explicit form: f' = 0.11 (2.9528e-4 + 68/130560)^0.25 = 0.11 × (8.1611e-4)^0.25 = 0.018592
  const at = S.altshulTsal(r.Re, 0.09 / 304.8);
  ok(rel(at, 0.018592, 1e-3) && rel(at, r.f, 0.01), 'Altshul–Tsal gives 0.018592, within 1 % of Colebrook', at);
  // 500 L/s in 315 mm: V = 0.5 / (π/4 · 0.315²) = 6.4160 m/s; Re = 133 844; Swamee–Jain by hand: f = 0.25 / log10(7.7216e-5 +
  // 1.3969e-4)² = 0.018625; Δp/L = 0.018625 / 0.315 × 1.204 × 6.416² / 2 = 1.4652 Pa/m (Colebrook within 1 % of Swamee–Jain)
  const m = S.roundLoss(500 * S.LPS, 315 * S.MM);
  ok(rel(m.V, 6.4160, 1e-4) && rel(m.Re, 133844, 1e-3) && rel(m.rate, 1.4652, 0.01), 'metric: 500 L/s in Ø315: 6.416 m/s, 1.465 Pa/m', JSON.stringify(m));
  ok(near(S.colebrook(1000, 0.001), 0.064, 1e-12), 'laminar flow: f = 64/Re');
  ok(rel(S.PER_100FT, 8.17221, 1e-4), '1 in. w.g. per 100 ft = 249.089 Pa per 30.48 m = 8.1722 Pa/m');
}

section('Equivalent diameters: Huebscher (rectangular), Heyt & Diaz (flat oval)');
{
  // 24 × 12: 1.30 × 288^0.625 / 36^0.25 = 1.30 × 34.43 / 2.4495 = 18.27 in (ASHRAE's table: 18.3)
  ok(rel(S.deRect(24, 12), 18.27, 2e-3), '24 × 12 in → De 18.3 in', S.deRect(24, 12));
  // 600 × 300 mm: 1.30 × 180000^0.625 / 900^0.25 = 1.30 × 1924.6 / 5.4772 = 456.8 mm (ASHRAE SI table: 457)
  ok(rel(S.deRect(600, 300), 456.8, 2e-3), '600 × 300 mm → De 457 mm', S.deRect(600, 300));
  // flat oval 30 × 12: A = π·144/4 + 12·18 = 329.10 in²; P = 12π + 36 = 73.70 in; De = 1.55 × 329.10^0.625 / 73.70^0.25
  //   = 1.55 × 37.44 / 2.930 = 19.81 in
  ok(near(S.ovalArea(30, 12), 329.097, 1e-3) && near(S.ovalPerimeter(30, 12), 73.699, 1e-3) && rel(S.deOval(30, 12), 19.81, 2e-3), 'flat oval 30 × 12 in: area 329.10 in², perimeter 73.70 in, De 19.81 in', S.deOval(30, 12));
  ok(near(S.deOval(12, 12), 12), 'a flat oval as wide as it is high is round');
  const sq = S.section('rect', 24, 12), ro = S.section('round', 14, 14);
  ok(sq.area === 288 && sq.perimeter === 72 && near(ro.area, Math.PI * 49) && near(ro.perimeter, Math.PI * 14), 'sections: 24 × 12 = 288 in², perimeter 72 in; Ø14 = 153.94 in², 43.98 in');
}

section('Equal-friction sizing');
{
  // 1000 cfm at 0.1 in./100 ft: by hand at D = 13.66 in: V = 4.9916 m/s, Re = 114 693, f (Swamee–Jain) = 0.018897,
  // Δp/L = 0.018897 / 0.34696 × 1.204 × 4.9916² / 2 = 0.8169 Pa/m = 0.09996 in./100 ft → the exact diameter is 13.66 in;
  // the next stocked size is 14 in: V = 1000 / (π/4 · (14/12)²) = 935.5 fpm, and the rate falls below 0.1.
  const r = S.sizeSection({ q: 1000, rate: 0.1, shape: 'round' });
  ok(r && rel(r.d, 13.66, 4e-3) && r.w === 14 && r.h === 14 && rel(r.V, 935.5, 1e-3) && r.rate < 0.1, '1000 cfm at 0.1: exact Ø13.66 → Ø14, 935.5 fpm, below 0.1', JSON.stringify(r));
  // rectangular, 12 in high: De(12 × 12) = 1.3 × 144^0.625 / 24^0.25 = 13.12 < 13.66; De(14 × 12) = 1.3 × 168^0.625 / 26^0.25 = 14.16 ≥ 13.66
  //   → 14 × 12, V = 1000 / (14 × 12 / 144) = 857.1 fpm
  const q = S.sizeSection({ q: 1000, rate: 0.1, shape: 'rect', h: 12 });
  ok(q && q.w === 14 && q.h === 12 && rel(q.de, 14.157, 1e-3) && rel(q.V, 857.14, 1e-3) && q.rate < 0.1, '…rectangular 12 in high: 14 × 12, De 14.16, 857 fpm', JSON.stringify(q));
  ok(rel(S.deRect(12, 12), 13.118, 1e-3), 'De(12 × 12) = 13.12 (one step short)');
  const tall = S.sizeSection({ q: 4000, rate: 0.1, shape: 'rect', h: 6 });
  ok(tall && tall.note === 'aspect' && tall.aspect > 4, 'a very flat duct is flagged (sides more than 4 to 1)', JSON.stringify(tall));
  const ov = S.sizeSection({ q: 1000, rate: 0.1, shape: 'oval', h: 10 });
  ok(ov && ov.w >= 10 && S.deOval(ov.w, 10) >= 13.656 && S.deOval(ov.w - 2, 10) < 13.656, 'flat oval 10 in minor axis: the smallest major axis (2 in steps) that carries it', JSON.stringify(ov));
  // metric: 472 L/s (≈ 1000 cfm) at 0.8 Pa/m: exact about 348 mm → the stocked 355
  const mm = S.sizeSection({ q: 472, rate: 0.8, shape: 'round', u: 'mm' });
  ok(mm && mm.w === 355 && mm.d > 315 && mm.d < 355 && mm.rate < 0.8, 'metric: 472 L/s at 0.8 Pa/m → Ø355', JSON.stringify(mm));
  ok(S.sizeSection({ q: 0, rate: 0.1 }) === null && S.sizeSection({ q: 1e9, rate: 0.1 }) === null, 'no airflow, or more than any duct carries: none');
  // board is rougher: the same duct loses more
  ok(S.sectionLoss({ q: 1000, shape: 'round', w: 14, h: 14, mat: 'board' }).rate > S.sectionLoss({ q: 1000, shape: 'round', w: 14, h: 14 }).rate, 'rougher duct board loses more than galvanized steel');
}

// ------------------------------------------------------------------------------------------------ runs
const run = (o) => D.cleanDuct({ id: 'test01', u: 'in', k: 1, sys: 'supply', pts: [[0, 0], [240, 0]], segs: [{ s: 'rect', w: 24, h: 12 }], z: 108, ...o });

section('Runs: untrusted data, fittings at turns, transitions, branches (drawing in inches)');
{
  ok(D.cleanDuct(null) === null && D.cleanDuct({ pts: [[0, 0]], segs: [] }) === null && D.cleanDuct({ pts: [[0, 0], [1, 0]], segs: [{ s: 'rect', w: -1, h: 2 }] }) === null, 'refused: no points, one point, a negative size');
  const dirty = D.cleanDuct({ id: 'x', u: 'mm', k: 'big', sys: 'evil', tag: 'S-1\u0000<b>', pts: [[0, 0], [0, 0], [100, 0]], segs: [{ s: 'oval', w: 300, h: 600, q: 5 }, { s: 'round', w: 200 }], elbow: 'zig', r: 99, mat: 'gold', links: { taps: [{ seg: 7, at: 1, w: 1, side: 1 }], s: { cut: -1, ang: 1 } } });
  ok(dirty === null, 'an oval narrower than it is high is refused');
  const d2 = D.cleanDuct({ id: 'x', u: 'mm', k: 'big', sys: 'evil', tag: 'S-1\u0000<b>', pts: [[0, 0], [0, 0], [100, 0]], segs: [{ s: 'round', w: 200, q: -5 }], elbow: 'zig', r: 99, mat: 'gold', links: { taps: [{ seg: 7, at: 1, w: 1, side: 1 }], s: { cut: -1, ang: 1 } } });
  ok(d2 && d2.pts.length === 2 && d2.id !== 'x' && d2.k === 1 && d2.sys === 'supply' && d2.tag === 'S-1 <b>' && d2.elbow === 'radius' && d2.r === 1.5 && d2.mat === 'galv' && !d2.segs[0].q && d2.segs[0].h === 200 && !d2.links.taps.length && !d2.links.s, 'cleanDuct: repeated points, bad id, units, system, control characters, elbow, radius, material, airflow and links dropped', JSON.stringify(d2));

  // an L: (0,0) → (240,0) → (240,240), 24 × 12, radius elbow R/W 1 → R = 24, T = 24 tan 45° = 24
  const L = run({ pts: [[0, 0], [240, 0], [240, 240]], segs: [{ s: 'rect', w: 24, h: 12 }], r: 1 });
  const lay = D.layoutDuct(L);
  ok(lay.elbows.length === 1 && near(lay.elbows[0].T, 24) && near(lay.elbows[0].R, 24) && near(lay.elbows[0].theta, Math.PI / 2), 'a 90° turn gets a radius elbow: R = 24, tangent 24');
  ok(near(lay.pieces[0].s0, 0) && near(lay.pieces[0].s1, 216) && near(lay.pieces[1].s0, 24) && near(lay.pieces[1].s1, 240), 'the straight pieces stop at the elbow: 0–216 and 24–240', JSON.stringify(lay.pieces));
  const ents = D.drawDuct(L);
  const arcs = ents.filter((e) => e.type === 'arc');
  ok(arcs.length === 2 && arcs.some((a) => near(a.r, 36)) && arcs.some((a) => near(a.r, 12)) && arcs.every((a) => near(a.cx, 216) && near(a.cy, 24)), 'the elbow draws its heel (r 36) and throat (r 12) about (216, 24)', JSON.stringify(arcs));
  const sides = ents.filter((e) => e.type === 'line' && near(e.y1, e.y2) && Math.abs(e.y1) === 12);
  ok(sides.length === 2 && sides.every((s) => near(Math.min(s.x1, s.x2), 0) && near(Math.max(s.x1, s.x2), 216)), 'the first piece: two side lines 12 either side of the centerline, 0 to 216', JSON.stringify(sides));
  ok(ents.some((e) => e.type === 'text' && e.s.startsWith('24×12')), 'a size label inside the duct');
  // mitered: T = W/2 · tan 45° = 12
  const Lm = D.layoutDuct({ ...L, elbow: 'mitred' });
  ok(near(Lm.elbows[0].T, 12) && near(Lm.pieces[0].s1, 228), 'a mitered elbow takes W/2 · tan(θ/2) = 12 off each side');
  const mEnts = D.drawDuct({ ...L, elbow: 'mitred' });
  ok(mEnts.some((e) => e.type === 'line' && near(e.x1, 252) && near(e.y1, -12) && near(e.x2, 228) && near(e.y2, 12) || (near(e.x2, 252) && near(e.y2, -12) && near(e.x1, 228) && near(e.y1, 12))), 'the mitre line runs corner to corner, (252, −12) to (228, 12)');

  // a size change on a straight: 24 × 12 then 18 × 12 → transition length 3 / tan 15° = 11.196 in
  const T = run({ pts: [[0, 0], [120, 0], [240, 0]], segs: [{ s: 'rect', w: 24, h: 12 }, { s: 'rect', w: 18, h: 12 }] });
  const lt = D.layoutDuct(T);
  ok(lt.transitions.length === 1 && near(lt.transitions[0].len, 3 / Math.tan(Math.PI / 12), 1e-9) && near(lt.pieces[1].s0, 11.196, 1e-3), 'a size change gets a transition: sides slope 15°, 11.196 in long', JSON.stringify(lt.transitions[0]));
  const lt2 = D.layoutDuct(run({ pts: [[0, 0], [120, 0], [240, 0]], segs: [{ s: 'rect', w: 24, h: 12 }, { s: 'rect', w: 23, h: 12 }] }));
  ok(near(lt2.transitions[0].len, 6), 'a small change still takes the shortest transition, 6 in');

  // a branch: main (0,0)→(240,0) 24 × 12; a Ø8 round from (120,0) up to (120,120)
  const main = { id: 'main01', data: run({ id: 'main01' }) };
  const br = { id: 'br0001', data: run({ id: 'br0001', pts: [[120, 0], [120, 120]], segs: [{ s: 'round', w: 8, h: 8 }] }) };
  const links = D.linkRuns([main, br]);
  const lb = links.get('br0001').s, tp = links.get('main01').taps[0];
  ok(lb && lb.on === 'main01' && near(lb.cut, 12) && lb.kind === 'takeoff' && near(lb.ang, 90), 'the branch starts on the main: cut back 12 (half the main), a round takeoff at 90°', JSON.stringify(lb));
  ok(tp && tp.seg === 0 && near(tp.at, 120) && near(tp.w, 8) && tp.side === 1, 'the main gets an opening 8 wide at 120 on its left side', JSON.stringify(tp));
  const rect45 = { id: 'br0002', data: run({ id: 'br0002', pts: [[60, 0], [160, 100]], segs: [{ s: 'rect', w: 10, h: 8 }] }) };
  const l45 = D.linkRuns([main, rect45]).get('br0002').s;
  ok(l45 && l45.kind === 'lateral' && near(l45.ang, 45) && near(l45.cut, 12 / Math.sin(Math.PI / 4), 1e-9), 'a rectangular branch at 45°: a lateral, cut back 12/sin 45°', JSON.stringify(l45));
  const along = { id: 'br0003', data: run({ id: 'br0003', pts: [[120, 0], [300, 0]] }) };
  ok(!D.linkRuns([main, along]).get('br0003').s, 'a run lying along the main is not a branch');
  const endOn = { id: 'br0004', data: run({ id: 'br0004', pts: [[240, 0], [240, 100]] }) };
  ok(!D.linkRuns([main, endOn]).get('br0004').s, 'a run starting at the main\'s end is not a branch (it continues it)');
  const mainL = { ...main.data, links: links.get('main01') };
  const mainEnts = D.drawDuct(mainL);
  const left = mainEnts.filter((e) => e.type === 'line' && near(e.y1, 12) && near(e.y2, 12));
  ok(left.length === 2 && left.some((e) => near(Math.max(e.x1, e.x2), 116)) && left.some((e) => near(Math.min(e.x1, e.x2), 124)), 'the main\'s left side is open from 116 to 124', JSON.stringify(left));
  const brEnts = D.drawDuct({ ...br.data, links: links.get('br0001') });
  const brSides = brEnts.filter((e) => e.type === 'line' && near(e.x1, e.x2));
  ok(brSides.length === 2 && brSides.every((e) => near(Math.min(e.y1, e.y2), 12)), 'the branch\'s sides start at the main\'s side (y = 12)', JSON.stringify(brSides));
  ok(brEnts.some((e) => e.type === 'line' && near(e.y1, 14) && near(e.y2, 14)), 'its collar ends 2 in out, with a joint', JSON.stringify(brEnts.filter((e) => e.type === 'line' && near(e.y1, e.y2))));

  // moving a run: points move, sizes stay; scaling ×12 (inches → a drawing in feet) keeps the nominal size, widens the drawn one
  const moved = D.transformDuct(L, [0, 1, -1, 0, 10, 0]);
  ok(near(moved.pts[1][0], 10) && near(moved.pts[1][1], 240) && moved.segs[0].w === 24 && moved.k === 1, 'rotated 90° and moved: points move, size and scale stay', JSON.stringify(moved.pts));
  const scaled = D.transformDuct(L, [1 / 12, 0, 0, 1 / 12, 0, 0]);
  ok(near(scaled.k, 12) && near(scaled.z, 9) && near(D.planW(scaled, scaled.segs[0]), 2), 'scaled 1/12 (inches to feet): 24 in is now 2 drawing units wide, the elevation 9 ft', JSON.stringify([scaled.k, scaled.z]));
  ok(D.layoutDuct(run({ pts: [[0, 0], [10, 0], [10, 10]] })).problems.some((p) => p.kind === 'short'), 'a section too short for its elbow is reported');
}

section('Schedule: lengths, fittings, sheet metal area (worked by hand)');
{
  const L = run({ pts: [[0, 0], [240, 0], [240, 240]], r: 1, tag: 'S-1' });
  const s = D.schedule([L]);
  // straight: 216 + 216 = 432 in = 36 ft; 36 ft × 6 ft perimeter = 216 ft²
  // elbow: centerline π/2 × 24 = 37.699 in; 72 in × 37.699 in = 2714.3 in² = 18.850 ft² — by hand, cheeks θ(Ro² − Ri²) =
  //   π/2 (36² − 12²) = 1809.6, heel θ·Ro·H = 678.6, throat θ·Ri·H = 226.2 → 2714.3 in²
  ok(s.ducts.length === 1 && near(s.ducts[0].len, 36) && near(s.ducts[0].area, 216), 'straight duct 24 × 12: 36 ft, 216 ft²', JSON.stringify(s.ducts[0]));
  ok(s.fittings.length === 1 && s.fittings[0].n === 1 && near(s.fittings[0].area, 2714.336 / 144, 1e-4) && /Radius elbow 90° 24×12 in \(R\/W 1\) \(galvanized steel\)/.test(s.fittings[0].name), 'one radius elbow 90°, 18.85 ft² (cheeks + heel + throat)', JSON.stringify(s.fittings[0]));
  ok(near(s.totals.area, 216 + 18.84955, 1e-4) && s.totals.fittings === 1, 'total sheet metal 234.85 ft²');
  // the transition: bottom and top (24 + 18)/2 × 11.196 = 235.12 in² each; sides 2 × 12 × √(11.196² + 3²) = 278.18 → 748.42 in²
  const T = run({ pts: [[0, 0], [120, 0], [240, 0]], segs: [{ s: 'rect', w: 24, h: 12 }, { s: 'rect', w: 18, h: 12 }] });
  const st = D.schedule([T]);
  const tr = st.fittings.find((f) => f.kind === 'transition');
  ok(tr && near(tr.area, 748.42 / 144, 1e-4) && /Transition 24×12 in to 18×12 in/.test(tr.name), 'a transition 24 × 12 to 18 × 12: 5.197 ft²', JSON.stringify(tr));
  ok(st.ducts.length === 2 && near(st.ducts.find((r) => r.sec.w === 18).len, (120 - 3 / Math.tan(Math.PI / 12)) / 12, 1e-9), 'the 18 × 12 straight is 120 − 11.196 in');
  // round: Ø14, 10 ft: π × 14 / 12 × 10 = 36.65 ft²; a round reducer Ø14 → Ø12 (concentric): π (7 + 6) × √(L² + 1²)
  const R = run({ pts: [[0, 0], [120, 0], [240, 0]], segs: [{ s: 'round', w: 14, h: 14 }, { s: 'round', w: 12, h: 12 }] });
  const sr = D.schedule([R]);
  // flat on the bottom, its top drops the whole 2 in: L = 2 / tan 15° = 7.464 in; area ≈ π (7 + 6) × √(7.464² + 1²) = 307.6 in²
  // (π (r1 + r2) × slant, exact for a concentric reducer; this one is eccentric, so its slant runs 7.464 … 7.73: the average)
  const red = sr.fittings[0], Lr = 2 / Math.tan(Math.PI / 12);
  ok(red && red.kind === 'transition' && /Reducer Ø14 in to Ø12 in/.test(red.name) && near(red.area, (Math.PI * 13 * Math.hypot(Lr, 1)) / 144, 1e-9) && near(red.area * 144, 307.6, 0.05), 'a round reducer Ø14 to Ø12 (flat bottom): 7.464 in long, 307.6 in²', JSON.stringify(red));
  ok(near(sr.ducts.find((r) => r.sec.w === 14).area, Math.PI * 14 / 12 * 10, 1e-9), 'Ø14, 10 ft: 36.65 ft²');
  // a branch's takeoff: Ø8 collar 2 in → π × 8 × 2 = 50.27 in²
  const main = run({ id: 'main01' }), br = run({ id: 'br0001', pts: [[120, 0], [120, 120]], segs: [{ s: 'round', w: 8, h: 8 }] });
  const lk = D.linkRuns([{ id: 'main01', data: main }, { id: 'br0001', data: br }]);
  const sb = D.schedule([{ ...main, links: lk.get('main01') }, { ...br, links: lk.get('br0001') }]);
  const tk = sb.fittings.find((f) => f.kind === 'takeoff');
  ok(tk && /Round takeoff Ø8 in on 24×12 in/.test(tk.name) && near(tk.area, (Math.PI * 16) / 144, 1e-9), 'the branch: a round takeoff Ø8 on 24 × 12, collar π × 8 × 2 in²', JSON.stringify(tk));
  ok(near(sb.ducts.find((r) => r.sec.s === 'round').len, 108 / 12) && near(sb.ducts.find((r) => r.sec.s === 'rect').len, 20), 'the branch is 120 − 12 = 108 in straight; the main keeps all 240 in');
  // airflow on a section: velocity and friction in the sections table
  const Q = run({ segs: [{ s: 'round', w: 12, h: 12, q: 1000 }] });
  const sq = D.schedule([Q]).sections[0];
  ok(rel(sq.V, 1273.2, 1e-4) && rel(sq.rate, 0.1890, 2e-3), 'a section with 1000 cfm in Ø12: 1273 fpm, 0.189 in./100 ft (the hand example above)', JSON.stringify(sq));
  // metric run in a drawing in millimetres
  const mm = D.cleanDuct({ id: 'mm0001', u: 'mm', k: 1, pts: [[0, 0], [3000, 0]], segs: [{ s: 'rect', w: 600, h: 300 }], z: 2700 });
  const sm = D.schedule([mm]);
  ok(near(sm.ducts[0].len, 3) && near(sm.ducts[0].area, 1.8 * 3) && /600×300 mm/.test(sm.ducts[0].name), 'metric: 600 × 300 for 3 m = 5.4 m² (perimeter 1.8 m)', JSON.stringify(sm.ducts[0]));
  const both = D.schedule([run({}), mm]);
  ok(both.u === 'in' && both.ducts.length === 2 && near(both.ducts.find((r) => Math.abs(r.sec.w - 600 / 25.4) < 1e-6)?.len ?? -1, 3 / 0.3048, 1e-9), 'runs in both systems: the second is converted (3 m = 9.843 ft)');
}

section('3D: one closed solid per run, volumes worked by hand');
{
  const vol = (d) => M.signedVolume(D.ductSolid(d));
  ok(rel(vol(run({})), 24 * 12 * 240, 1e-9), 'a straight 24 × 12 × 240 in: 69 120 in³');
  // the L: 2 × 216 × 288 + 288 × (polygon of 6 chords of 15° on R 24): the sweep through the elbow is a little shorter than π/2 × 24
  const L = run({ pts: [[0, 0], [240, 0], [240, 240]], r: 1 });
  const want = 2 * 216 * 288 + 288 * 24 * (Math.PI / 2);
  ok(rel(vol(L), want, 0.005), 'an L with a radius elbow: 135 274 in³ (Pappus) within 0.5 %', vol(L) + ' vs ' + want);
  const polys = D.ductSolid(L);
  const zs = polys.flat().map((p) => p[2]);
  ok(Math.min(...zs) === 108 && Math.max(...zs) === 120, 'bottom of duct at 108, top at 120');
  const R = run({ segs: [{ s: 'round', w: 12, h: 12 }] });
  ok(rel(vol(R), 240 * 24 * 36 * Math.sin(2 * Math.PI / 24) / 2 * 1, 1e-9), 'a round duct: a 24-sided prism (area ½·24·r²·sin 15°)', vol(R));
  const mixed = run({ pts: [[0, 0], [120, 0], [240, 0]], segs: [{ s: 'rect', w: 24, h: 12 }, { s: 'round', w: 12, h: 12 }] });
  ok(vol(mixed) > 0 && M.tube(D.ductRings(mixed)).length > 0 && D.ductRings(mixed).every((r) => r.length === 24), 'a rectangular-to-round run: 24-point rings all the way, a positive volume');
  const mit = run({ pts: [[0, 0], [240, 0], [240, 240]], elbow: 'mitred' });
  ok(rel(vol(mit), 288 * 480, 1e-9), 'a mitered L: exactly two half-mitred prisms, 288 × 480 in³', vol(mit));
}

const extra = fs.readdirSync(HERE).filter((f) => /^t-.*\.mjs$/.test(f)).sort();
for (const f of extra) await import(pathToFileURL(path.join(HERE, f)).href);

section('Words');
ok(!missing.size, 'every string the add-on asked for is in lang/en.json', [...missing].join(', '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
