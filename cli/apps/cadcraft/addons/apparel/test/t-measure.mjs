/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: AP.6 measuring — lengths along the sew line, seam walking with notch alignment, the piece table per size
// (sew and cut line perimeter and area) and its CSV, worked out by hand on rectangles; then SEAMLENGTH, WALK and PIECETABLE
// at CadCraft's command line.
const { ok, section, near, mine } = globalThis.__apTest;
const MS = await mine('lib/measure.js');
const PC = await mine('lib/piece.js');
const GR = await mine('lib/grade.js');

section('AP.6 measuring (measure.js), by hand');
// A: 200 × 300 front, counter-clockwise from (0,0): edges p0 bottom (200), p1 right side (300), p2 top (200), p3 left (300)
const A = { ...PC.emptyPiece('mm'), name: 'Front', style: 'S1', pts: [[0, 0, 0], [200, 0, 0], [200, 300, 0], [0, 300, 0]], sa: { w: 10, e: {}, k: {} },
  notches: [{ i: 1, d: 100, k: 'slit' }, { i: 1, d: 200, k: 'slit' }] };
// B: the back, its left side 310 tall (p3 runs down from (0,310) to (0,0)), notches 200 and 95 along it (= 110 and 215 from the hem)
const B = { ...PC.emptyPiece('mm'), name: 'Back', style: 'S1', pts: [[0, 0, 0], [200, 0, 0], [200, 310, 0], [0, 310, 0]], sa: null,
  notches: [{ i: 3, d: 200, k: 'slit' }, { i: 3, d: 95, k: 'slit' }] };
ok(near(MS.edgeLength(A, 0), 200) && near(MS.edgeLength(A, 1), 300) && near(MS.edgeLength(B, 3), 310), 'edge lengths');
const al = MS.along(A, { x: 100, y: 0 }, { x: 200, y: 150 });
ok(near(al.fwd, 250) && near(al.back, 750) && near(al.total, 1000), 'along the sew line: 100 + 150 one way, 750 the other', JSON.stringify(al));
ok(near(MS.along(A, { x: 100, y: -4 }, { x: 203, y: 150 }).fwd, 250), 'places off the line snap to it');
ok(near(MS.edgeAt(A, { x: 205, y: 40 }).i, 1) && near(MS.edgeAt(A, { x: 205, y: 40 }).d, 40), 'edgeAt: the nearest edge and the distance along it');
const w = MS.walk(A, 1, B, 3);
ok(near(w.lenA, 300) && near(w.lenB, 310) && near(w.diff, 10), 'walking A\'s side (300) against B\'s side (310): B is 10 longer');
ok(w.pairs.length === 2 && near(w.pairs[0].a, 100) && near(w.pairs[0].off, 10) && near(w.pairs[1].a, 200) && near(w.pairs[1].off, 15), 'B walked from its end (face to face): its notches land 110 and 215 up → 10 and 15 past A\'s', JSON.stringify(w.pairs));
const w2 = MS.walk(A, 1, B, 3, { reverse: false });
ok(near(w2.pairs[0].b, 95) && near(w2.pairs[1].b, 200), 'not reversed: B measured from its start');
const w3 = MS.walk(A, 1, { ...B, notches: [B.notches[0]] }, 3);
ok(w3.pairs.length === 1 && w3.onlyA.length === 1 && w3.onlyB.length === 0, 'a notch with no partner is listed');
let rows = MS.pieceRows(A);
ok(rows.length === 1 && near(rows[0].sewPerimeter, 1000) && near(rows[0].cutPerimeter, 1080) && near(rows[0].sewArea, 60000) && near(rows[0].cutArea, 70400), 'piece table: sew 1000 / cut 1080 round, 60 000 / 70 400 mm² (220 × 320)', JSON.stringify(rows[0]));
const G = GR.setRule({ ...A, sizes: { list: ['S', 'M', 'L'], base: 'M' } }, 'p1', GR.uniform({ list: ['S', 'M', 'L'], base: 'M' }, [10, 0]));
const G2 = GR.setRule(G, 'p2', GR.uniform(G.sizes, [10, 0]));
rows = MS.pieceRows(G2);
ok(rows.map((r) => r.size).join() === 'S,M,L' && near(rows[2].sewArea, 63000) && near(rows[2].sewPerimeter, 1020) && near(rows[0].cutArea, 210 * 320), 'one row per size: L is 210 wide (63 000 mm², 1020 round); S cut 210 × 320', JSON.stringify(rows.map((r) => [r.size, r.sewArea, r.cutArea])));
ok(near(MS.walk(G2, 1, G2, 1, { size: 'L' }).lenA, 300) && near(MS.edgeLength(G2, 0, 'L'), 210), 'lengths per size');
const csv = MS.toCsv([{ key: 'a', label: 'Style' }, { key: 'b', label: 'Area' }], [{ a: '=HYPERLINK("x")', b: -2.5 }, { a: 'Blouse, "B1"', b: 3 }]);
ok(csv === 'Style,Area\r\n"\'=HYPERLINK(""x"")",-2.5\r\n"Blouse, ""B1""",3\r\n', 'CSV: formula-looking text escaped, numbers left alone, quotes doubled, CRLF', JSON.stringify(csv));

