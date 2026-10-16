import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFile(path.join(root, p), 'utf8');

const TELEMETRY_DENY = [
  'firebase',
  'analytics',
  'sentry',
  'crashlytics',
  'mixpanel',
  'amplitude',
  'segment',
  'appsflyer',
  'telemetry',
  'tracking',
];

test('no telemetry or analytics dependencies are installed', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]
    .join(' ')
    .toLowerCase();
  for (const denied of TELEMETRY_DENY) {
    assert.doesNotMatch(names, new RegExp(denied), `dependency block must not contain ${denied}`);
  }
});

test('terminal source uses no cleartext http URLs', async () => {
  const source = await read('src/index.js');
  assert.doesNotMatch(source, /http:\/\/(?!localhost|127\.0\.0\.1)/, 'only HTTPS RPC endpoints are allowed');
});

test('v2 interface opens no sockets and imports no network packages', async () => {
  const main = await read('v2/lib/main.dart');
  assert.doesNotMatch(main, /package:http/, 'UI layer must not import network packages');
  assert.doesNotMatch(main, /dart:io/, 'UI layer must not use dart:io sockets');
  const pubspec = await read('v2/pubspec.yaml');
  assert.doesNotMatch(pubspec, /^ {2}http:/m, 'no http package dependency');
});
