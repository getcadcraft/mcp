#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test.mjs — the Electrical add-on's Node tests (0.4 part 2, track E). Runs the add-on's DOM-free modules on CadCraft's
 * own Doc, saves through CadCraft's DXF and DWG writers and reads back with its readers, so a schematic is checked the way
 * the app keeps it.
 *   node public_html/assets/apps/cadcraft/dev/addons/electrical/test/test.mjs [--build dev] [--verbose] [--keep]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDON = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const KEEP = args.includes('--keep');
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
const S = await mine('lib/symbols.js');
const PJ = await mine('lib/project.js');
const M = await mine('lib/model.js');
const W = await mine('lib/wires.js');
const D = await mine('lib/devices.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; if (VERBOSE) console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const section = (s) => console.log('\n' + s);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
globalThis.__elTest = { ok, section, near, load, mine, ADDON, APP, ROOT, KEEP, VERBOSE, EN, Doc };

// ------------------------------------------------------------------------------------------------ helpers
/** A drawing with one A3 sheet; place(key, x, y, attrs) and wire(points) in it. */
export function sheetDoc(n = 1) {
  const doc = new Doc();
  const sheets = [];
  doc.change('setup', () => { for (let i = 0; i < n; i++) sheets.push(PJ.addSheet(doc, { values: { PROJECT: 'Test', TITLE: 'Sheet ' + (i + 1), PLANT: 'A1', LOC: 'S1' } })); });
  const place = (sheet, key, x, y, attrs = {}, std = 'iec', rot = 0) => {
    let e;
    doc.change('place', () => { const b = S.symbolBlock(key, std); S.ensureBlock(doc, b); e = doc.add({ type: 'insert', block: b.name, x, y, sx: 1, sy: 1, rot, layer: 'EL-SYMBOL', attrs: S.symbolAttrs(key, attrs) }, sheets[sheet].entities); });
    return e;
  };
  const wire = (sheet, pts, layer = 'EL-WIRE') => {
    let e;
    doc.change('wire', () => { e = doc.add(pts.length === 2 ? { type: 'line', x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1], layer } : { type: 'poly', closed: false, layer, pts: pts.map(([x, y]) => ({ x, y, b: 0 })) }, sheets[sheet].entities); });
    return e;
  };
  return { doc, sheets, place, wire };
}
globalThis.__elTest.sheetDoc = sheetDoc;

