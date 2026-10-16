import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const mainManifest = path.join(root, 'v2/android/app/src/main/AndroidManifest.xml');
const onlineManifest = path.join(root, 'v2/android/app/src/online/AndroidManifest.xml');

test('Cold Android flavor declares no INTERNET permission', async () => {
  const main = await fs.readFile(mainManifest, 'utf8');
  assert.doesNotMatch(
    main,
    /android\.permission\.INTERNET/,
    'main manifest must not request INTERNET; only the online flavor may',
  );
});

test('Online Android flavor declares INTERNET for future net crate', async () => {
  const online = await fs.readFile(onlineManifest, 'utf8');
  assert.match(online, /android\.permission\.INTERNET/, 'online flavor manifest must declare INTERNET');
});
