#!/usr/bin/env node
/* SPDX-License-Identifier: Apache-2.0 */
/**
 * browser.mjs — the Electrical add-on in /lab/cadcraft (0.4 part 2, E.11). Run as root: it makes its own test admin
 * (eltest+cadcraft@projectz.xyz, disabled again at the end, never deleted) with `sudo -u www-data php -r …` and uses root's
 * Playwright Chromium.
 *
 *   node public_html/assets/apps/cadcraft/dev/addons/electrical/test/browser.mjs [--shots dir]
 *
 * The add-on starts from the build's addons/index.json and is listed in Settings › Add-ons; its toolbar group, More menu,
 * right-panel section and Settings fieldset are there; a sheet, a coil, a contact, wires and numbers made by typing at the
 * command line (with the cross-references live); a symbol placed from the panel; the Properties panel's Electrical section;
 * its help in the help panel; switched off and on again in Settings; no console errors.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../../..');
const BASE = 'https://getcadcraft.com';
const args = process.argv.slice(2);
const si = args.indexOf('--shots');
const SHOTS = si >= 0 ? args[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m + (extra ? ' — ' + extra : '')); } };

const EMAIL = 'eltest+cadcraft@projectz.xyz';
const php = (body) => execFileSync('sudo', ['-u', 'www-data', 'php', '-r', "require '" + REPO + "/public_html/core/bootstrap.php'; " + body], { encoding: 'utf8' });
const pw = php(`$pw = bin2hex(random_bytes(12)); Auth::upsertAdmin('${EMAIL}', $pw); $u = Auth::byEmail('${EMAIL}'); if ($u && ($u['status'] ?? '') !== 'active') Auth::setStatus((int)$u['id'], 'active'); echo $pw;`).trim();
const down = () => { try { php(`$u = Auth::byEmail('${EMAIL}'); if ($u) Auth::setStatus((int)$u['id'], 'disabled');`); } catch { /* reported by the run */ } };

const { chromium } = await import('playwright-core');
const cacheDir = path.join(process.env.HOME || '/root', '.cache/ms-playwright');
const build = fs.readdirSync(cacheDir).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]))[0];
const exe = ['chrome-linux64/chrome', 'chrome-linux/chrome'].map((s) => path.join(cacheDir, build, s)).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--host-resolver-rules=MAP getcadcraft.com 127.0.0.1'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
const problems = [];
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));

const typeCmd = async (s, wait = 150) => { await page.click('[data-cmd-input]'); await page.keyboard.type(s); await page.keyboard.press('Enter'); await page.waitForTimeout(wait); };
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const idle = () => page.waitForFunction(() => !window.cadcraft.engine.busy, null, { timeout: 15000 });
const scanned = () => page.evaluate(async () => {
  const M = await import('/assets/apps/cadcraft/dev/addons/electrical/lib/model.js');
  const m = M.scan(window.cadcraft.doc);
  return { sheets: m.sheets.length, devices: m.devices.map((d) => ({ sym: d.sym, tag: d.tag, place: d.place, attrs: d.attrs, id: d.id })), wires: m.wires.length, wirenos: m.wirenos.map((w) => w.value) };
});
const grid = (v) => Math.round(v / 2.5) * 2.5;
const xp = (p) => grid(20 + 39 * (p - 0.5));