// ------------------------------------------------------------------------------------------------ E.1 symbols
section('E.1 symbol library (IEC 60617; ANSI / JIC drawings for E.12)');
{
  ok(S.SYMBOLS.length >= 25, 'at least 25 symbols', String(S.SYMBOLS.length));
  ok(new Set(S.SYMBOLS.map((s) => s.key)).size === S.SYMBOLS.length, 'keys are unique');
  ok(S.SYMBOLS.every((s) => S.GROUPS.includes(s.group)), 'every symbol is in a listed group');
  ok(S.SYMBOLS.every((s) => EN['sym.' + s.key] && EN['group.' + s.group]), 'every symbol and group has words in lang/en.json');
  ok(S.SYMBOLS.every((s) => s.key in S.LETTERS), 'every symbol has an IEC 81346-2 class letter (or none)');
  const names = new Set();
  let geomOk = true, pinsOnGrid = true, nameOk = true, metaOk = true, attrsOk = true;
  for (const std of S.STANDARDS) for (const s of S.SYMBOLS) {
    const b = S.symbolBlock(s.key, std);
    names.add(b.name);
    if (!/^[A-Z0-9_]{1,31}$/.test(b.name)) nameOk = false;
    if (!b.entities.length || !b.entities.every((e) => ['line', 'circle', 'arc', 'poly', 'text', 'hatch'].includes(e.type) && e.layer === '0')) geomOk = false;
    for (const e of b.entities) for (const v of Object.values(e)) if (typeof v === 'number' && !Number.isFinite(v)) geomOk = false;
    for (const [, x, y] of s.pins) if (Math.abs(x / 2.5 - Math.round(x / 2.5)) > 1e-9 || Math.abs(y / 2.5 - Math.round(y / 2.5)) > 1e-9) pinsOnGrid = false;
    const meta = S.readMeta(b);
    if (!meta || meta.sym !== s.key || meta.role !== s.role || meta.std !== std || meta.pins.length !== s.pins.length) metaOk = false;
    const tags = b.attdefs.map((d) => d.tag);
    if (!tags.includes('TAG') || !s.pins.every(([p]) => tags.includes(p)) || new Set(tags).size !== tags.length) attrsOk = false;
    if (s.role === 'coil' && !tags.includes('XREF8')) attrsOk = false;
    if (s.role === 'contact' && !tags.includes('XREF')) attrsOk = false;
  }
  ok(names.size === S.SYMBOLS.length * 2, 'IEC and ANSI blocks have their own names', String(names.size));
  ok(nameOk, 'block names fit DXF R12 (≤ 31 of A–Z 0–9 _)');
  ok(geomOk, 'every symbol is drawn with plain lines, arcs, circles, polylines, text or a solid fill on layer 0');
  ok(pinsOnGrid, 'every pin is on the 2.5 mm half-grid');
  ok(metaOk, 'the EL attribute says what each block is, and reads back');
  ok(attrsOk, 'TAG, pins, XREF (contacts) and XREF1–8 (coils) are attributes, each once');
  const m = S.parseMeta(S.writeMeta({ sym: 'x', role: 'contact', kind: 'no', pins: [{ tag: 'P1', x: 0, y: 5 }, { tag: 'P2', x: -2.5, y: -5 }] }));
  ok(m && m.pins[1].x === -2.5 && m.kind === 'no', 'meta round trip');
  ok(S.parseMeta('v=1;pins=P1@0,5') === null && S.parseMeta('nonsense') === null && S.parseMeta('v=1;role=coil;pins=bad@x,y;' + 'a'.repeat(3000)) === null, 'meta from a file is checked (no role, junk, too long)');
  ok(S.parseMeta('v=1;role=coil;pins=P1@0,5|zz@1,1|P2@0,-5').pins.length === 2, 'a bad pin is dropped, the rest kept');
  const pins = S.pinsOf({ x: 100, y: 50, rot: Math.PI / 2, sx: 1, sy: 1 }, S.symbolBlock('contact.no'));
  ok(near(pins[0].x, 95) && near(pins[0].y, 50) && near(pins[1].x, 105) && pins[0].label === '', 'pins follow the insert (rotated 90°)');
  ok(S.symbolList().length === S.SYMBOLS.length && S.symbolList()[0].label === EN['sym.contact.no'], 'the list carries translated labels');
}

// ------------------------------------------------------------------------------------------------ E.5 frames and sheets
section('E.5 sheets, frames and the path grid');
{
  const { doc, sheets } = sheetDoc(3);
  ok(doc.layouts.length === 3 && doc.layouts[2].name === 'Sheet 3', 'three sheets are three layouts');
  const model = M.scan(doc);
  ok(model.sheets.length === 3 && model.sheets.map((s) => s.number).join() === '1,2,3', 'sheets are numbered 1, 2, 3', model.sheets.map((s) => s.number).join());
  ok(model.sheets[0].plant === 'A1' && model.sheets[0].loc === 'S1', 'plant and location come from the title block');
  const g = model.sheets[0].grid;
  ok(PJ.pathAt(g, { x: 21, y: 100 }) === 1 && PJ.pathAt(g, { x: 409, y: 100 }) === 10 && PJ.pathAt(g, { x: 20 + 39 * 4.5, y: 100 }) === 5 && PJ.pathAt(g, { x: 5, y: 100 }) === 0, 'paths 1–10 across an A3 frame');
  ok(PJ.nextSheetNumber(doc) === 4, 'the next sheet number');
  const blk = PJ.frameBlock('A4');
  ok(S.readMeta(blk).cols === '8' && blk.name === 'EL_FRAME_A4', 'an A4 frame has 8 paths');
  // a frame in model space, rotated and scaled, still knows its paths
  doc.change('f', () => doc.add({ type: 'insert', block: 'EL_FRAME_A3', x: 1000, y: 0, sx: 2, sy: 2, rot: 0, attrs: { SHEET: '7' } }, doc.model));
  const m2 = M.scan(doc);
  const s7 = m2.sheets.find((s) => s.number === '7');
  ok(s7 && PJ.pathAt(s7.grid, { x: 1000 + 2 * (20 + 39 * 2.5), y: 300 }) === 3, 'a scaled frame in model space');
  ok(m2.sheets.map((s) => s.number).join() === '1,2,3,7', 'sheets in number order');
}

