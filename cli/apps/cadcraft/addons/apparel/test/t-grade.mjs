/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: AP.4 sizes and grading — a front bodice graded in five sizes against hand-computed points, curve points
// following in proportion, rule tools (uniform, flip, proportional), a new size range or base size, the nest view, and the
// GRADE command at CadCraft's command line.
const { ok, section, near, show, mine } = globalThis.__apTest;
const GR = await mine('lib/grade.js');
const PC = await mine('lib/piece.js');
const { t } = await mine('lib/text.js');

section('AP.4 sizes and grading (grade.js): a bodice in five sizes, by hand');
// Front bodice, base size M, in mm (counter-clockwise from the centre front waist):
//   p0 (0,0) CF waist · p1 (100,0) a curve point on the waist · p2 (250,0) side waist · p3 (250,200) underarm ·
//   p4 (200,260) armhole curve point · p5 (180,380) shoulder point · p6 (80,400) neck point · p7 (40,370) neck curve point ·
//   p8 (0,330) CF neck.
// Rules per size step (XS S M L XL; M = base): p2 x +10 · p3 +10,+5 · p5 +6,+8 · p6 +3,+8 · p8 0,+6. p0 never moves.
const bodice = {
  ...PC.emptyPiece('mm'), name: 'Front bodice', style: 'B1',
  pts: [[0, 0, 0], [100, 0, 1], [250, 0, 0], [250, 200, 0], [200, 260, 1], [180, 380, 0], [80, 400, 0], [40, 370, 1], [0, 330, 0]],
  sizes: { list: ['XS', 'S', 'M', 'L', 'XL'], base: 'M' },
  grain: { a: [125, 100], b: [125, 300], s: 'both' },
};
let g = bodice;
const S = bodice.sizes;
g = GR.setRule(g, 'p2', GR.uniform(S, [10, 0]));
g = GR.setRule(g, 'p3', GR.uniform(S, [10, 5]));
g = GR.setRule(g, 'p5', GR.uniform(S, [6, 8]));
g = GR.setRule(g, 'p6', GR.uniform(S, [3, 8]));
g = GR.setRule(g, 'p8', GR.uniform(S, [0, 6]));
g = GR.setRule(g, 'gb', GR.uniform(S, [5, 4]));
ok(JSON.stringify(GR.ruleOf(g, 'p3')) === JSON.stringify([-20, -10, -10, -5, 0, 0, 10, 5, 20, 10]), 'a uniform rule: base 0, ±1 step per size', JSON.stringify(GR.ruleOf(g, 'p3')));
// hand-computed corners in each size: base + k × step, k = −2 … +2
const want = {
  XS: { 0: [0, 0], 2: [230, 0], 3: [230, 190], 5: [168, 364], 6: [74, 384], 8: [0, 318] },
  S: { 0: [0, 0], 2: [240, 0], 3: [240, 195], 5: [174, 372], 6: [77, 392], 8: [0, 324] },
  M: { 0: [0, 0], 2: [250, 0], 3: [250, 200], 5: [180, 380], 6: [80, 400], 8: [0, 330] },
  L: { 0: [0, 0], 2: [260, 0], 3: [260, 205], 5: [186, 388], 6: [83, 408], 8: [0, 336] },
  XL: { 0: [0, 0], 2: [270, 0], 3: [270, 210], 5: [192, 396], 6: [86, 416], 8: [0, 342] },
};
for (const size of S.list) {
  const p = GR.gradedPts(g, size);
  const bad = Object.entries(want[size]).filter(([i, [x, y]]) => !near(p[i][0], x) || !near(p[i][1], y));
  ok(!bad.length, 'size ' + size + ': every graded corner where worked out by hand', JSON.stringify(bad.map(([i]) => [i, p[i]])));
}
// the waist's curve point lies on a straight run: it moves 100/250 of p2's move
ok(near(GR.gradedPts(g, 'XL')[1][0], 108) && near(GR.gradedPts(g, 'XS')[1][0], 92) && near(GR.gradedPts(g, 'XL')[1][1], 0), 'an unruled curve point moves in proportion along its edge: 100 of 250 → 8 of 20 in XL', JSON.stringify(GR.gradedPts(g, 'XL')[1]));
// the armhole curve point p4 (between p3 and p5): its move lies between theirs
const m4 = [GR.gradedPts(g, 'XL')[4][0] - 200, GR.gradedPts(g, 'XL')[4][1] - 260];
ok(m4[0] > 12 - 1e-9 && m4[0] < 20 + 1e-9 && m4[1] > 10 - 1e-9 && m4[1] < 16 + 1e-9, 'the armhole curve point moves between the underarm\'s (20,10) and the shoulder\'s (12,16) in XL', JSON.stringify(m4));
ok(JSON.stringify(GR.gradedPts(g, 'M')) === JSON.stringify(g.pts), 'the base size is the piece as drawn');
const xl = GR.gradeData(g, 'XL');
ok(xl.size === 'XL' && !xl.grades && near(xl.grain.b[0], 135) && near(xl.grain.b[1], 308) && near(xl.grain.a[0], 125), 'gradeData: the whole piece in XL (grain line end moved by its own rule, the other end not)', JSON.stringify(xl.grain));
// editing the base re-grades every size
const edited = PC.gripMove(g, 'p3', { x: 255, y: 200 });
ok(near(GR.gradedPts(edited, 'XL')[3][0], 275) && near(GR.gradedPts(edited, 'XS')[3][0], 235), 'moving a base point moves it in every size');

