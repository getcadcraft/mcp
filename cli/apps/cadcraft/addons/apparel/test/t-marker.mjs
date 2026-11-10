/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: AP.9 markers by hand — the fabric's rules (grain within tolerance, turning and mirroring only on fabric
// that allows it, no overlaps, nothing off the fabric), the marker's length and efficiency, and MARKER / MARKERADD / MOVE /
// ROTATE / MARKEROUT at CadCraft's command line.
const { ok, section, near, mine } = globalThis.__apTest;
const MK = await mine('lib/marker.js');

section('AP.9 markers (marker.js)');
const sq = (s) => ({ name: 'Sq', size: 'M', u: 'mm', cut: [[0, 0], [s, 0], [s, s], [0, s]], grain: 0, area: s * s, pair: false });
const any = { w: 500, nap: 'any', tol: 2, u: 'mm', end: 0 }, one = { ...any, nap: 'oneway' };
const p = sq(100);
ok(MK.grainProblem(p, { rot: 0 }, any) === null && MK.grainProblem(p, { rot: Math.PI }, any) === null, 'fabric that may be turned: grain along the length either way');
ok(MK.grainProblem(p, { rot: 1 * Math.PI / 180 }, any) === null && MK.grainProblem(p, { rot: 3 * Math.PI / 180 }, any) === 'grain', 'grain tolerance 2°: 1° is fine, 3° is not');
ok(MK.grainProblem(p, { rot: Math.PI }, one) === 'turned' && MK.grainProblem(p, { rot: 0, sx: -1 }, one) === 'mirrored' && MK.grainProblem({ ...p, pair: true }, { rot: Math.PI, sx: -1 }, one) === null, 'one-way fabric: no turning, no mirroring (the mirrored half of a pair is fine)');
ok(MK.grainProblem({ ...p, grain: Math.PI / 2 }, { rot: -Math.PI / 2 }, one) === null, 'a piece whose grain is up the page, turned to lie along the length');
const M = { x: 0, y: 0, rot: 0 };
ok(MK.inMarker(MK.worldPoly(p, { x: 10, y: 10 }), M, any) === 'in' && MK.inMarker(MK.worldPoly(p, { x: 10, y: 450 }), M, any) === 'edge' && MK.inMarker(MK.worldPoly(p, { x: 10, y: 700 }), M, any) === 'out' && MK.inMarker(MK.worldPoly(p, { x: -50, y: 10 }), M, any) === 'edge', 'on the fabric, across its edge, off it');
const A = MK.worldPoly(p, { x: 0, y: 0 });
ok(MK.overlaps(A, MK.worldPoly(p, { x: 50, y: 50 })) && !MK.overlaps(A, MK.worldPoly(p, { x: 100, y: 0 })) && MK.overlaps(A, MK.worldPoly(sq(20), { x: 40, y: 40 })) && !MK.overlaps(A, MK.worldPoly(p, { x: 150, y: 0 })), 'overlap: crossing or inside counts; touching does not');
const st = MK.stats(any, [{ poly: MK.worldPoly(p, { x: 0, y: 0 }), area: 10000 }, { poly: MK.worldPoly(p, { x: 100, y: 0 }), area: 10000 }]);
ok(near(st.len, 200) && near(st.eff, 0.2) && st.placed === 2, 'two 100 mm squares on 500 mm fabric: 200 mm long, 20 % used');
ok(JSON.stringify(MK.parseQuantities('S:1 M=2 L 3', ['S', 'M', 'L'])) === '{"S":1,"M":2,"L":3}' && JSON.stringify(MK.parseQuantities('2', ['S', 'M'])) === '{"S":2,"M":2}' && MK.parseQuantities('Q:1', ['S']) === null, 'quantities per size');

