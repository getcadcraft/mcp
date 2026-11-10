#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * test.mjs — the P&ID add-on's Node tests (0.7 LC.5). The symbol library, lines and line numbers, how things connect, the
 * checks, the lists (CSV and a workbook read back by an independent reader), then the add-on in CadCraft (t-addon.mjs).
 *   node public_html/assets/apps/cadcraft/dev/addons/pid/test/test.mjs [--verbose]
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADDON = path.resolve(HERE, '..');
const VERBOSE = process.argv.includes('--verbose');
const APP = path.resolve(ADDON, '../..');
const ROOT = path.resolve(APP, '../../../../..');
const load = (f) => import(pathToFileURL(path.join(APP, f)).href);
const mine = (f) => import(pathToFileURL(path.join(ADDON, f)).href);

const I18n = await load('i18n.js');
I18n.init({ strings: JSON.parse(fs.readFileSync(path.join(APP, 'lang/en.json'), 'utf8')) });
const EN = JSON.parse(fs.readFileSync(path.join(ADDON, 'lang/en.json'), 'utf8'));
const C = await mine('lib/core.js');
const missing = new Set();
const look = C.lookupFrom(EN);
C.setT((k, v) => { if (!Object.prototype.hasOwnProperty.call(EN, k)) missing.add(k); return look(k, v); });
const S = await mine('lib/symbols.js');
const LN = await mine('lib/lines.js');
const MD = await mine('lib/model.js');
const CK = await mine('lib/checks.js');
const LS = await mine('lib/lists.js');
const TG = await mine('lib/tags.js');
const XL = await mine('lib/xlsx.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; if (VERBOSE) console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const section = (s) => console.log('\n' + s);
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
globalThis.__pidTest = { ok, section, near, load, mine, ADDON, APP, ROOT, VERBOSE, EN, missing };

section('The symbol library');
{
  const c = S.counts();
  ok(c.symbols >= 50 && c.actuators === 5, 'at least 50 shapes and 5 actuators', JSON.stringify(c));
  ok(S.SYMBOL_IDS.every((k) => S.drawSymbol(S.cleanSymbol({ sym: k, l: 1, tag: 'FIC-101', act: 'motor' })).length > 0), 'every symbol draws something');
  ok(S.SYMBOL_IDS.every((k) => { const d = S.SYMBOLS[k]; return d.std && S.GROUPS.includes(d.group) && ['required', 'optional', 'none'].includes(d.tagged); }), 'every symbol names a standard idea, a group and a tagging rule');
  ok(S.SYMBOL_IDS.every((k) => EN['sym.' + k]), 'every symbol has a name in the language file');
  ok(Object.keys(EN).every((k) => /^[a-z0-9]+([._-][a-z0-9]+)*$/.test(k)), 'every language key is lower case words joined by . _ or -');
  // each connection point lies on the drawn outline's box (nozzles are on the symbol, not floating beside it)
  const box = (k) => {
    const xs = [], ys = [];
    for (const e of S.SYMBOLS[k].shape()) {
      if (e.type === 'line') { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); } else if (e.type === 'circle' || e.type === 'arc') { xs.push(e.cx - e.r, e.cx + e.r); ys.push(e.cy - e.r, e.cy + e.r); }
      else if (e.type === 'poly') { for (const q of e.pts) { xs.push(q.x); ys.push(q.y); } } else if (e.type === 'hatch') { for (const l of e.loops) for (let i = 0; i < l.length; i += 2) { xs.push(l[i]); ys.push(l[i + 1]); } }
    }
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const bad = S.SYMBOL_IDS.filter((k) => { const bx = box(k); return S.SYMBOLS[k].conn.some((c2) => c2.x < bx.x0 - 1e-9 || c2.x > bx.x1 + 1e-9 || c2.y < bx.y0 - 1e-9 || c2.y > bx.y1 + 1e-9); });
  ok(!bad.length, 'connection points lie within each symbol\'s drawn box', bad.join(','));
  // the drawn lines reach the connection points of the in-line valves: the bow tie touches both
  const gate = S.drawSymbol(S.cleanSymbol({ sym: 'gate', l: 10 }));
  ok(gate.length === 2 && gate[0].pts.some((p) => near(p.x, -5) && near(p.y, 2.5)) && gate[1].pts.some((p) => near(p.x, 5) && near(p.y, -2.5)), 'a gate valve at size 10: two triangles, corners at ±5, ±2.5');
  ok(S.connPoints(S.cleanSymbol({ sym: 'gate', l: 10 })).map((p) => p.x).join() === '-5,5', 'its connections at the two ends');
  ok(S.isInline('gate') && S.isInline('reducer') && S.isInline('spec-break') && !S.isInline('pump-cf') && !S.isInline('angle') && !S.isInline('threeway'), 'which symbols sit in a line');
  const pump = S.connPoints(S.cleanSymbol({ sym: 'pump-cf', l: 4 }));
  ok(pump.length === 2 && near(pump[0].x, -1) && near(pump[1].x, 2) && near(pump[1].y, 1), 'a centrifugal pump: suction at the left, discharge up at the right');
  // tags
  ok(JSON.stringify(S.splitTag('FIC-101')) === '{"fn":"FIC","num":"101"}' && JSON.stringify(S.splitTag('tt 12a')) === '{"fn":"TT","num":"12A"}' && S.splitTag('P-101A').fn === 'P' && S.splitTag('hello world').num === '', 'splitTag: letters and number');
  const inst = S.drawSymbol(S.cleanSymbol({ sym: 'inst-field', l: 10, tag: 'FIC-101' })).filter((e) => e.type === 'text').map((e) => e.s);
  ok(JSON.stringify(inst) === '["FIC","101"]', 'an instrument balloon: its letters over its number');
  const eq = S.drawSymbol(S.cleanSymbol({ sym: 'pump-cf', l: 10, tag: 'P-101' })).filter((e) => e.type === 'text');
  ok(eq.length === 1 && eq[0].s === 'P-101' && eq[0].y < 0, 'equipment: its tag under the symbol');
  // untrusted data
  ok(S.cleanSymbol({ sym: 'nope', l: 1 }) === null && S.cleanSymbol({ sym: 'gate', l: -1 }) === null && S.cleanSymbol(null) === null, 'unknown symbol, bad size, nothing: refused');
  ok(S.cleanSymbol({ sym: 'check', l: 1, act: 'motor' }).act === 'none' && S.cleanSymbol({ sym: 'gate', l: 1, act: 'motor' }).act === 'motor' && S.connPoints(S.cleanSymbol({ sym: 'globe', l: 10, act: 'diaphragm' })).some((c) => c.n === 'actuator' && near(c.y, 5.2)) && !S.connPoints(S.cleanSymbol({ sym: 'globe', l: 10, act: 'manual' })).some((c) => c.n === 'actuator'), 'actuators: not on a check valve; a signal connection on top of a powered one, none on a hand wheel');
  const dirty = S.cleanSymbol({ sym: 'pump-cf', l: 1, tag: 'P\u0000-101' + 'x'.repeat(100), act: 'motor', attrs: { svc: 'water', 'bad key': 'x', dp: 5 } });
  ok(dirty.tag.length === 24 && !dirty.tag.includes('\u0000') && dirty.act === 'none' && dirty.attrs.svc === 'water' && !('bad key' in dirty.attrs) && dirty.attrs.dp === '5', 'cleaned: tag cut and stripped, no actuator on a pump, only good attribute keys');
  // the seeds: nothing of any maker's in the library
  const src = fs.readFileSync(path.join(ADDON, 'lib/symbols.js'), 'utf8');
  ok(!/aveva|intergraph|hexagon|autodesk|bentley|smartplant|plant ?3d/i.test(src), 'no vendor named in the symbol source');
}

section('Tags');
{
  ok(TG.nextTag(['P-101', 'P-102', 'V-101'], 'P') === 'P-103' && TG.nextTag([], 'T') === 'T-101' && TG.nextTag(['p 110'], 'P') === 'P-111', 'next tag: after the largest, from 101');
  ok(TG.nextLoop(['FIC-101', 'FT-101', 'PI-104']) === '105' && TG.nextLoop([]) === '101', 'next loop number');
  ok(JSON.stringify(TG.functionOf('fic')) === '{"variable":"F","modifiers":["I","C"]}' && TG.functionOf('1x') === null, 'letters read out');
  ok([...TG.duplicates(['P-101', 'p-101', 'P-102', ''])].join() === 'P-101,2', 'duplicates ignore case and blanks');
  ok(TG.FIRST.every((k) => EN['isa.first.' + k.toLowerCase()]) && TG.LATER.every((k) => EN['isa.later.' + k.toLowerCase()]), 'every instrument letter has words');
}

section('Lines and line numbers');
{
  const d = LN.cleanLine({ pts: [[0, 0], [0, 0], [10, 0], [10, 5]], size: '2"', svc: 'PW', seq: '101', spec: 'A1A', k: 4 });
  ok(d.pts.length === 3, 'a repeated point is dropped');
  ok(LN.lineNumber(d) === '2"-PW-101-A1A', 'the default scheme: size-service-sequence-spec');
  ok(LN.lineNumber({ ...d, spec: '' }) === '2"-PW-101' && LN.lineNumber({ ...d, size: '' }) === 'PW-101-A1A', 'an empty part leaves no double dash');
  ok(LN.lineNumber(d, '{svc}{seq}/{size}') === 'PW101/2"', 'another scheme');
  ok(LN.lineNumber({ ...d, lnOverride: 'X-1' }) === 'X-1' && LN.lineNumber({ ...d, style: 'electric' }) === '', 'a typed number wins; a signal has none');
  ok(LN.nextSeq([{ svc: 'PW', seq: '101' }, { svc: 'PW', seq: '104' }, { svc: 'SW', seq: '300' }], 'PW') === '105' && LN.nextSeq([], 'PW') === '101', 'next sequence per service');
  const e = LN.drawLine(d);
  ok(e[0].type === 'poly' && e.some((x) => x.type === 'hatch') && e.some((x) => x.type === 'text' && x.s === '2"-PW-101-A1A'), 'a line draws as a polyline, a flow arrow and its number');
  const label = e.find((x) => x.type === 'text');
  ok(near(label.rot, 0) && label.y > 0, 'the number reads left to right, above the line');
  ok(LN.drawLine({ ...d, arrow: 'none' }).every((x) => x.type !== 'hatch'), 'no arrow when asked');
  ok(LN.drawLine({ ...d, lbl: false }).every((x) => x.type !== 'text') && LN.cleanLine({ pts: [[0, 0], [1, 0]], lbl: false }).lbl === false && LN.cleanLine({ pts: [[0, 0], [1, 0]] }).lbl === true, 'a piece with lbl off writes no number; on by default');
  ok(LN.drawLine({ ...d, style: 'electric', arrow: 'none' })[0].lt === 'DASHED' && LN.drawLine({ ...d, style: 'software', arrow: 'none' })[0].lt === 'DOT', 'signal styles by linetype');
  ok(LN.drawLine({ ...d, style: 'pneumatic', arrow: 'none', pts: [[0, 0], [20, 0]] }).filter((x) => x.type === 'line').length >= 3, 'a pneumatic signal carries slashes');
  const t2 = LN.transformLine(d, [2, 0, 0, 2, 5, 5]);
  ok(near(t2.pts[1][0], 25) && near(t2.k, 8), 'transform: moved, scaled, its symbol size follows');
  ok(LN.cleanLine({ pts: [[0, 0]] }) === null && LN.cleanLine({ pts: [[0, 0], [NaN, 1]] }) === null && LN.cleanLine('x') === null, 'a line with fewer than two points is refused');
  const ends = LN.endsOf(d);
  ok(near(ends[0].a, Math.PI) && near(ends[1].a, Math.PI / 2), 'the ends know which way the line leaves');
}

// A small plant by hand: tank T-101 → (2" PW line with a gate valve) → pump P-101; a pressure indicator on the line
// l = 4: a tank's right nozzle sits at (1.6, −0.8) from its centre; a pump's suction at (−1, 0)
const sym = (id, sym2, x, y, extra = {}, rot = 0) => ({ uid: id, kind: 'pidsym', e: { x, y, rot }, data: S.cleanSymbol({ sym: sym2, l: 4, ...extra }) });
const line = (id, pts, extra = {}) => ({ uid: id, kind: 'pidline', e: {}, data: LN.cleanLine({ pts, k: 4, th: 0.8, ...extra }) });
const PW = { size: '2"', svc: 'PW', spec: 'A1A' };
function plant() {
  return [
    sym('1', 'tank', 0, 0, { tag: 'T-101', desc: 'Raw water tank', attrs: { svc: 'Raw water', cap: '50 m3' } }),
    sym('2', 'pump-cf', 100, 0, { tag: 'P-101', desc: 'Transfer pump', attrs: { dp: '8 bar' } }),
    line('3', [[1.6, -0.8], [23, -0.8]], { ...PW, seq: '101', arrow: 'none' }),
    sym('4', 'gate', 25, -0.8, { tag: 'V-101' }),
    line('5', [[27, -0.8], [50, -0.8], [50, 0], [99, 0]], { ...PW, seq: '101' }),
    sym('6', 'inst-field', 50, 20, { tag: 'PI-101', desc: 'Suction pressure' }),
    line('7', [[50, 18], [50, -0.4]], { style: 'electric', arrow: 'none' }),
  ];
}

section('Connections');
{
  const m = MD.scan(plant());
  ok(m.symbols.length === 4 && m.lines.length === 3, 'the model: four symbols, three lines');
  ok(MD.linkedTo(m, '3', 'end0').some((j) => j.uid === '1' && j.at === 'right'), 'a line end meets the tank\'s right nozzle');
  ok(MD.linkedTo(m, '3', 'end1').some((j) => j.uid === '4' && j.at === 'in') && MD.linkedTo(m, '5', 'end0').some((j) => j.uid === '4' && j.at === 'out'), 'the valve joins the two halves of the line');
  ok(MD.linkedTo(m, '5', 'end1').some((j) => j.uid === '2' && j.at === 'suction'), 'the last end meets the pump\'s suction');
  ok(MD.linkedTo(m, '7', 'end0').some((j) => j.uid === '6' && j.at === 'bottom') && MD.linkedTo(m, '7', 'end1').some((j) => j.uid === '5' && j.at === 'mid'), 'the signal runs from the balloon to the middle of the process line');
  ok(MD.linkedTo(m, '5', 'mid').some((j) => j.uid === '7'), 'and the process line knows it has a branch');
  const tr = MD.trace(m, m.byUid.get('3'), 0), tr1 = MD.trace(m, m.byUid.get('3'), 1);
  ok(tr.terminals.join() === 'T-101 (right)' && !tr.open, 'trace from the tank end: T-101 (right)', JSON.stringify(tr));
  ok(tr1.terminals.join() === 'P-101 (suction)' && tr1.branches.join() === '', 'trace through the valve: P-101 (suction)', JSON.stringify(tr1));
  // a rotated and moved pump: the nozzle follows the reference
  const m2 = MD.scan([sym('9', 'pump-cf', 10, 10, { tag: 'P-9' }, Math.PI / 2)]);
  ok(near(m2.symbols[0].conns[0].x, 10) && near(m2.symbols[0].conns[0].y, 9), 'turned a quarter: the suction is below the centre');
  // two symbols that touch are connected without a line
  const m3 = MD.scan([sym('a', 'gate', 0, 0), sym('b', 'gate', 4, 0)]);
  ok(MD.linkedTo(m3, 'a', 'out').some((j) => j.uid === 'b' && j.at === 'in'), 'symbols touching are joined');
}

section('Checks');
{
  const codes = (items) => CK.runChecks(MD.scan(items)).map((f) => f.code);
  ok(codes(plant()).join() === '', 'the plant has no findings', codes(plant()).join());
  const p1 = plant(); p1[1] = sym('2', 'pump-cf', 100, 0, {});
  ok(codes(p1).join() === 'no-tag', 'an untagged pump: no-tag');
  const p2 = plant(); p2.push(sym('8', 'pump-cf', 100, 40, { tag: 'p-101' }));
  const f2 = CK.runChecks(MD.scan(p2)).find((f) => f.code === 'dup-tag');
  ok(f2 && f2.items.sort().join() === '2,8', 'two P-101 (any case): dup-tag naming both', JSON.stringify(f2));
  const p3 = plant(); p3[4] = line('5', [[27, -0.8], [50, -0.8], [50, 0], [90, 0]], { ...PW, seq: '101' });
  const f3 = CK.runChecks(MD.scan(p3)).filter((f) => f.code === 'open-end');
  ok(f3.length === 1 && near(f3[0].at.x, 90), 'a line stopping short of the pump: open-end at the loose end', JSON.stringify(f3));
  const p4 = plant(); p4[2] = line('3', [[1.6, -0.8], [23, -0.8]], { arrow: 'none' }); p4[4] = line('5', [[27, -0.8], [50, -0.8], [50, 0], [99, 0]], { arrow: 'none' });
  ok(codes(p4).filter((c2) => c2 === 'no-line-number').length === 2, 'process lines with no number: no-line-number');
  const p5 = plant(); p5[5] = sym('6', 'inst-field', 50, 20, { tag: 'PI' });
  ok(codes(p5).join() === 'no-loop', 'PI with no loop number');
  const p6 = plant(); p6.push(sym('8', 'inst-field', 80, 40, { tag: 'TI-201' }));
  ok(codes(p6).join() === 'inst-alone', 'a balloon with nothing attached');
  const p7 = plant(); p7[4] = line('5', [[27, -0.8], [50, -0.8], [50, 0], [99, 0]], { ...PW, seq: '102' });
  ok(codes(p7).join() === '', 'a line number may change at a valve');
  const p8 = plant(); p8.splice(3, 1); p8[3] = line('5', [[23, -0.8], [50, -0.8], [50, 0], [99, 0]], { ...PW, seq: '102' });
  ok(codes(p8).join() === 'ln-changes', 'lines 101 and 102 joined end to end: ln-changes');
  const p9 = plant(); p9.push(sym('8', 'gate', 70, 30, { tag: 'V-9' }), line('9', [[68, 30], [60, 30]], { ...PW, seq: '103' }));
  ok(codes(p9).includes('open-port') && codes(p9).includes('open-end'), 'a valve with one side joined only: open-port', codes(p9).join());
  const all = CK.runChecks(MD.scan(p1.concat([sym('8', 'pump-cf', 100, 0, { tag: 'P-101' })])));
  ok(all[0].level === 'error', 'errors come before warnings');
  ok(['no-tag', 'dup-tag', 'open-end', 'open-port', 'no-line-number', 'no-loop', 'ln-changes', 'inst-alone'].every((k) => EN['check.' + k]), 'every check has its words');
}

section('Lists');
{
  const m = MD.scan(plant());
  const ll = LS.lineList(m);
  ok(ll.rows.length === 1 && ll.rows[0][0] === '2"-PW-101-A1A' && ll.rows[0][1] === '2"' && ll.rows[0][2] === 'PW' && ll.rows[0][3] === 'A1A', 'line list: one row for the two halves of line 101', JSON.stringify(ll.rows));
  ok(ll.rows[0][5] === 'T-101 (right)' && ll.rows[0][6] === 'P-101 (suction)', 'from the tank, to the pump', JSON.stringify(ll.rows[0]));
  const el = LS.equipmentList(m);
  ok(el.rows.map((r) => r[0]).join() === 'P-101,T-101' && el.rows[0][1] === 'Centrifugal pump' && el.rows[0][4] === '8 bar' && el.rows[0][8] === '1/2' && el.rows[0][9] === '2"-PW-101-A1A', 'equipment list: sorted by tag, type, figures, nozzles used, connected line', JSON.stringify(el.rows[0]));
  ok(el.rows[1][3] === 'Raw water' && el.rows[1][6] === '50 m3', 'the tank\'s service and capacity');
  const ii = LS.instrumentIndex(m);
  ok(ii.rows.length === 1 && ii.rows[0][0] === 'PI-101' && ii.rows[0][1] === 'Pressure: indicate' && ii.rows[0][2] === '101' && ii.rows[0][3] === 'Instrument, field mounted' && ii.rows[0][6] === '2"-PW-101-A1A', 'instrument index: PI-101 reads Pressure: indicate, on the line', JSON.stringify(ii.rows[0]));
  const vl = LS.valveList(m);
  ok(vl.rows.length === 1 && vl.rows[0][0] === 'V-101' && vl.rows[0][1] === 'Gate valve' && vl.rows[0][3] === '2"-PW-101-A1A', 'valve list: V-101 on line 101', JSON.stringify(vl.rows[0]));
  ok(LS.functionText('FIC') === 'Flow: indicate, control' && LS.functionText('T') === 'Temperature' && LS.functionText('1') === '', 'a function read out in words');
  const text = LS.toCsvAll(LS.allLists(m));
  ok(text.startsWith('Line list\r\nLine number,Size,Service,Spec,Insulation,From,To,Branches\r\n"2""-PW-101-A1A","2""",PW,A1A,') || text.startsWith('Line list\r\nLine number,Size,Service,Spec,Insulation,From,To,Branches\r\n'), 'CSV: each list under its name', text.slice(0, 160));
  ok(/\r\n\r\nEquipment list\r\n/.test(text) && /Instrument index/.test(text) && /Valve list/.test(text), 'all four in one CSV');
  const inj = C.csv([['=1+1', '+x', '-y', '@z', 'ok', 5]]);
  ok(inj === "'=1+1,'+x,'-y,'@z,ok,5\r\n", 'CSV: a cell that starts like a formula is text', inj);
  // an unnumbered line gets its own row; a tee shows as a branch
  const m2 = MD.scan([...plant(), line('9', [[50, 0.4], [60, 10]], {}), line('10', [[50, -0.1], [60, -20]], { ...PW, seq: '102' })]);
  const l2 = LS.lineList(m2);
  ok(l2.rows.length === 3 && l2.rows.some((r) => r[0] === '(no number)') && l2.rows.find((r) => r[0] === '2"-PW-101-A1A')[7].includes('2"-PW-102-A1A'), 'unnumbered lines are listed; a branch shows on its main', JSON.stringify(l2.rows));
}

section('XLSX: the workbook, read back by an independent reader');
{
  const lists = LS.allLists(MD.scan(plant()));
  const bytes = await XL.writeXlsx(LS.toSheets(lists), { title: 'Test' });
  ok(bytes[0] === 0x50 && bytes[1] === 0x4b, 'a zip');
  const out = path.join(ROOT, 'tmp', 'pid-test.xlsx');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  const { execFileSync } = await import('node:child_process');
  let got = null;
  try {
    const py = `
import zipfile, json, sys, re
import xml.etree.ElementTree as ET
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
wb=ET.fromstring(z.read('xl/workbook.xml')); names=[s.get('name') for s in wb.find('m:sheets',NS)]
res={}
for i,n in enumerate(names):
    sh=ET.fromstring(z.read('xl/worksheets/sheet%d.xml'%(i+1))); rows=[]
    for r in sh.iter('{%s}row'%NS['m']):
        row=[]
        for c in r.findall('m:c',NS):
            t=c.find('m:is/m:t',NS); v=c.find('m:v',NS)
            col=0
            for ch in re.match('[A-Z]+',c.get('r')).group(0): col=col*26+ord(ch)-64
            while len(row)<col-1: row.append(None)
            row.append(t.text if t is not None else (v.text if v is not None else None))
        rows.append(row)
    res[n]=rows
print(json.dumps(res))`;
    got = JSON.parse(execFileSync('python3', ['-I', '-c', py, out], { encoding: 'utf8' }));
  } catch (err) { console.log('  (python3 not usable: ' + String(err.message).split('\n')[0] + ')'); }
  if (got) {
    ok(Object.keys(got).join() === 'Line list,Equipment list,Instrument index,Valve list', 'four worksheets, named', Object.keys(got).join());
    ok(got['Line list'][0].join() === 'Line number,Size,Service,Spec,Insulation,From,To,Branches' && got['Line list'][1][0] === '2"-PW-101-A1A' && got['Line list'][1][4] === null && got['Line list'][1][5] === 'T-101 (right)', 'the line list reads back as written', JSON.stringify(got['Line list']));
    ok(got['Valve list'][1][0] === 'V-101' && got['Instrument index'][1][1] === 'Pressure: indicate', 'valve list and instrument index too');
  }
  // a formula-looking cell stays text in the workbook
  const b2 = await XL.writeXlsx(LS.toSheets([{ name: 'X', columns: ['a'], rows: [['=HYPERLINK("http://x","y")']] }]));
  fs.writeFileSync(out, b2);
  const sheetXml = (await import('node:child_process')).execFileSync('python3', ['-I', '-c', "import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read('xl/worksheets/sheet1.xml').decode())", out], { encoding: 'utf8' });
  ok(!/<f>/.test(sheetXml) && /inlineStr/.test(sheetXml), 'a cell that looks like a formula is written as text, never as a formula');
  fs.rmSync(out, { force: true });
}

const extra = fs.readdirSync(HERE).filter((f) => /^t-.*\.mjs$/.test(f)).sort();
for (const f of extra) await import(pathToFileURL(path.join(HERE, f)).href);

section('Words');
ok(!missing.size, 'every string the add-on asked for is in lang/en.json', [...missing].join(', '));
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
