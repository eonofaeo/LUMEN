// Syntax-check every extension JS module and verify manifest targets/icons exist.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const files = ['app.js', 'background.js', 'focus-state.js', 'focus.js', 'import-export.js', 'popup.js', 'store.js'];
const lines = [];
let bad = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ['--check', join('lumen-free', f)], { encoding: 'utf8' });
    lines.push('OK ' + f);
  } catch (e) {
    bad++;
    lines.push('FAIL ' + f + ' ' + String(e.stderr || e.message).split('\n')[0]);
  }
}
const man = JSON.parse(readFileSync(join('lumen-free', 'manifest.json'), 'utf8'));
for (const p of Object.values(man.icons)) {
  const ok = existsSync(join('lumen-free', p));
  lines.push((ok ? 'ICON-OK ' : 'ICON-MISSING ') + p);
  if (!ok) bad++;
}
for (const p of [man.chrome_url_overrides.newtab, man.action.default_popup, man.background.service_worker]) {
  const ok = existsSync(join('lumen-free', p));
  lines.push((ok ? 'TARGET-OK ' : 'TARGET-MISSING ') + p);
  if (!ok) bad++;
}
lines.push(bad ? 'SYNTAX/TARGET FAILURES: ' + bad : 'ALL-SYNTAX-AND-TARGETS-OK');
writeFileSync(join('reports', 'syntax-checks.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
process.exit(bad ? 1 : 0);
