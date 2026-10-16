import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transaction } from 'ethers';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'golden');

test('derivation oracle holds 200 public-vector accounts', async () => {
  const oracle = JSON.parse(await fs.readFile(path.join(dir, 'derivations.json'), 'utf8'));
  assert.equal(oracle.count, 200);
  assert.equal(oracle.derivations.length, 200);
  assert.equal(oracle.derivations[0].path, `m/44'/60'/0'/0/0`);
  assert.equal(oracle.derivations[0].address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
});

test('signed-transaction oracle holds 50 cases bound to BSC chain IDs', async () => {
  const oracle = JSON.parse(await fs.readFile(path.join(dir, 'transactions.json'), 'utf8'));
  assert.equal(oracle.count, 50);
  assert.equal(oracle.transactions.length, 50);
  for (const tx of oracle.transactions) {
    assert.ok(tx.chainId === 56 || tx.chainId === 97, `unexpected chain ${tx.chainId}`);
    assert.equal(Transaction.from(tx.signed).chainId, BigInt(tx.chainId));
  }
});