async function openLab() {
  await page.goto(BASE + '/lab/cadcraft', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.cadcraft?.host && !!window.ccAddons);
  await page.waitForFunction(() => window.ccAddons.list().some((a) => a.id === 'electrical' && a.state !== 'loading'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}

try {
  await page.goto(BASE + '/admin/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', pw);
  await Promise.all([page.waitForNavigation(), page.click('form button[type="submit"]')]);
  await openLab();
  await page.evaluate(() => { try { localStorage.removeItem('cc-addon:cadcraft:electrical:settings'); const k = 'cc-addons:cadcraft'; const s = JSON.parse(localStorage.getItem(k) || '{}'); if (s.off) delete s.off.electrical; localStorage.setItem(k, JSON.stringify(s)); } catch { /* fine */ } });
  await openLab();

  console.log('\n== the add-on starts');
  const me = await page.evaluate(() => window.ccAddons.list().find((a) => a.id === 'electrical'));
  ok(me?.state === 'active' && me.source === 'bundled', 'Electrical is bundled and active', JSON.stringify(me && { state: me.state, source: me.source, reason: me.reason, detail: me.detail }));
  const ui = await page.evaluate(() => ({
    group: !!document.querySelector('[data-addon-group="electrical:electrical"]'),
    tools: [...document.querySelectorAll('[data-addon-group="electrical:electrical"] [data-addon-tool]')].map((b) => b.textContent.trim()),
    menu: [...document.querySelectorAll('[data-addon-group="electrical:electrical"] [data-addon-item]')].length,
    panel: !!document.querySelector('[data-addon-section="electrical:electrical"] [data-el-symbol]'),
    settings: !!document.querySelector('[data-addon-settings="electrical:electrical"] [data-el-setting="std"]'),
    rows: new Set([...document.querySelectorAll('[data-cadcraft] > [role="toolbar"] > [role="group"], [data-cadcraft] > [role="toolbar"] > [data-addon-group]')].map((g) => Math.round(g.getBoundingClientRect().top))).size,
  }));
  ok(!ui.group && ui.rows <= 2, 'no toolbar group by default: CadCraft\'s toolbar keeps two rows at 1440 px', JSON.stringify(ui));
  ok(ui.panel && await page.evaluate(() => document.querySelectorAll('[data-addon-section="electrical:electrical"] [data-el-cmd]').length) === 15, 'the right panel has the Electrical section: every action and the symbols');
  ok(ui.settings, 'Settings › CadCraft has the Electrical fieldset');
  await page.evaluate(() => { const s = document.querySelector('[data-el-setting="toolbar"]'); s.value = 'true'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(200);
  const tb = await page.evaluate(() => ({ tools: [...document.querySelectorAll('[data-addon-group="electrical:electrical"] [data-addon-tool]')].map((b) => b.textContent.trim()), menu: document.querySelectorAll('[data-addon-group="electrical:electrical"] [data-addon-item]').length }));
  ok(tb.tools.length === 4 && tb.menu === 11, 'switched on in Settings: the group with four tools and a More menu', JSON.stringify(tb));
  await page.evaluate(() => { const s = document.querySelector('[data-el-setting="toolbar"]'); s.value = 'false'; s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.querySelector('[data-addon-group="electrical:electrical"]')), 'and off again');
  const help = await page.evaluate(async () => { await window.cadcraftHelp?.load?.(); return (window.cadcraftHelp?.topics?.() || []).filter((t) => t.scope === 'addon:electrical').map((t) => t.slug); });
  ok(help.length === 9 && help.includes('electrical-start') && help.includes('electrical-import-symbols'), 'its help is in the help panel', JSON.stringify(help));

  console.log('\n== a schematic from the command line');
  await typeCmd('ELSHEET'); await typeCmd('A3'); await typeCmd('Control');
  await idle();
  let m = await scanned();
  ok(m.sheets === 1 && await page.evaluate(() => !window.cadcraft.doc.inModel), 'ELSHEET adds a sheet and opens it');
  await typeCmd('ELSYMBOL'); await typeCmd('coil'); await typeCmd(`${xp(2)},150`); await idle();
  await typeCmd('ELSYMBOL'); await typeCmd('contact.no'); await typeCmd(`${xp(6)},200`); await typeCmd('-K102'); await idle();
  m = await scanned();
  const coil = m.devices.find((d) => d.sym === 'coil'), contact = m.devices.find((d) => d.sym === 'contact.no');
  ok(coil?.tag === '-K102' && contact?.tag === '-K102', 'coil tagged from its path; the contact takes its tag', JSON.stringify([coil?.tag, contact?.tag]));
  ok(coil?.attrs.XREF1 === 'NO 13-14 /1.6' && contact?.attrs.XREF === '/1.2', 'cross-references at once', JSON.stringify([coil?.attrs.XREF1, contact?.attrs.XREF]));
  await typeCmd('ELWIRE'); await typeCmd(`${xp(2)},250`); await typeCmd(`${xp(2)},155`); await idle();
  await typeCmd('ELWIRE'); await typeCmd(`${xp(2)},145`); await typeCmd(`${xp(2)},60`); await typeCmd(''); await idle();
  await typeCmd('ELNUMBER'); await typeCmd(''); await idle();
  m = await scanned();
  ok(m.wires === 2 && m.wirenos.length === 2 && m.wirenos.every((v) => /^1\.2\.\d$/.test(v)), 'two wires, two numbers on path 2', JSON.stringify(m.wirenos));
  // the panel places a symbol
  await page.click('[data-addon-section="electrical:electrical"] details:nth-of-type(7) > summary').catch(() => {});
  await page.evaluate(() => { for (const d of document.querySelectorAll('[data-addon-section="electrical:electrical"] details')) d.open = true; });
  await page.click('[data-el-symbol="lamp"]');
  await page.waitForTimeout(200);
  await typeCmd(`${xp(4)},150`); await idle();
  m = await scanned();
  ok(m.devices.some((d) => d.sym === 'lamp' && d.tag === '-P104'), 'a symbol from the panel', JSON.stringify(m.devices.map((d) => d.sym + d.tag)));
  await page.evaluate(() => window.cadcraft.host.zoomExtents());
  await page.waitForTimeout(300);
  await shot('01-schematic');

  console.log('\n== Properties');
  await page.evaluate((id) => window.cadcraft.host.setSelection(new Set([id])), coil.id);
  await page.waitForTimeout(500);
  const props = await page.evaluate(() => {
    const t = document.body.innerText;
    return { has: /Designation/.test(t) && /Contacts at/.test(t), text: (t.match(/Electrical[\s\S]{0,300}/) || [''])[0].slice(0, 300) };
  });
  ok(props.has, 'the Properties panel shows the Electrical section for the coil', props.text.replace(/\s+/g, ' '));
  await shot('02-properties');
  await page.evaluate(() => window.cadcraft.host.setSelection(new Set()));

  console.log('\n== ELCHECK and a list');
  await typeCmd('ELCHECK'); await page.waitForTimeout(300);
  const hist = await page.$$eval('.cc-history li', (ls) => ls.map((l) => l.textContent));
  ok(hist.some((l) => /errors, \d+ warnings|No problems found/.test(l)), 'ELCHECK reports', hist.slice(-4).join(' | '));
  await page.keyboard.press('Escape'); await idle();
  await typeCmd('ELREPORT'); await typeCmd('P'); await typeCmd('D'); await idle();
  ok(await page.evaluate(() => window.cadcraft.doc.layouts.some((l) => l.name === 'Parts list')), 'the parts list on a sheet');
  await page.waitForTimeout(300);
  await shot('03-parts-list');

  console.log('\n== switching it off and on');
  await page.evaluate(() => window.ccAddons.loader.setEnabled('electrical', false));
  await page.waitForTimeout(300);
  const off = await page.evaluate(() => ({ panel: !!document.querySelector('[data-addon-section="electrical:electrical"]'), settings: !!document.querySelector('[data-addon-settings="electrical:electrical"]') }));
  ok(!off.panel && !off.settings, 'off: its panel section and settings are gone', JSON.stringify(off));
  await typeCmd('ELWIRE'); await page.waitForTimeout(200);
  const h2 = await page.$$eval('.cc-history li', (ls) => ls.map((l) => l.textContent));
  ok(h2.some((l) => /Unknown command|No such command/i.test(l)), 'off: ELWIRE is not a command', h2.slice(-2).join(' | '));
  await page.evaluate(() => window.ccAddons.loader.setEnabled('electrical', true));
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!document.querySelector('[data-addon-section="electrical:electrical"]') && window.ccAddons.list().find((a) => a.id === 'electrical').state === 'active'), 'on again');

  console.log('\n== model space theme');
  await page.evaluate(() => { document.documentElement.dataset.space = 'model'; });
  await page.waitForTimeout(300);
  await shot('04-model-space');

  ok(!problems.length, 'no console errors', problems.slice(0, 5).join(' | '));
} catch (err) {
  fail++;
  console.log('  FAIL stopped: ' + (err?.stack || err));
  await shot('99-error').catch(() => {});
} finally {
  await browser.close();
  down();
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