section('SEAMLENGTH, WALK and PIECETABLE at the command line');
{
  const { harness, startWith, memStorage } = await import('./t-addon.mjs');
  const h = harness();
  const st = await startWith(h, memStorage());
  await st.loader.setEnabled('apparel', true);
  const { doc, host, type, eng, log, settle } = h;
  const click = async (x, y) => { eng.click({ x, y }); await settle(); };
  const mk = async (x0, w, ht, name) => {
    await type('RECTANG', x0 + ',0', (x0 + w) + ',' + ht);
    const r = doc.all().find((e) => e.type === 'poly');
    host.setSelection(new Set([r.id]));
    await type('PIECE', 'N', name);
    return doc.all().find((e) => st.kinds.info(e)?.data?.name === name);
  };
  const a = await mk(0, 200, 300, 'Front');
  const b = await mk(400, 200, 310, 'Back');
  host.setSelection(new Set([a.id])); await type('NOTCH', '200,100', '200,200', '');
  host.setSelection(new Set([b.id])); await type('NOTCH', '400,110', '400,215', '');
  host.setSelection(new Set([a.id]));
  await type('SEAMLENGTH', '100,0', '200,150');
  ok(log.some((l) => /250\.0 mm one way, 750\.0 mm the other/.test(l)), 'SEAMLENGTH prints both ways round', log.slice(-2).join(' | '));
  host.setSelection(new Set());
  await type('WALK');
  await click(200, 50); await click(400, 50);
  const said = log.slice(-5).join(' | ');
  ok(/first edge 300\.0 mm, second edge 310\.0 mm, difference \+10\.0 mm/.test(said) && /Notch 1 at 100\.0 mm: the other notch lands \+10\.0 mm away/.test(said), 'WALK: lengths, difference and notch alignment', said);
  await type('');
  host.setSelection(new Set());
  await type('PIECETABLE', '');
  ok(log.some((l) => /Front.*sew 1000 mm, cut 1000 mm; area 600 \/ 600 cm²/.test(l)) && log.some((l) => /Back/.test(l)), 'PIECETABLE lists each piece (net pieces: cut = sew)', log.slice(-4).join(' | '));
  const ex = st.exporters().find((x) => x.addon === 'apparel' || x.id === 'piece-table');
  const text = ex ? String(ex.write(doc)) : '';
  ok(text.startsWith('﻿Style,Piece,Size,Cut quantity,Sew line perimeter (mm)') && text.split('\r\n').length === 4, 'EXPORT lists the piece table as CSV', JSON.stringify(text.slice(0, 120)));
}
