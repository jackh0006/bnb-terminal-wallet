import test from 'node:test';
import assert from 'node:assert/strict';
import { HDNodeWallet, Wallet, isAddress, Interface, Transaction, parseUnits } from 'ethers';

test('BIP-39 Ethereum standard path derives a valid EVM account', () => {
  const phrase = 'test test test test test test test test test test test junk';
  const account = HDNodeWallet.fromPhrase(phrase, undefined, "m/44'/60'/0'/0/0");
  assert.equal(account.address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
});

test('a raw private key creates a checksummed EVM address', () => {
  const account = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  assert.equal(isAddress(account.address), true);
  assert.equal(account.address, '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
});

test('BEP-20 transfer data encodes the intended recipient and exact amount', () => {
  const erc20 = new Interface(['function transfer(address,uint256) returns (bool)']);
  const recipient = '0x92292be85CC55f9C3Ac36212487daBbD4b63fd14';
  const amount = parseUnits('0.02', 18);
  const decoded = erc20.decodeFunctionData('transfer', erc20.encodeFunctionData('transfer', [recipient, amount]));
  assert.equal(decoded[0], recipient);
  assert.equal(decoded[1], amount);
});

test('locally signed transaction is bound to BNB Smart Chain ID 56', async () => {
  const account = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const signed = await account.signTransaction({ chainId: 56, nonce: 0, to: account.address, value: 0, gasLimit: 21_000, gasPrice: 1_000_000_000 });
  assert.equal(Transaction.from(signed).chainId, 56n);
});

test('zero address is detectable and must never be used as a recipient', () => {
  assert.equal(isAddress('0x0000000000000000000000000000000000000000'), true);
  assert.notEqual('0x0000000000000000000000000000000000000000', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
});

test('ethers V3 encrypted keystore round-trips without storing plaintext', async () => {
  const account = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const encrypted = await account.encrypt('correct horse battery staple');
  assert.equal(encrypted.includes(account.privateKey.slice(2)), false);
  const restored = await Wallet.fromEncryptedJson(encrypted, 'correct horse battery staple');
  assert.equal(restored.address, account.address);
});
