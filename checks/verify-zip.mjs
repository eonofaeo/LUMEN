// Compare lumen-free.zip entries against the live lumen-free/ folder (pure Node, no shell-outs).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const buf = readFileSync(join(root, 'lumen-free.zip'));

// Locate End Of Central Directory.
let eocd = -1;
for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
  if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) { console.log('EOCD-NOT-FOUND'); process.exit(1); }
const count = buf.readUInt16LE(eocd + 10);
let ptr = buf.readUInt32LE(eocd + 16);
const entries = [];
for (let n = 0; n < count; n++) {
  if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
  const method = buf.readUInt16LE(ptr + 10);
  const csize = buf.readUInt32LE(ptr + 20);
  const nameLen = buf.readUInt16LE(ptr + 28);
  const extraLen = buf.readUInt16LE(ptr + 30);
  const commentLen = buf.readUInt16LE(ptr + 32);
  const local = buf.readUInt32LE(ptr + 42);
  const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
  // Local header: parse its own name/extra lengths to find data offset.
  const lNameLen = buf.readUInt16LE(local + 26);
  const lExtraLen = buf.readUInt16LE(local + 28);
  const dataStart = local + 30 + lNameLen + lExtraLen;
  const raw = buf.subarray(dataStart, dataStart + csize);
  const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
  entries.push({ name, data });
  ptr += 46 + nameLen + extraLen + commentLen;
}

const sha = (b) => createHash('sha256').update(b).digest('hex').toUpperCase();
function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else files.push(p);
  }
  return files;
}
const disk = new Map(walk(join(root, 'lumen-free')).map((f) => [
  'lumen-free/' + relative(join(root, 'lumen-free'), f).split(sep).join('/'),
  readFileSync(f),
]));

const out = [];
let bad = 0;
for (const e of entries) {
  if (e.name.endsWith('/') || e.data === null) continue;
  if (e.name === 'XC.md') {
    const diskXc = readFileSync(join(root, 'XC.md'));
    out.push(sha(e.data) === sha(diskXc) ? 'XC.md matches workspace XC.md' : 'XC.md DIFFERS');
    if (sha(e.data) !== sha(diskXc)) bad++;
    continue;
  }
  const d = disk.get(e.name);
  if (!d) { out.push('MISSING-ON-DISK: ' + e.name); bad++; continue; }
  if (sha(e.data) !== sha(d)) { out.push('DIFFERS: ' + e.name); bad++; }
}
for (const rel of disk.keys()) {
  if (!entries.some((e) => e.name === rel)) { out.push('NOT-IN-ZIP: ' + rel); bad++; }
}
out.push(bad === 0 ? 'ZIP-MATCHES-DISK (' + entries.filter((e) => e.data).length + ' files compared)' : 'ZIP-MISMATCHES: ' + bad);
console.log(out.join('\n'));
process.exit(bad === 0 ? 0 : 1);