// ------------------------------------------------------------------------------------------------ E.2 wires
section('E.2 wires: connections, junction dots, numbers');
{
  const { doc, sheets, place, wire } = sheetDoc(1);
  // path 2: L1 rail at y=250 → S1 (pushbutton) → K1 coil → N rail at y=60;  path 3: a branch from the rail to a lamp; a crossing wire
  const x2 = 20 + 39 * 1.5, x3 = 20 + 39 * 2.5;
  wire(0, [[30, 250], [380, 250]]);                       // L1 rail
  wire(0, [[30, 60], [380, 60]]);                         // N rail
  const s1 = place(0, 'pushbutton.no', x2, 200);           // pins at y 205 / 195
  wire(0, [[x2, 250], [x2, 205]]);                        // T on the rail
  const k1 = place(0, 'coil', x2, 150);                    // 155 / 145
  wire(0, [[x2, 195], [x2, 155]]);
  wire(0, [[x2, 145], [x2, 60]]);                         // T on N
  const h1 = place(0, 'lamp', x3, 150);
  wire(0, [[x3, 250], [x3, 155]]);
  wire(0, [[x3, 145], [x3, 60]]);
  wire(0, [[x2 - 20, 175], [x3 + 20, 175]]);              // crosses both verticals, touches nothing
  const loose = wire(0, [[300, 120], [320, 120]]);        // dangling both ends
  let model = M.scan(doc);
  let nl = W.netlist(model);
  const netOf = (d, tag) => nl.netOfPin.get(d.uid + '|' + tag);
  const dev = (e) => model.devices.find((d) => d.id === e.id);
  const S1 = dev(s1), K1 = dev(k1), H1 = dev(h1);
  ok(netOf(S1, 'P1') && netOf(S1, 'P1') === netOf(H1, 'P1'), 'the pushbutton and the lamp both reach L1 (T on the rail)');
  ok(netOf(S1, 'P2') === netOf(K1, 'P1'), 'pushbutton → coil');
  ok(netOf(K1, 'P2') === netOf(H1, 'P2'), 'coil and lamp share N');
  ok(netOf(S1, 'P1') !== netOf(K1, 'P1') && netOf(S1, 'P1') !== netOf(K1, 'P2'), 'a contact separates potentials');
  ok(nl.nets.length === 5, 'five nets: L1, N, S1→K1, the crossing wire, the loose wire', String(nl.nets.length));
  ok(nl.junctions.length === 4, 'four T junctions', String(nl.junctions.length));
  ok(nl.dangling.length === 8, 'eight dangling ends (the rails\' ends, the crossing wire and the loose wire)', String(nl.dangling.length));
  const crossNet = nl.netOfWire.get(model.wires.find((w) => w.pts[0].y === 175).uid);
  ok(crossNet.pins.length === 0 && crossNet.wires.length === 1, 'a crossing is not a connection');
  // dots
  doc.change('dots', () => W.updateDots(doc, model, nl));
  model = M.scan(doc);
  ok(model.dots.length === 4, 'four dots placed', String(model.dots.length));
  doc.change('rm', () => doc.remove(loose.id, sheets[0].entities));
  // move the lamp branch off the rail: its T dot must go
  const top = model.wires.find((w) => w.pts[0].x === x3 && w.pts[0].y === 250);
  doc.change('mv', () => doc.update(top.id, { ...top.e, y1: 240 }, sheets[0].entities));
  model = M.scan(doc); nl = W.netlist(model);
  let r;
  doc.change('dots', () => { r = W.updateDots(doc, model, nl); });
  ok(r.removed === 1 && r.added === 0, 'a dot that no longer marks a junction is removed', JSON.stringify(r));
  doc.change('back', () => doc.update(top.id, { ...top.e, y1: 250 }, sheets[0].entities));
  // numbers
  model = M.scan(doc); nl = W.netlist(model);
  doc.change('n', () => { r = W.numberWires(doc, model, nl); });
  model = M.scan(doc);
  ok(r.added === nl.nets.length && model.wirenos.length === nl.nets.length, 'one number per net', JSON.stringify({ r, nets: nl.nets.length }));
  const vals = model.wirenos.map((w) => w.value).sort();
  ok(new Set(vals).size === vals.length, 'numbers are unique', vals.join(' '));
  ok(vals.every((v) => /^1\.\d{1,2}\.\d+$/.test(v)), 'numbers follow sheet.path.seq', vals.join(' '));
  const vert = model.wirenos.find((w) => near(w.e.rot, Math.PI / 2));
  ok(!!vert, 'a number on a vertical wire reads bottom to top');
  // renumbering again changes nothing; a locked number survives and is never reused
  doc.change('n', () => { r = W.numberWires(doc, model, nl); });
  ok(r.added === 0 && r.changed === 0, 'numbering again changes nothing', JSON.stringify(r));
  const first = model.wirenos[0];
  doc.change('lock', () => doc.update(first.id, { ...first.e, attrs: { ...first.e.attrs, WIRENO: '1.2.1', LOCK: '1' } }, first.space.map));
  model = M.scan(doc); nl = W.netlist(model);
  doc.change('n', () => { r = W.numberWires(doc, model, nl); });
  model = M.scan(doc);
  const v2 = model.wirenos.map((w) => w.value);
  ok(v2.filter((v) => v === '1.2.1').length === 1 && model.wirenos.find((w) => w.id === first.id).value === '1.2.1', 'a locked number stays, and no other net gets it', v2.join(' '));
  ok(W.formatNumber('W{seq:03}', { seq: 7 }) === 'W007' && W.formatNumber('{sheet}{path:02}-{seq}', { sheet: 3, path: 4, seq: 2 }) === '304-2', 'number formats with padding');
  // a wire number on no wire is removed
  doc.change('orphan', () => doc.add({ type: 'insert', block: 'EL_WIRENO', x: 5, y: 5, sx: 1, sy: 1, rot: 0, attrs: { WIRENO: 'X' } }, sheets[0].entities));
  model = M.scan(doc); nl = W.netlist(model);
  doc.change('n', () => { r = W.numberWires(doc, model, nl); });
  ok(r.removed === 1, 'an orphan wire number is removed');
  // per wire
  model = M.scan(doc); nl = W.netlist(model);
  doc.change('n', () => { r = W.numberWires(doc, model, nl, { per: 'wire', format: 'W{seq}' }); });
  model = M.scan(doc);
  ok(model.wirenos.length === model.wires.length, 'per wire: one number on every wire', model.wirenos.length + ' / ' + model.wires.length);
  // undo takes the whole numbering back in one step
  const before = model.wirenos.length;
  doc.undo();
  ok(M.scan(doc).wirenos.length < before, 'one undo step');
  // terminals pass their potential through
  const t1 = place(0, 'terminal', 300, 100);
  wire(0, [[300, 120], [300, 102.5]]);
  wire(0, [[300, 97.5], [300, 80]]);
  model = M.scan(doc); nl = W.netlist(model);
  const T1 = model.devices.find((d) => d.id === t1.id);
  ok(nl.netOfPin.get(T1.uid + '|P1') === nl.netOfPin.get(T1.uid + '|P2'), 'a terminal joins its two sides');
}

