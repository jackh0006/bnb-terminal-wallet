import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const crates = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'v2', 'rust', 'crates');
const SOCKET_MARKERS = [
  'reqwest',
  'hyper::',
  'std::net',
  'tokio::net',
  'arti_client',
  'TcpStream',
  'UdpSocket',
];

async function rustSources(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await rustSources(full)));
    else if (entry.name.endsWith('.rs')) out.push(full);
  }
  return out;
}

test('only the net crate may use sockets', async () => {
  const violations = [];
  for (const crate of await fs.readdir(crates)) {
    if (crate === 'net') continue;
    const src = path.join(crates, crate);
    for (const file of await rustSources(src)) {
      const text = await fs.readFile(file, 'utf8');
      for (const marker of SOCKET_MARKERS) {
        if (text.includes(marker)) violations.push(`${crate}/${path.basename(file)}: ${marker}`);
      }
    }
    const manifest = await fs.readFile(path.join(src, 'Cargo.toml'), 'utf8').catch(() => '');
    for (const marker of ['reqwest', 'hyper', 'tokio', 'arti']) {
      if (new RegExp(`^\\s*${marker}\\s*=`, 'm').test(manifest))
        violations.push(`${crate}/Cargo.toml: ${marker}`);
    }
  }
  assert.deepEqual(violations, [], `socket use outside the net crate: ${violations.join(', ')}`);
});
