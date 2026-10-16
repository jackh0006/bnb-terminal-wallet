// Generates the v1-behavior oracle for the Rust wallet crate.
// PUBLIC test vectors only. Never use a real phrase, key, or funds here.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HDNodeWallet, Interface, Wallet, parseUnits } from 'ethers';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'test', 'golden');
const PHRASE = 'test test test test test test test test test test test junk';
const RAW_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RECIPIENT = '0x92292be85cc55f9c3ac36212487dabbD4b63fd14'.toLowerCase();
// Mock token-contract address for offline encoding tests only: the 6th
// account of the public dev phrase. NOT a real USDT contract.
const TOKEN = HDNodeWallet.fromPhrase(PHRASE, undefined, `m/44'/60'/0'/0/5`).address.toLowerCase();

const derivations = [];
for (let i = 0; i < 200; i++) {
  const account = HDNodeWallet.fromPhrase(PHRASE, undefined, `m/44'/60'/0'/0/${i}`);
  derivations.push({ index: i, path: `m/44'/60'/0'/0/${i}`, address: account.address });
}

const keyAccount = new Wallet(RAW_KEY);
const erc20 = new Interface(['function transfer(address,uint256) returns (bool)']);
const txs = [];
const cases = [];
for (let i = 0; i < 25; i++) {
  cases.push({
    kind: 'bnb',
    chainId: i % 2 === 0 ? 56 : 97,
    nonce: i,
    value: parseUnits(`0.001${i}`, 18).toString(),
    gasPrice: '1000000000',
  });
  cases.push({
    kind: 'bep20',
    chainId: i % 2 === 0 ? 97 : 56,
    nonce: i,
    token: TOKEN,
    amount: parseUnits(`1.${i}`, 18).toString(),
    gasPrice: '1000000000',
  });
}
let n = 0;
for (const c of cases.slice(0, 50)) {
  const base = { chainId: c.chainId, nonce: c.nonce, gasLimit: 21_000, gasPrice: BigInt(c.gasPrice) };
  const req =
    c.kind === 'bnb'
      ? { ...base, to: RECIPIENT, value: BigInt(c.value) }
      : {
          ...base,
          to: c.token,
          value: 0n,
          data: erc20.encodeFunctionData('transfer', [RECIPIENT, BigInt(c.amount)]),
        };
  const signed = await keyAccount.signTransaction(req);
  txs.push({
    index: n++,
    kind: c.kind,
    chainId: c.chainId,
    nonce: c.nonce,
    gasLimit: 21_000,
    gasPrice: c.gasPrice,
    to: req.to,
    value: req.value.toString(),
    data: req.data ?? null,
    token: c.token ?? null,
    amount: c.amount ?? c.value,
    signed,
  });
}

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(
  path.join(outDir, 'derivations.json'),
  JSON.stringify(
    {
      generator: 'scripts/golden.mjs',
      phrase: 'public dev vector test test ... junk (Hardhat/Anvil default, NOT a real wallet)',
      count: derivations.length,
      derivations,
    },
    null,
    2,
  ),
);
await fs.writeFile(
  path.join(outDir, 'transactions.json'),
  JSON.stringify(
    {
      generator: 'scripts/golden.mjs',
      signer: 'public dev key 0xac09... (Hardhat/Anvil default, NOT real funds)',
      count: txs.length,
      transactions: txs,
    },
    null,
    2,
  ),
);
console.log(`wrote ${derivations.length} derivations and ${txs.length} transactions`);
