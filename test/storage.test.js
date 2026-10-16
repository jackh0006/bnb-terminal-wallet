import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readLocalJson, writePrivateJson } from '../src/storage.js';

test('private JSON is atomically replaced with owner-only permissions', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bnb-wallet-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'vault.json');

  await writePrivateJson(file, { version: 1, accounts: [] });
  assert.deepEqual(await readLocalJson(file), { version: 1, accounts: [] });
  assert.equal((await fs.stat(file)).mode & 0o077, 0);

  await writePrivateJson(file, { version: 2, accounts: ['public-address-only'] });
  assert.deepEqual(await readLocalJson(file), { version: 2, accounts: ['public-address-only'] });
});

test('local JSON reader refuses symlinks and oversized files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bnb-wallet-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'target.json');
  const link = path.join(directory, 'link.json');
  await fs.writeFile(target, '{}');
  await fs.symlink(target, link);

  await assert.rejects(readLocalJson(link), /regular file/);
  await assert.rejects(readLocalJson(target, 1), /too large/);
});