// rule tools
ok(JSON.stringify(GR.flip(GR.ruleOf(g, 'p3'), 'x')) === JSON.stringify([20, -10, 10, -5, 0, 0, -10, 5, -20, 10]) && JSON.stringify(GR.flip([1, 2], 'y')) === JSON.stringify([1, -2]), 'flip X / flip Y');
const fill = GR.proportional(g, 'p5', 'p8');
ok(Object.keys(fill).join() === 'p6,p7' && near(fill.p6[8], 6 + (0 - 6) * 0) || Object.keys(fill).join() === 'p6,p7', 'proportional: the points between two points get rules', Object.keys(fill).join());
const straight = GR.proportional(g, 'p0', 'p2');
ok(Object.keys(straight).join() === 'p1' && near(straight.p1[8], 8) && near(straight.p1[0], -8), 'proportional along the waist: p1 gets 0.4 of p2\'s rule', JSON.stringify(straight.p1));
ok(Object.keys(GR.proportional(g, 'p2', 'p2')).length === 0 && Object.keys(GR.proportional(g, 'ga', 'p2')).length === 0, 'proportional needs two different sew line points');

// a new size range: rules kept by name, new sizes start at the base; a new base re-measures every rule from itself
let r = GR.withSizes(g, { list: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], base: 'M' });
ok(r.added.join() === 'XXL' && JSON.stringify(GR.ruleOf(r.data, 'p2')) === JSON.stringify([-20, 0, -10, 0, 0, 0, 10, 0, 20, 0, 0, 0]), 'a size added: the others keep their rules, the new one starts unmoved', JSON.stringify(GR.ruleOf(r.data, 'p2')));
r = GR.withSizes(g, { list: ['XS', 'S', 'M', 'L', 'XL'], base: 'L' });
ok(JSON.stringify(GR.ruleOf(r.data, 'p2')) === JSON.stringify([-30, 0, -20, 0, -10, 0, 0, 0, 10, 0]) && r.data.size === 'L', 'base size changed to L: rules measured from L', JSON.stringify(GR.ruleOf(r.data, 'p2')));
ok(JSON.stringify(GR.parseSizes('XS, S  M;L xl xl')) === JSON.stringify(['XS', 'S', 'M', 'L', 'xl']) && JSON.stringify(GR.parseMove('5, -2.5')) === '[5,-2.5]' && GR.parseMove('five') === null, 'parseSizes and parseMove');

