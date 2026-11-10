/* SPDX-License-Identifier: Apache-2.0 */
// Part of test.mjs: the P&ID add-on in CadCraft — CadCraft's own loader, off by default and switched on; PIDSYMBOL (an inline
// valve cuts the line it is put on), PIDLINE (snaps to nozzles, carries the number on), PIDTAG, PIDLN, PIDLIST (a table that stays
// up to date), PIDCHECK typed at the command line, one undo step each; Properties; the exports; switched off, the drawing stays.
const { ok, section, near, load, APP, ROOT } = globalThis.__pidTest;
void ROOT;
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { Doc } = await load('doc.js');
const G = await load('geom.js');
const Cmd = await load('commands.js');
const P = await load('propdefs.js');
const { setup } = await import(pathToFileURL(path.join(APP, 'addons/pid/test/harness.mjs')).href);

section('The P&ID add-on in CadCraft: loader, PIDSYMBOL, PIDLINE, PIDTAG, PIDLN, PIDLIST, PIDCHECK, Properties, files');
const H = await setup({ enable: false });
const { doc, log, host, type, zooms, started, info, of, dataOf } = H;
const h = H;
const me = () => started.list().find((a) => a.id === 'pid');
ok(me()?.state === 'off' && !Cmd.lookup('PIDSYMBOL'), 'P&ID is bundled off by default', JSON.stringify(me() && [me().state, me().reason, me().detail]));
await started.loader.setEnabled('pid', true);
ok(me()?.state === 'active', 'switched on: active', JSON.stringify(me() && [me().state, me().reason, me().detail]));
const names = ['PIDSYMBOL', 'PIDLINE', 'PIDTAG', 'PIDLN', 'PIDLIST', 'PIDCHECK'];
ok(names.every((n) => Cmd.lookup(n) && Cmd.commandRegistry.owner(n) === 'pid'), 'its commands are registered, owned by the add-on');
ok(names.every((n) => { const hh = Cmd.commandList().find((c) => c.name === n)?.help; return hh && !/^cmd\./.test(hh); }), 'every command has help in the add-on\'s words');
const syms = () => of('pidsym'), lines = () => of('pidline');
const bySym = (s) => syms().find((e) => dataOf(e).sym === s);
const symIndex = (group, id) => String(H.S.idsOf(group).indexOf(id) + 1);
const groupNo = (g) => String(H.S.GROUPS.indexOf(g) + 1);