section('MARKER, MARKERADD, placing by MOVE / ROTATE, MARKEROUT at the command line');
{
  const { harness, startWith, memStorage } = await import('./t-addon.mjs');
  const h = harness();
  const st2 = await startWith(h, memStorage());
  await st2.loader.setEnabled('apparel', true);
  const { doc, host, type, log, eng } = h;
  const idle = async () => { for (let i = 0; i < 400 && eng.busy; i++) await new Promise((r) => setTimeout(r, 10)); };
  const info = (e) => st2.kinds.info(doc.get(e.id) || e);
  await type('RECTANG', '0,0', '200,100');
  host.setSelection(new Set([doc.all().find((e) => e.type === 'poly').id]));
  await type('PIECE', 'N', 'Panel');
  const piece = doc.all().find((e) => info(e)?.kind === 'piece');
  // grain up the page (the automatic grain line): placed pieces arrive turned so the grain runs along the fabric
  host.setSelection(new Set());
  await type('MARKER', '500', 'A', '2', '0,-2000', 'Test marker');
  const mk = doc.all().find((e) => info(e)?.kind === 'marker');
  ok(mk && info(mk).data.w === 500 && info(mk).data.nap === 'any', 'MARKER: the fabric, 500 wide, may be turned');
  const placed = () => doc.all().filter((e) => info(e)?.kind === 'placed');
  // the selected piece; MARKERADD asks for the marker (a click on its edge)
  host.setSelection(new Set([piece.id]));
  await type('MARKERADD');
  eng.click({ x: 0, y: -2000 + 250 }); await h.settle(); await idle();
  ok(placed().length === 1 && placed()[0].y > -2000 + 500, 'MARKERADD: one piece waits above the fabric', log.slice(-2).join(' | '));
  const pc = placed()[0];
  ok(near(pc.rot, -Math.PI / 2, 1e-5), 'its grain (up the page) turned to run along the fabric', String(pc.rot));
  // drag it on: its lower-left after turning sits at (pc.x, pc.y − 200)
  const boxOf = (id) => { const e = doc.get(id); const P = info(e).data; const c = Math.cos(e.rot), s = Math.sin(e.rot); const pts = P.cut.map(([x, y]) => ({ x: e.x + c * x - s * y, y: e.y + s * x + c * y })); return { x0: Math.min(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)) }; };
  const box = () => boxOf(pc.id);
  let b = box();
  host.setSelection(new Set([pc.id]));
  await type('MOVE', `${b.x0},${b.y0}`, '0,-2000');
  b = box();
  ok(near(b.x0, 0) && near(b.y0, -2000), 'MOVE onto the fabric: kept', JSON.stringify(b));
  const m1 = info(mk).data;
  ok(near(m1.len, 100, 1e-6) && near(m1.eff, 20000 / (100 * 500)) && m1.placed === 1 && m1.total === 1, 'the marker counts: 100 long, 40 % used, 1 of 1 piece', JSON.stringify(m1));
  ok(doc.blocks.get(doc.get(mk.id).block).entities.some((e) => e.type === 'text' && /efficiency 40\.0 %/.test(e.s)), 'and shows it');
  // a second copy, moved onto the first: refused
  host.setSelection(new Set([piece.id]));
  await type('MARKERADD');
  eng.click({ x: 0, y: -2000 + 250 }); await h.settle(); await idle();
  const pc2 = placed().find((e) => e.id !== pc.id);
  host.setSelection(new Set([pc2.id]));
  const before2 = { x: doc.get(pc2.id).x, y: doc.get(pc2.id).y };
  const b2 = boxOf(pc2.id);
  await type('MOVE', `${b2.x0},${b2.y0}`, '50,-1950');
  ok(near(doc.get(pc2.id).x, before2.x) && near(doc.get(pc2.id).y, before2.y) && log.some((l) => /would overlap another piece/.test(l)), 'onto the first: refused, put back', log.slice(-2).join(' | '));
  host.setSelection(new Set([pc2.id]));
  await type('MOVE', `${b2.x0},${b2.y0}`, '100,-1600');   // its 200 would reach −1400, past the far selvedge at −1500
  ok(log.some((l) => /would go off the fabric/.test(l)), 'across the fabric\'s edge: refused');
  host.setSelection(new Set([pc2.id]));
  await type('MOVE', `${b2.x0},${b2.y0}`, '100,-2000');
  ok(info(mk).data.placed === 2 && near(info(mk).data.len, 200, 1e-3), 'beside it (touching): kept; two pieces, 200 long', JSON.stringify(info(mk).data));
  host.setSelection(new Set([pc2.id]));
  await type('ROTATE', '150,-1900', '90');
  ok(log.some((l) => /grain line would be off/.test(l)), 'turned 90°: refused (grain across the fabric)');
  host.setSelection(new Set([pc2.id]));
  await type('ROTATE', '150,-1900', '180');
  ok(!log.slice(-2).some((l) => /put back/.test(l)) && info(mk).data.placed === 2, 'turned 180° on fabric that may be turned: kept');
  // one-way fabric: the same turn is refused
  host.setSelection(new Set([mk.id]));
  doc.change('nap', () => doc.update(mk.id, st2.kinds.update(doc.get(mk.id), { ...info(mk).data, nap: 'oneway' })));
  host.setSelection(new Set([pc.id]));
  await type('ROTATE', '50,-1900', '180');
  ok(log.some((l) => /cannot be turned round on one-way fabric/.test(l)), 'on one-way fabric the 180° turn is refused');
  host.setSelection(new Set([mk.id]));
  await type('MARKEROUT', 'D');
  ok(log.some((l) => /Saved Test marker\.dxf \(2 pieces and the fabric\)/.test(l)), 'MARKEROUT DXF', log.slice(-2).join(' | '));
  host.setSelection(new Set([mk.id]));
  await type('MARKEROUT', 'P'); await idle();
  ok(log.some((l) => /Saved Test marker\.pdf at full size/.test(l)), 'MARKEROUT PDF', log.slice(-2).join(' | '));
}