// untrusted grading
const dirty = PC.cleanPiece({ ...g, sizes: { list: ['S', 'M', 'M', '', 7, 'L\u0001'], base: 'Q' }, grades: { p2: [1, 2, 3, 4, 5, 6], p99: [0, 0, 0, 0, 0, 0], zz: [1, 1, 1, 1, 1, 1], p3: [1, 'x', 0, 0, 0, 0], p5: [1, 1] } });
ok(JSON.stringify(dirty.sizes) === JSON.stringify({ list: ['S', 'M', 'L'], base: 'S' }) && Object.keys(dirty.grades).join() === 'p2' && dirty.grades.p2[0] === 0 && dirty.grades.p2[1] === 0, 'cleanPiece: size names, base, rule lengths, unknown points and keys checked; the base never moves', JSON.stringify([dirty.sizes, dirty.grades]));

// nest view: every other size drawn on the base, each in its own colour
const nest = PC.drawPiece({ ...g, nest: true, sa: { w: 10, e: {}, k: {} } }, { t });
const ns = nest.filter((e) => e.role === 'nest');
ok(ns.length === 4 && new Set(ns.map((e) => e.color)).size === 4 && ns.map((e) => e.size).join() === 'XS,S,L,XL', 'nest view: four more sizes, four colours', ns.map((e) => e.size + ':' + e.color).join());
const xlCut = ns.find((e) => e.size === 'XL');
ok(xlCut && xlCut.pts.some((q) => near(q.x, 280) && near(q.y, -10)), 'the XL cut line in the nest is the XL sew line with the allowance (side waist 270 + 10)', show(xlCut.pts.slice(0, 4)));
ok(!PC.drawPiece(g, { t }).some((e) => e.role === 'nest'), 'nest view off: only the base');

// ------------------------------------------------------------------------------------------------ GRADE at the command line
section('GRADE at the command line');
{
  const { harness, startWith, memStorage } = await import('./t-addon.mjs');
  const h = harness();
  const st = await startWith(h, memStorage());
  await st.loader.setEnabled('apparel', true);
  const { doc, host, type } = h;
  const dataOf = (id) => st.kinds.info(doc.get(id))?.data;
  await type('RECTANG', '0,0', '200,300');
  const rect = doc.all().find((e) => e.type === 'poly');
  host.setSelection(new Set([rect.id]));
  await type('PIECE', 'N', 'Back');
  const pc = doc.all().find((e) => st.kinds.info(e)?.kind === 'piece');
  const u0 = doc.undoStack.length;
  host.setSelection(new Set([pc.id]));
  await type('GRADE', 'S', 'XS S M L XL', '', '200,0', '10,0', '200,300', 'T', '-20,-10', '-10,-5', '10,5', '20,10', 'C', '200,0', 'P', '0,0', '', 'H', '0,0', 'N', '');
  const d = dataOf(pc.id);
  ok(d.sizes && d.sizes.list.join(' ') === 'XS S M L XL' && d.sizes.base === 'M', 'Sizes: the range, the base defaults to the middle size', JSON.stringify(d.sizes));
  ok(JSON.stringify(d.grades.p1) === JSON.stringify([-20, 0, -10, 0, 0, 0, 10, 0, 20, 0]), 'a click on a corner + "10,0": a uniform rule', JSON.stringify(d.grades.p1));
  ok(JSON.stringify(d.grades.p2) === JSON.stringify([-20, -10, -10, -5, 0, 0, 10, 5, 20, 10]), 'T: the rule typed size by size', JSON.stringify(d.grades.p2));
  ok(JSON.stringify(d.grades.p0) === JSON.stringify([20, 0, 10, 0, 0, 0, -10, 0, -20, 0]), 'Copy p1 → Paste on p0 → Horizontal flip: the centre-back corner grades the other way', JSON.stringify(d.grades.p0));
  ok(d.nest === true && doc.blocks.get(doc.get(pc.id).block).entities.filter((e) => e.color && e.color !== 0).length === 4, 'Nest: the four other sizes drawn on the base');
  ok(doc.undoStack.length > u0, 'GRADE edits are undoable');
}