// ------------------------------------------------------------------------------------------------ E.3 / E.4 tags and cross-references
section('E.3 tags (IEC 81346) and E.4 cross-references');
{
  const { doc, place } = sheetDoc(3);
  const xp = (p) => 20 + 39 * (p - 0.5);
  const k = place(0, 'coil', xp(4), 150);
  const s = place(0, 'pushbutton.no', xp(2), 200);
  const c1 = place(1, 'contact.no', xp(5), 200);
  const c2 = place(2, 'contact.nc', xp(1), 200);
  const c3 = place(2, 'contact.main.3p', xp(7), 200);
  const q = place(1, 'breaker.3p', xp(1), 200);
  const tA = place(0, 'terminal', xp(9), 100), tB = place(0, 'terminal', xp(9), 80);
  let model = M.scan(doc), r;
  doc.change('tag', () => { r = D.autoTag(doc, model); });
  model = M.scan(doc);
  const by = (e) => model.devices.find((d) => d.id === e.id);
  ok(by(k).tag === '-K104' && by(s).tag === '-S102' && by(q).tag === '-Q201', 'tags from letter + sheet + path', [by(k).tag, by(s).tag, by(q).tag].join());
  ok(by(k).fullTag === '=A1+S1-K104', 'full designation with the sheet\'s plant and location');
  ok(by(c1).tag === '' , 'contacts are not tagged automatically');
  ok(by(tA).tag === '-X1' && by(tA).attrs.P1 === '2' && by(tB).attrs.P1 === '1' || (by(tA).attrs.P1 === '1' && by(tB).attrs.P1 === '2'), 'terminals get the strip and numbers', by(tA).attrs.P1 + ' ' + by(tB).attrs.P1);
  const k2 = place(0, 'coil', xp(4), 100);
  model = M.scan(doc);
  doc.change('tag', () => D.autoTag(doc, model));
  model = M.scan(doc);
  ok(by(k2).tag === '-K104.2', 'a second one on the same path', by(k2).tag);
  const seq = sheetDoc(1);
  const a = seq.place(0, 'coil', 50, 100), b = seq.place(0, 'coil', 150, 100), cc = seq.place(0, 'lamp', 250, 100);
  let sm = M.scan(seq.doc);
  seq.doc.change('t', () => D.autoTag(seq.doc, sm, { scheme: 'sequential' }));
  sm = M.scan(seq.doc);
  ok(['-K1', '-K2', '-P1'].every((t, i) => sm.devices.find((d) => d.id === [a, b, cc][i].id).tag === t), 'sequential tags');
  ok(D.splitTag('=A1+S2-K12').letter === 'K' && D.splitTag('-XT3').rest === '3', 'splitTag');
  const one = sheetDoc(1);
  const u1 = one.place(0, 'coil', 50, 100), u2 = one.place(0, 'lamp', 150, 100);
  let om = M.scan(one.doc);
  one.doc.change('t', () => D.autoTag(one.doc, om, { only: new Set([om.devices.find((d) => d.id === u2.id).uid]) }));
  om = M.scan(one.doc);
  ok(om.devices.find((d) => d.id === u1.id).tag === '' && om.devices.find((d) => d.id === u2.id).tag !== '', 'only: tags just the symbol asked for');
  // cross-references
  const setTag = (e, tag, extra = {}) => doc.change('t', () => { const sp = [doc.model, ...doc.layouts.map((l) => l.entities)].find((mm) => mm.get(e.id) === e || mm.has(e.id) && mm.get(e.id).block === e.block); const cur = sp.get(e.id); doc.update(e.id, { ...cur, attrs: { ...cur.attrs, TAG: tag, ...extra } }, sp); });
  setTag(c1, '-K104'); setTag(c2, '-K104'); setTag(c3, '-K104');
  model = M.scan(doc);
  doc.change('x', () => { r = D.updateXrefs(doc, model); });
  model = M.scan(doc);
  const K = by(k);
  ok(K.attrs.XREF1 === 'NO 13-14 /2.5', 'coil mirror line 1', K.attrs.XREF1);
  ok(K.attrs.XREF2 === 'NC 21-22 /3.1' && K.attrs.XREF3 === 'NO 1-2 /3.7' && K.attrs.XREF5 === 'NO 5-6 /3.7' && K.attrs.XREF6 === '', 'contacts in sheet/path order; a three-pole contact gives three lines', [K.attrs.XREF2, K.attrs.XREF3, K.attrs.XREF5].join(' | '));
  ok(by(c1).attrs.XREF === '/1.4' && by(c3).attrs.XREF === '/1.4', 'each contact points back to its coil');
  doc.change('x', () => { r = D.updateXrefs(doc, model); });
  ok(r === 0, 'updating again changes nothing');
  // move a contact to another path: references follow
  const sp1 = doc.layouts[1].entities;
  doc.change('mv', () => { const cur = sp1.get(c1.id); doc.update(c1.id, { ...cur, x: xp(8) }, sp1); });
  model = M.scan(doc);
  doc.change('x', () => D.updateXrefs(doc, model));
  model = M.scan(doc);
  ok(by(k).attrs.XREF1 === 'NO 13-14 /2.8', 'moving a contact updates its coil', by(k).attrs.XREF1);
  // a contact with no coil says nothing; a contact renamed away is dropped from the mirror
  setTag(c2, '-K999');
  model = M.scan(doc);
  doc.change('x', () => D.updateXrefs(doc, model));
  model = M.scan(doc);
  ok(by(c2).attrs.XREF === '' && !Object.values(by(k).attrs).some((v) => String(v).startsWith('NC')), 'a contact with no coil has no reference');
  // more contacts than lines
  for (let i = 0; i < 9; i++) { const e = place(2, 'contact.no', xp(1) + i, 100); setTag(e, '-K104'); }
  model = M.scan(doc);
  doc.change('x', () => D.updateXrefs(doc, model));
  model = M.scan(doc);
  ok(by(k).attrs.XREF8 === 'and 6 more', 'more contacts than mirror lines: "and n more"', by(k).attrs.XREF8);
}

// more sections are added by the other test files
const extra = fs.readdirSync(HERE).filter((f) => /^t-.*\.mjs$/.test(f)).sort();
for (const f of extra) await import(pathToFileURL(path.join(HERE, f)).href);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