// a storage tank and a centrifugal pump: S (symbol) → group → symbol, then the click, then the tag
const u0 = doc.undoStack.length;
await type('PIDSYMBOL', 'S', groupNo('equip'), symIndex('equip', 'tank'), '0,0', 'T-101', '');
const tank = bySym('tank');
ok(tank && dataOf(tank).tag === 'T-101' && dataOf(tank).l === 4 && tank.layer === 'PID-EQUIP' && doc.undoStack.length === u0 + 1, 'PIDSYMBOL: a tank T-101, size 4 in, on PID-EQUIP, one undo step', JSON.stringify(tank && dataOf(tank)) + ' ' + log.slice(-2).join('|'));
await type('PIDSYMBOL', 'S', groupNo('equip'), symIndex('equip', 'pump-cf'), '100,0', 'P-101', '');
const pump = bySym('pump-cf');
ok(pump && dataOf(pump).tag === 'P-101' && near(pump.x, 100), 'a pump P-101 at 100, 0');
ok(doc.layers.has('PID-LINE-PROC') && doc.layers.get('PID-LINE-PROC').lineweight === 0.5, 'the layers exist, process lines heavier');
// a 2" PW line from the tank nozzle to the pump suction (the first and last clicks land on the nozzles)
await type('PIDLINE', 'V', 'PW', 'Z', '2"', 'P', 'A1A', '1.7,-0.9', '50,-0.8', '50,0', '99.2,0.1', '');
const ln1 = lines()[0];
ok(ln1 && dataOf(ln1).svc === 'PW' && dataOf(ln1).seq === '101' && dataOf(ln1).spec === 'A1A' && ln1.layer === 'PID-LINE-PROC', 'PIDLINE: a process line, number 101 given by itself', JSON.stringify(ln1 && dataOf(ln1)));
ok(near(dataOf(ln1).pts[0][0], 1.6) && near(dataOf(ln1).pts[0][1], -0.8) && near(dataOf(ln1).pts[3][0], 99) && near(dataOf(ln1).pts[3][1], 0), 'its first and last points snapped onto the tank\'s nozzle and the pump\'s suction', JSON.stringify(dataOf(ln1)?.pts));
ok(log.some((l) => /Line number 2"-PW-101-A1A/.test(l)), 'it says the number', log.slice(-2).join(' | '));
// a gate valve on the first segment: the line is cut either side of it
const n0 = doc.undoStack.length;
await type('PIDSYMBOL', 'S', groupNo('valve'), symIndex('valve', 'gate'), '25,-0.7', '');
const gate = bySym('gate');
ok(gate && doc.undoStack.length === n0 + 1 && lines().length === 2, 'an inline gate valve: one undo step, the line now two pieces', lines().length + '');
ok(gate && near(gate.x, 25) && near(gate.y, -0.8) && near(gate.rot, 0), 'it sits on the line, turned along it', JSON.stringify(gate && [gate.x, gate.y, gate.rot]));
const pieces = lines().map((e) => dataOf(e));
ok(pieces.every((d) => d.svc === 'PW' && d.seq === '101' && d.size === '2"') && pieces.filter((d) => d.arrow === 'end').length === 1, 'both pieces keep the number; one arrow, at the end');
ok(pieces.filter((d) => d.lbl).length === 1 && pieces.find((d) => d.lbl).pts.length === 4, 'one piece writes the number: the longer one', JSON.stringify(pieces.map((d) => d.lbl)));
await type('U');
ok(lines().length === 1 && !bySym('gate'), 'U puts the line back whole and takes the valve away');
await type('PIDSYMBOL', 'S', groupNo('valve'), symIndex('valve', 'gate'), '25,-0.7', '');
// a field pressure indicator, then an electric signal to the line
await type('PIDSYMBOL', 'S', groupNo('inst'), '1', '50,20', 'PI', '');
const pi = bySym('gate') && syms().find((e) => dataOf(e).sym === 'inst-field');
ok(pi && dataOf(pi).tag === 'PI-101', 'an instrument typed as letters gets the next loop number: PI-101', JSON.stringify(pi && dataOf(pi)));
await type('PIDLINE', 'Y', '3', '50,18.1', '50,-0.4', '');
const sig = lines().find((e) => dataOf(e).style === 'electric');
ok(sig && sig.layer === 'PID-LINE-SIGNAL' && dataOf(sig).pts.length === 2 && near(dataOf(sig).pts[0][1], 18), 'PIDLINE, electric: a signal from the balloon\'s foot (snapped) to the line', JSON.stringify(sig && dataOf(sig)));
// the check is clean
log.length = 0;
await type('PIDCHECK');
ok(log.some((l) => /No problems found/.test(l)), 'PIDCHECK: the diagram is clean', log.join(' | '));

// problems: an untagged vessel, a loose line end, a duplicate tag (made directly, as a pasted block would be)
const mk = (kind, data, x = 0, y = 0, layer = 'PID-EQUIP') => { let id; doc.change('test', () => { id = doc.add({ ...started.kinds.create('pid', kind, data, { layer }), x, y, rot: 0 }).id; }); return id; };
const vessel = mk('pidsym', { sym: 'vessel-v', l: 4, tag: '' }, 150, 50);
const dupe = mk('pidsym', { sym: 'pump-cf', l: 4, tag: 'p-101' }, 100, 40);
const loose = mk('pidline', { pts: [[200, 0], [220, 0]], svc: 'PW', size: '2"', seq: '102', spec: 'A1A', k: 4, th: 0.8 }, 0, 0, 'PID-LINE-PROC');
log.length = 0; zooms.length = 0;
await type('PIDCHECK');
ok(log.some((l) => /3 errors|\d+ errors, \d+ warnings/.test(l)) && log.some((l) => /vessel has no tag|Vertical vessel has no tag/i.test(l)) && log.some((l) => /Tag p-101 is used 2 times|Tag P-101 is used 2 times/i.test(l)) && log.some((l) => /ends on nothing/.test(l)), 'PIDCHECK: untagged item, duplicate tag, open line end — each named', log.join(' | '));
await type('1');
ok(zooms.length === 1 && host.selection.size >= 1, 'a finding\'s number zooms to it and selects what it names', JSON.stringify(zooms) + [...host.selection]);
await type('');
// PIDTAG: tag everything untagged (the vessel → V-101); PIDTAG by hand
await type('PIDTAG', 'A', '');
ok(dataOf(doc.get(vessel)).tag === 'V-101', 'PIDTAG, tag all untagged: the vessel becomes V-101', dataOf(doc.get(vessel)).tag);
await type('PIDTAG', '150,50', 'V-200', 'Surge vessel', '');
ok(dataOf(doc.get(vessel)).tag === 'V-200' && dataOf(doc.get(vessel)).desc === 'Surge vessel', 'PIDTAG, a click: tag and description');
// PIDLN: set a line's number fields and give it a new number
await type('PIDLN', 'V', 'SW', 'Z', '3"', 'P', 'B2B', 'N', '210,0.1', '');
const dl = dataOf(doc.get(loose));
ok(dl.svc === 'SW' && dl.size === '3"' && dl.spec === 'B2B' && dl.seq === '101', 'PIDLN: service, size and spec set, a fresh number in that service', JSON.stringify(dl));
// the duplicate goes; the loose line goes
host.setSelection(new Set([dupe, loose]));
await type('ERASE');
// PIDLIST: a line list on the sheet that follows the drawing
await type('PIDLIST', '1', '0,-60');
const tbl = doc.all().find((e) => info(e)?.kind === 'pidtable');
const rows = () => info(doc.get(tbl.id)).data.rows;
ok(tbl && rows()[0][0] === 'Line number' && rows()[1][0] === '2"-PW-101-A1A' && tbl.layer === 'PID-LIST', 'PIDLIST: the line list is on the sheet', JSON.stringify(tbl && rows()));
const before = rows().length;
log.length = 0;
await type('PIDLINE', 'V', 'CW', 'Z', '1"', 'P', 'A1A', '60,-30', '80,-30', '');
ok(rows().length === before + 1 && rows().some((r) => /^1"-CW-101-A1A$/.test(r[0])), 'drawing another line adds its row to the table by itself', JSON.stringify(rows().map((r) => r[0])));
await type('U');
ok(rows().length === before, 'U takes the row away again (one undo step with the line)');
// Properties
const pdefs = P.defsFor('insert', [doc.get(tank.id)], {});
const ftag = pdefs.find((x) => x.key === 'pid:tag'), fcap = pdefs.find((x) => x.key === 'pid:a-cap');
ok(ftag && ftag.get(doc.get(tank.id)) === 'T-101' && fcap, 'Properties: the tank\'s tag and capacity fields');
const r1 = P.applyValue(doc, fcap, [doc.get(tank.id)], '60 m3');
ok(r1.ok && dataOf(tank).attrs.cap === '60 m3', 'capacity set in Properties');
const lpdefs = P.defsFor('insert', [doc.get(ln1.id)], {});
const fsize = lpdefs.find((x) => x.key === 'pid:size'), fln = lpdefs.find((x) => x.key === 'pid:ln');
ok(fln && /PW-101-A1A/.test(fln.get(doc.get(ln1.id))), 'a line shows its number (read only)');
P.applyValue(doc, fsize, [doc.get(ln1.id)], '3"');
ok(dataOf(ln1).size === '3"' && /^3"-PW-101/.test(fln.get(doc.get(ln1.id))), 'the size changes in Properties and so does the number');
await type('U'); await type('U');

// the exports
const xl = started.exporters().find((x) => x.id.endsWith('pid-xlsx')), cs = started.exporters().find((x) => x.id.endsWith('pid-csv'));
const xbytes = xl ? await xl.write(doc) : null;
ok(xbytes && xbytes[0] === 0x50 && xbytes.length > 1500, 'EXPORT: an XLSX workbook');
const ctext = cs ? String(await cs.write(doc)) : '';
ok(/Line list\r\n/.test(ctext) && /T-101/.test(ctext) && /Centrifugal pump/.test(ctext) && /PI-101/.test(ctext) && ctext.startsWith('﻿'), 'EXPORT: the CSV with every list');

// a drawing in millimetres: the default symbol size is 100 mm
{
  doc.meta.units = 'millimeters';
  await type('PIDSYMBOL', 'S', groupNo('equip'), symIndex('equip', 'tank'), '0,5000', 'T-9', '');
  const e = syms().find((x) => dataOf(x).tag === 'T-9');
  ok(e && dataOf(e).l === 100, 'a drawing in millimetres: the symbol is 100 mm', e && JSON.stringify(dataOf(e)));
  doc.meta.units = 'inches';
  await type('U');
}

// off: the commands go, the objects stay (plain block references that show, plot and save)
const count = syms().length + lines().length;
await started.loader.setEnabled('pid', false);
ok(!Cmd.lookup('PIDSYMBOL') && !Cmd.lookup('PIDCHECK'), 'switched off: the commands are gone');
ok(doc.all().filter((e) => e.type === 'insert' && e.xd && Object.keys(e.xd).some((k) => /^CC_PID$/i.test(k))).length >= count && doc.all().every((e) => e.type !== 'insert' || doc.blocks.has(e.block)), 'the symbols and lines stay as block references with their data', count + '');
await started.loader.setEnabled('pid', true);
ok(syms().length + lines().length === count && Cmd.lookup('PIDSYMBOL'), 'switched on again: they are objects again');

export { started, h };
