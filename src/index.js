#!/usr/bin/env node
import fs from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import qrcode from 'qrcode-terminal';
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  HDNodeWallet,
  isAddress,
  formatEther,
  formatUnits,
  parseUnits,
  getAddress,
} from 'ethers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STORE = path.join(ROOT, '.bnb-terminal-wallet.json');
const VAULT = path.join(ROOT, '.bnb-terminal-wallet-vault.json');
const TOKEN_LIST = path.join(ROOT, 'tokens.json');
const NETWORKS = {
  mainnet: {
    chainId: 56n,
    explorer: 'https://bscscan.com',
    rpc: 'https://bsc-dataseed.bnbchain.org',
    api: 'https://api.bscscan.com/api',
  },
  testnet: {
    chainId: 97n,
    explorer: 'https://testnet.bscscan.com',
    rpc: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
    api: 'https://api-testnet.bscscan.com/api',
  },
};
let CHAIN_ID = NETWORKS.mainnet.chainId;
let EXPLORER = NETWORKS.mainnet.explorer;
let DEFAULT_RPC = NETWORKS.mainnet.rpc;
// Official BNB Chain endpoints plus one independently operated fallback. Each is
// chain-ID verified before use; no endpoint is trusted solely by its URL.
const RPC_FALLBACKS = [
  DEFAULT_RPC,
  'https://bsc-dataseed-public.bnbchain.org',
  'https://bsc-dataseed.nariox.org',
  'https://bsc-dataseed.defibit.io',
  'https://bsc-rpc.publicnode.com',
];
const ERC20 = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
];
const CORE = [
  { symbol: 'USDT', name: 'Tether USD', address: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
  {
    symbol: 'BUSD',
    name: 'Binance-Peg BUSD Token',
    address: '0xe9e7CEA3Dedca5984780Bafc599bD69ADd087D56',
    decimals: 18,
  },
  { symbol: 'USDC', name: 'USD Coin', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 },
];
let builtInTokens = CORE;
const config = { network: 'mainnet', rpc: DEFAULT_RPC, tokens: [], wallets: [] };
let provider;
let wallet;
let activeRpc;
let activityFeed = [];

const c = chalk;
const theme = {
  orange: c.hex('#FF9D1C'),
  white: c.hex('#F8FAFC'),
  muted: c.hex('#94A3B8'),
  matrix: c.hex('#22C55E'),
};
// OSC 8 is supported by many modern terminals; the visible URL remains usable
// in terminals that do not support clickable hyperlinks.
const terminalLink = (url, label = url) => `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
const safeText = (value, max = 80) =>
  String(value)
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
function rpcDisplay(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return 'custom RPC';
  }
}
function live(message, state = 'info') {
  const icon = state === 'ok' ? '✓' : state === 'warn' ? '!' : '◌';
  activityFeed = [{ icon, message: safeText(message, 100) }, ...activityFeed].slice(0, 3);
  const color = state === 'ok' ? theme.matrix : state === 'warn' ? theme.orange : theme.white;
  console.log(color(`  ${icon}  ${message}`));
}
function header() {
  console.clear();
  const words = [
    'LOCAL_KEYS',
    'VERIFY_ADDRESS',
    'SIGN_LOCALLY',
    'CHAIN_56',
    'RPC_CHECK',
    'FEE_REVIEW',
    'CONFIRM_SEND',
    'PRIVATE_MEMORY',
  ];
  const tick = Math.floor(Date.now() / 130);
  const rain = Array.from({ length: 6 }, (_, i) => words[(tick + i * 3) % words.length]).join('  ');
  console.log(theme.matrix.dim(`  ${rain}`));
  console.log(theme.orange('╭──────────────────────────────────────────────────────────────╮'));
  console.log(
    theme.orange('│') +
      theme.white.bold('                 BNB  TERMINAL  WALLET                       ') +
      theme.orange('│'),
  );
  const status = activeRpc ? 'RPC ONLINE' : 'RPC CHECKING';
  console.log(
    theme.orange('│') +
      theme.matrix(`  ● ${status}`) +
      theme.muted(`  ·  PRIVATE KEYS STAY LOCAL  ·  CHAIN ${CHAIN_ID}       `) +
      theme.orange('│'),
  );
  console.log(theme.orange('╰──────────────────────────────────────────────────────────────╯'));
}
function short(a) {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}
function fail(e) {
  const rawMessage = e.shortMessage || e.reason || e.message || String(e);
  const message = safeText(rawMessage.replace(/https?:\/\/[^\s|)]+/g, '[RPC URL redacted]'), 700);
  console.log(c.red(`\nError: ${message}`));
  const lower = message.toLowerCase();
  if (/timeout|econnreset|eai_again|network/.test(lower))
    console.log(
      theme.orange(
        'What it means: the RPC node was slow, unavailable, or rate-limited. Wait a moment; the next request may use a fallback. In Network & asset settings, test or choose another HTTPS BSC node.',
      ),
    );
  else if (/insufficient funds|insufficient bnb/.test(lower))
    console.log(
      theme.orange(
        'What it means: BNB pays network gas. Keep extra BNB beyond the transfer amount, even when sending USDT or USDC.',
      ),
    );
  else if (/execution reverted|bep20/.test(lower))
    console.log(
      theme.orange(
        'What it means: the token contract rejected the simulated action. Check token balance, recipient, contract address, and BNB gas balance. Do not retry blindly.',
      ),
    );
  else if (/chain/.test(lower))
    console.log(
      theme.orange(
        `What it means: this endpoint is not the selected BNB Smart Chain network. Use a node reporting chain ID ${CHAIN_ID}.`,
      ),
    );
  else
    console.log(
      theme.muted(
        'Tip: choose Back, check the example beside the field, then try again. Never share a private key or recovery phrase to diagnose an error.',
      ),
    );
}
async function ask(q) {
  return inquirer.prompt(q);
}
async function load() {
  try {
    const stat = await fs.lstat(STORE);
    if (stat.isSymbolicLink()) return;
    const saved = JSON.parse(await fs.readFile(STORE, 'utf8'));
    if (!saved || typeof saved !== 'object') return;
    config.network = saved.network === 'testnet' ? 'testnet' : 'mainnet';
    applyNetwork(config.network);
    config.rpc = typeof saved.rpc === 'string' && /^https:\/\//.test(saved.rpc) ? saved.rpc : DEFAULT_RPC;
    config.tokens = Array.isArray(saved.tokens)
      ? saved.tokens
          .filter(
            (t) =>
              t &&
              isAddress(t.address) &&
              typeof t.symbol === 'string' &&
              Number.isInteger(t.decimals) &&
              t.decimals >= 0 &&
              t.decimals <= 36,
          )
          .map((t) => ({
            ...t,
            network: t.network === 'testnet' ? 'testnet' : 'mainnet',
            symbol: safeText(t.symbol, 20),
            name: safeText(t.name, 80),
            address: getAddress(t.address),
          }))
      : [];
    config.wallets = Array.isArray(saved.wallets)
      ? saved.wallets
          .filter((p) => p && isAddress(p.address) && typeof p.label === 'string')
          .map((p) => ({ ...p, address: getAddress(p.address), label: safeText(p.label) }))
          .filter((p) => p.label)
      : [];
  } catch {}
  // The checked-in token list is deliberately address-based, never symbol-based.
  // A malformed local edit is ignored rather than risking an unsafe asset entry.
  try {
    const listed = JSON.parse(await fs.readFile(TOKEN_LIST, 'utf8'));
    const networkTokens = listed?.[config.network];
    if (Array.isArray(networkTokens))
      builtInTokens = networkTokens
        .filter(
          (t) =>
            t &&
            isAddress(t.address) &&
            typeof t.symbol === 'string' &&
            Number.isInteger(t.decimals) &&
            t.decimals >= 0 &&
            t.decimals <= 36,
        )
        .map((t) => ({
          address: getAddress(t.address),
          symbol: safeText(t.symbol, 20),
          name: safeText(t.name, 80),
          decimals: t.decimals,
        }))
        .filter((t) => t.symbol && t.name);
  } catch {}
}
function applyNetwork(network) {
  const selected = NETWORKS[network] || NETWORKS.mainnet;
  config.network = network in NETWORKS ? network : 'mainnet';
  CHAIN_ID = selected.chainId;
  EXPLORER = selected.explorer;
  DEFAULT_RPC = selected.rpc;
}
async function save() {
  // O_NOFOLLOW prevents a local symlink from redirecting this settings write.
  const handle = await fs.open(STORE, FS.O_WRONLY | FS.O_CREAT | FS.O_TRUNC | FS.O_NOFOLLOW, 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(JSON.stringify(config, null, 2));
  } finally {
    await handle.close();
  }
}
async function saveVault(vault) {
  const handle = await fs.open(VAULT, FS.O_WRONLY | FS.O_CREAT | FS.O_TRUNC | FS.O_NOFOLLOW, 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(JSON.stringify(vault, null, 2));
  } finally {
    await handle.close();
  }
}
async function within(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s.`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function connect({ allowFallback = true } = {}) {
  const fallbacks =
    config.network === 'mainnet' ? RPC_FALLBACKS : [DEFAULT_RPC, 'https://bsc-testnet-rpc.publicnode.com'];
  const candidates = allowFallback
    ? [...new Set([process.env.BNB_RPC_URL, config.rpc, ...fallbacks].filter(Boolean))]
    : [config.rpc];
  const failures = [];
  for (const url of candidates) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let candidate;
      try {
        candidate = new JsonRpcProvider(url);
        const net = await within(candidate.getNetwork(), 6_000, 'RPC connection');
        if (net.chainId !== CHAIN_ID) throw new Error(`reports chain ${net.chainId}, not 56`);
        await within(candidate.getBlockNumber(), 6_000, 'RPC block check');
        provider = candidate;
        activeRpc = url;
        live(`RPC connected · chain 56 verified · ${rpcDisplay(url)}`, 'ok');
        return;
      } catch (e) {
        candidate?.destroy();
        failures.push(`${url} (try ${attempt}): ${e.shortMessage || e.message}`);
        // Small bounded exponential backoff prevents hammering a rate-limited node.
        if (attempt === 1) await pause(120 + Math.floor(Math.random() * 180));
      }
    }
  }
  throw new Error(`No BNB Chain RPC could be reached. ${failures.join(' | ')}`);
}
function tokens() {
  return [
    ...builtInTokens,
    ...config.tokens.filter(
      (x) =>
        x.network === config.network &&
        !builtInTokens.some((y) => y.address.toLowerCase() === x.address.toLowerCase()),
    ),
  ];
}
async function tokenMeta(address) {
  const x = new Contract(address, ERC20, provider);
  const [symbol, name, decimals] = await Promise.all([x.symbol(), x.name(), x.decimals()]);
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 36)
    throw new Error('Token reports an unsafe decimal precision. Refusing to add it.');
  const cleanSymbol = safeText(symbol, 20);
  const cleanName = safeText(name, 80);
  if (!cleanSymbol || !cleanName)
    throw new Error('Token metadata is empty or contains unsafe control characters. Refusing to add it.');
  return { address: getAddress(address), symbol: cleanSymbol, name: cleanName, decimals: places };
}
async function chooseAddress(label = 'Address') {
  const { address } = await ask([
    {
      type: 'input',
      name: 'address',
      message: `${label} (example: 0x123…; type BACK to return):`,
      validate: (x) => /^back$/i.test(x) || isAddress(x) || 'Enter a valid 0x EVM address, or BACK.',
    },
  ]);
  if (/^back$/i.test(address)) return undefined;
  const checked = getAddress(address);
  if (checked === '0x0000000000000000000000000000000000000000') {
    console.log(c.yellow('The zero address cannot receive a transfer in this wallet.'));
    return undefined;
  }
  return checked;
}
async function dashboard(address = wallet?.address) {
  if (!address) return console.log(c.yellow('Import a wallet first, or use Address inspector.'));
  live('Reading BNB and configured token balances…');
  console.log(c.bold(`\n${address === wallet?.address ? 'Wallet' : 'Address'} ${c.cyan(address)}`));
  const [bnb, nonce, block, balances] = await Promise.all([
    provider.getBalance(address),
    provider.getTransactionCount(address),
    provider.getBlockNumber(),
    Promise.all(
      tokens().map(async (t) => {
        try {
          return await new Contract(t.address, ERC20, provider).balanceOf(address);
        } catch {
          return null;
        }
      }),
    ),
  ]);
  console.log(`  ${c.yellow('BNB')}   ${formatEther(bnb)} BNB`);
  tokens().forEach((t, i) =>
    console.log(
      `  ${c.green(t.symbol.padEnd(5))} ${balances[i] === null ? c.dim('unavailable') : formatUnits(balances[i], t.decimals)}`,
    ),
  );
  console.log(c.dim(`  nonce ${nonce}  •  latest block ${block}  •  ${EXPLORER}/address/${address}`));
  live('Balances updated from the active RPC', 'ok');
}
async function history(address = wallet?.address) {
  if (!address) return console.log(c.yellow('Open a wallet first, or inspect an address.'));
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey)
    return console.log(
      c.yellow(
        'Transaction history requires BSCSCAN_API_KEY in your environment. See .env.example; balances and transfers do not require it.',
      ),
    );
  live('Fetching the latest public transaction activity…');
  const url = new URL(NETWORKS[config.network].api);
  url.search = new URLSearchParams({
    module: 'account',
    action: 'txlist',
    address,
    page: '1',
    offset: '10',
    sort: 'desc',
    apikey: apiKey,
  }).toString();
  let body;
  try {
    body = await within(fetch(url), 10_000, 'Explorer history request').then((r) => r.json());
  } catch {
    throw new Error('Could not fetch explorer history. Check your network or API key.');
  }
  if (body.status !== '1' && !/no transactions/i.test(body.message || body.result || ''))
    throw new Error('Explorer history request was rejected. Check your API key and selected network.');
  const rows = Array.isArray(body.result) ? body.result : [];
  if (!rows.length)
    return console.log(
      c.dim(
        'No normal transactions found for this address. Token transfers may appear separately on the explorer.',
      ),
    );
  console.log(c.bold(`\nLatest activity for ${short(address)}`));
  for (const tx of rows) {
    const direction = tx.from?.toLowerCase() === address.toLowerCase() ? 'OUT' : 'IN ';
    const amount = tx.value ? `${formatEther(BigInt(tx.value))} BNB` : 'contract interaction';
    console.log(`  ${direction}  ${amount.padEnd(24)} ${short(tx.hash)}  ${EXPLORER}/tx/${tx.hash}`);
  }
  live('Explorer history updated', 'ok');
}
async function importWallet() {
  const { kind } = await ask([
    {
      type: 'select',
      name: 'kind',
      message: 'Import method:',
      choices: [
        { name: 'Private key (0x…)', value: 'key' },
        { name: 'Recovery phrase (BIP-39)', value: 'phrase' },
        { name: 'Encrypted Ethereum V3 keystore JSON file', value: 'json' },
        { name: 'Saved encrypted local vault', value: 'vault' },
        { name: 'Explain wallet credential types', value: 'explain' },
        { name: 'Create a new wallet', value: 'new' },
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (kind === 'back') return;
  if (kind === 'explain') return credentialGuide();
  let next;
  if (kind === 'key') {
    const a = await ask([
      { type: 'password', name: 'v', message: 'Private key (hidden; type BACK to return):', mask: '*' },
    ]);
    if (/^back$/i.test(a.v.trim())) return;
    const key = a.v.trim();
    next = new Wallet(key.startsWith('0x') ? key : `0x${key}`);
  }
  if (kind === 'phrase') {
    const phrase = await ask([
      { type: 'password', name: 'v', message: 'Recovery phrase (hidden; type BACK to return):', mask: '*' },
    ]);
    if (/^back$/i.test(phrase.v.trim())) return;
    const a = await ask([
      {
        type: 'input',
        name: 'path',
        message: 'Derivation path (BIP-44 Ethereum default):',
        default: "m/44'/60'/0'/0/0",
      },
      {
        type: 'password',
        name: 'pass',
        message: 'Optional BIP-39 passphrase (hidden; blank if none):',
        mask: '*',
      },
    ]);
    next = HDNodeWallet.fromPhrase(phrase.v.trim(), a.pass || undefined, a.path.trim());
  }
  if (kind === 'json') {
    const where = await ask([
      { type: 'input', name: 'p', message: 'Keystore JSON path (type BACK to return):' },
    ]);
    if (/^back$/i.test(where.p.trim())) return;
    const a = await ask([
      { type: 'password', name: 'pass', message: 'Keystore password (hidden):', mask: '*' },
    ]);
    next = await Wallet.fromEncryptedJson(await fs.readFile(path.resolve(where.p), 'utf8'), a.pass);
  }
  if (kind === 'vault') {
    let vault;
    try {
      vault = JSON.parse(await fs.readFile(VAULT, 'utf8'));
    } catch {
      throw new Error('No readable encrypted local vault was found.');
    }
    if (!Array.isArray(vault.accounts) || !vault.accounts.length)
      throw new Error('The encrypted local vault has no usable accounts.');
    const pick = await ask([
      {
        type: 'select',
        name: 'index',
        message: 'Encrypted local accounts:',
        choices: [
          ...vault.accounts.map((x, i) => ({
            name: `${x.label || `Wallet ${i + 1}`} — ${short(x.address || 'unknown')}`,
            value: i,
          })),
          { name: '← Back', value: 'back' },
        ],
      },
    ]);
    if (pick.index === 'back') return;
    const pass = await ask([
      { type: 'password', name: 'value', message: 'Vault password (hidden):', mask: '*' },
    ]);
    try {
      next = await Wallet.fromEncryptedJson(vault.accounts[pick.index].keystore, pass.value);
    } catch {
      throw new Error('Could not unlock the vault. Check the password and selected account.');
    }
  }
  if (kind === 'new') {
    next = Wallet.createRandom();
    console.log(
      c.yellow(
        '\nWrite this recovery phrase OFFLINE now. It controls this wallet; do not save it in cloud notes:',
      ),
    );
    console.log(c.bold.white(next.mnemonic.phrase));
    const a = await ask([
      {
        type: 'confirm',
        name: 'ok',
        message: 'I have stored the phrase securely offline. Continue?',
        default: false,
      },
    ]);
    if (!a.ok) return;
    const reveal = await ask([
      {
        type: 'confirm',
        name: 'yes',
        message: 'Also show the matching raw 0x private key now? Anyone seeing it can take the funds.',
        default: false,
      },
    ]);
    if (reveal.yes) {
      console.log(c.yellow('\nRAW EVM PRIVATE KEY — equivalent to the recovery phrase for this account:'));
      console.log(c.bold.white(next.privateKey));
      console.log(
        theme.muted(
          'Store only one secure offline backup method when possible. Do not photograph, paste, or share either secret.',
        ),
      );
      await ask([
        {
          type: 'confirm',
          name: 'ok',
          message: 'I have removed this screen from view. Continue?',
          default: false,
        },
      ]);
    }
  }
  wallet = next.connect(provider);
  live('Wallet unlocked locally; no secret was sent to the RPC', 'ok');
  console.log(c.green(`\nUnlocked ${wallet.address}. Secrets remain only in this running process.`));
  await offerProfile(kind);
  await offerEncryptedSave();
  await dashboard();
}
async function offerEncryptedSave() {
  if (!wallet) return;
  const a = await ask([
    {
      type: 'confirm',
      name: 'yes',
      message: 'Save an AES-encrypted local keystore vault? (optional; password required to restore)',
      default: false,
    },
  ]);
  if (!a.yes) return;
  const p = await ask([
    {
      type: 'password',
      name: 'one',
      message: 'New vault password (hidden; 12+ characters):',
      mask: '*',
      validate: (x) => x.length >= 12 || 'Use at least 12 characters.',
    },
    { type: 'password', name: 'two', message: 'Confirm vault password:', mask: '*' },
  ]);
  if (p.one !== p.two) throw new Error('Vault passwords did not match; nothing was saved.');
  live('Encrypting a standard Ethereum V3 keystore locally…');
  const keystore = await wallet.encrypt(p.one);
  let vault = { version: 1, accounts: [] };
  try {
    vault = JSON.parse(await fs.readFile(VAULT, 'utf8'));
  } catch {}
  if (!Array.isArray(vault.accounts)) vault.accounts = [];
  vault.accounts = vault.accounts.filter((x) => x?.address?.toLowerCase() !== wallet.address.toLowerCase());
  vault.accounts.push({
    address: wallet.address,
    label: `Wallet ${vault.accounts.length + 1}`,
    keystore,
    savedAt: new Date().toISOString(),
  });
  await saveVault(vault);
  live('Encrypted vault saved with owner-only permissions', 'ok');
}
async function offerProfile(source) {
  return savePublicProfile(wallet.address, source);
}
async function savePublicProfile(address, source = 'watch') {
  if (config.wallets.some((p) => p.address.toLowerCase() === address.toLowerCase())) return;
  const a = await ask([
    {
      type: 'confirm',
      name: 'yes',
      message: 'Save a local public-only wallet profile? (address and label only; no secret)',
      default: false,
    },
  ]);
  if (!a.yes) return;
  const label = await ask([
    {
      type: 'input',
      name: 'value',
      message: 'Profile label (example: Savings wallet):',
      default: `Wallet ${config.wallets.length + 1}`,
      validate: (x) => safeText(x).length > 0 || 'A label is required.',
    },
  ]);
  config.wallets.push({ label: safeText(label.value), address, source, createdAt: new Date().toISOString() });
  await save();
  console.log(c.green('Public-only profile saved.'));
}
async function manageProfiles() {
  if (!config.wallets.length)
    return console.log(
      c.yellow(
        'No saved profiles. Open a wallet and choose to save its public address, or inspect an address.',
      ),
    );
  const a = await ask([
    {
      type: 'select',
      name: 'index',
      message: 'Saved public wallet profiles:',
      choices: [
        ...config.wallets.map((p, i) => ({ name: `${i + 1}  ${p.label} — ${short(p.address)}`, value: i })),
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (a.index === 'back') return;
  const profile = config.wallets[a.index];
  const action = await ask([
    {
      type: 'select',
      name: 'value',
      message: `${profile.label}:`,
      choices: [
        { name: '1  View public balances', value: 'view' },
        { name: '2  Rename profile', value: 'rename' },
        { name: '3  Delete profile', value: 'delete' },
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (action.value === 'view') await dashboard(profile.address);
  if (action.value === 'rename') {
    const r = await ask([
      {
        type: 'input',
        name: 'label',
        message: 'New label:',
        default: profile.label,
        validate: (x) => safeText(x).length > 0 || 'A label is required.',
      },
    ]);
    profile.label = safeText(r.label);
    await save();
    console.log(c.green('Renamed.'));
  }
  if (action.value === 'delete') {
    const d = await ask([
      {
        type: 'confirm',
        name: 'yes',
        message: `Delete public profile “${profile.label}”? No blockchain funds are affected.`,
        default: false,
      },
    ]);
    if (d.yes) {
      config.wallets.splice(a.index, 1);
      await save();
      console.log(c.green('Profile deleted.'));
    }
  }
}
async function revealSecrets() {
  if (!wallet) return console.log(c.yellow('Open a wallet first.'));
  const a = await ask([
    {
      type: 'select',
      name: 'value',
      message: 'Sensitive export:',
      choices: [
        { name: '1  Show private key on this screen', value: 'key' },
        { name: '2  Show recovery phrase, if available', value: 'phrase' },
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (a.value === 'back') return;
  const confirm = await ask([
    {
      type: 'confirm',
      name: 'yes',
      message: 'Anyone who sees this screen can steal all funds. Show it now?',
      default: false,
    },
  ]);
  if (!confirm.yes) return;
  if (a.value === 'key') console.log(c.yellow(`\nPRIVATE KEY — keep offline:\n${wallet.privateKey}`));
  else if (wallet.mnemonic?.phrase)
    console.log(c.yellow(`\nRECOVERY PHRASE — keep offline:\n${wallet.mnemonic.phrase}`));
  else
    console.log(
      c.yellow(
        'No recovery phrase is available for this session. A raw private key or decrypted keystore does not prove it originated from a BIP-39 phrase.',
      ),
    );
}
async function selectToken(includeBnb = true) {
  const list = includeBnb ? [{ symbol: 'BNB', native: true }, ...tokens()] : tokens();
  const a = await ask([
    {
      type: 'select',
      name: 't',
      message: 'Asset:',
      choices: [
        ...list.map((t, i) => ({
          name: t.native ? 'BNB (native gas token)' : `${t.symbol} — ${short(t.address)}`,
          value: i,
        })),
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (a.t === 'back') return undefined;
  return list[a.t];
}
async function feeChoice() {
  const d = await provider.getFeeData();
  const base = d.gasPrice ?? d.maxFeePerGas ?? parseUnits('3', 'gwei');
  const opts = [
    ['Low', 85n],
    ['Medium (recommended)', 100n],
    ['High', 125n],
  ].map(([name, pct]) => {
    const price = (base * pct) / 100n;
    return { name: `${name}: ${formatUnits(price, 'gwei')} gwei`, value: price };
  });
  opts.push({ name: '← Back', value: undefined });
  const a = await ask([
    { type: 'select', name: 'price', message: 'Network fee speed:', choices: opts, default: 1 },
  ]);
  return a.price;
}
async function send() {
  if (!wallet) return console.log(c.yellow('Import or create a wallet first.'));
  const token = await selectToken();
  if (!token) return;
  const to = await chooseAddress('Recipient address');
  if (!to) return;
  if (to === wallet.address)
    console.log(c.yellow('Warning: recipient is this wallet. This transfer would only spend gas.'));
  const a = await ask([
    {
      type: 'input',
      name: 'amount',
      message: `Amount of ${token.symbol} (example: 0.02; type BACK to return):`,
      validate: (x) => {
        if (/^back$/i.test(x)) return true;
        try {
          return parseUnits(x, token.native ? 18 : token.decimals) > 0n || 'Must be above zero.';
        } catch {
          return 'Enter a plain positive decimal amount, or BACK.';
        }
      },
    },
  ]);
  if (/^back$/i.test(a.amount)) return;
  const amount = parseUnits(a.amount, token.native ? 18 : token.decimals);
  if (token.native) {
    const balance = await provider.getBalance(wallet.address);
    if (balance < amount)
      throw new Error('Insufficient BNB balance for this amount (gas also requires BNB).');
  } else {
    const balance = await new Contract(token.address, ERC20, provider).balanceOf(wallet.address);
    if (balance < amount) throw new Error(`Insufficient ${token.symbol} balance.`);
  }
  const gasPrice = await feeChoice();
  if (gasPrice === undefined) return;
  live('Simulating transfer and calculating a safe gas limit…');
  let tx;
  if (token.native) tx = { to, value: amount, gasPrice, chainId: CHAIN_ID };
  else {
    const contract = new Contract(token.address, ERC20, wallet);
    const estimate = await contract.transfer.estimateGas(to, amount, { gasPrice });
    tx = await contract.transfer.populateTransaction(to, amount);
    tx.gasPrice = gasPrice;
    tx.chainId = CHAIN_ID;
    tx.gasLimit = (estimate * 120n) / 100n;
  }
  // For BEP-20, the contract estimate above is signer-aware. A provider-only
  // estimate has no `from` address and some tokens then simulate msg.sender as 0x0.
  let estimated = tx.gasLimit;
  if (!estimated) {
    estimated = await wallet.estimateGas(tx);
    tx.gasLimit = (estimated * 120n) / 100n;
    estimated = tx.gasLimit;
  }
  const bnbForGas = await provider.getBalance(wallet.address);
  const requiredBnb = (token.native ? amount : 0n) + estimated * gasPrice;
  if (bnbForGas < requiredBnb)
    throw new Error(
      `Insufficient BNB for this transfer and its estimated gas (${formatEther(requiredBnb)} BNB required).`,
    );
  live('Simulation complete; transaction review is ready', 'ok');
  console.log(c.bold(`\nReview: send ${a.amount} ${token.symbol} → ${to}`));
  console.log(
    `Estimated network fee: ~${formatEther(estimated * gasPrice)} BNB (${formatUnits(gasPrice, 'gwei')} gwei)`,
  );
  const yes = await ask([
    { type: 'confirm', name: 'yes', message: 'Broadcast this irreversible transaction?', default: false },
  ]);
  if (!yes.yes) return console.log(c.dim('Cancelled.'));
  let sent;
  try {
    live('Signing locally and broadcasting the reviewed transaction…');
    sent = await wallet.sendTransaction(tx);
  } catch (e) {
    if (/timeout|network|socket/i.test(e.message || ''))
      console.log(
        c.yellow(
          '\nBroadcast result is unknown. Do NOT send again yet: inspect your address on BscScan and check the next transaction nonce.',
        ),
      );
    throw e;
  }
  console.log(c.green(`\nBroadcast: ${sent.hash}\n${EXPLORER}/tx/${sent.hash}`));
  console.log(c.dim('Waiting for one confirmation…'));
  live('Broadcast accepted; waiting for the first block confirmation…');
  const receipt = await sent.wait();
  console.log(
    receipt.status === 1
      ? c.green(`Confirmed in block ${receipt.blockNumber}.`)
      : c.red('Transaction mined but reverted. See explorer.'),
  );
  live(
    receipt.status === 1
      ? `Transaction confirmed in block ${receipt.blockNumber}`
      : 'Transaction was mined but reverted; inspect BscScan',
    receipt.status === 1 ? 'ok' : 'warn',
  );
}
async function addToken() {
  const address = await chooseAddress('BEP-20 contract address');
  if (!address) return;
  const m = await tokenMeta(address);
  console.log(`Found ${c.bold(m.name)} (${m.symbol}), ${m.decimals} decimals.`);
  const a = await ask([{ type: 'confirm', name: 'yes', message: 'Save this token locally?', default: true }]);
  if (a.yes && !tokens().some((t) => t.address.toLowerCase() === m.address.toLowerCase())) {
    config.tokens.push({ ...m, network: config.network });
    await save();
    console.log(c.green('Saved.'));
  }
}
async function manageTokens() {
  const action = await ask([
    {
      type: 'select',
      name: 'value',
      message: 'Custom token manager:',
      choices: [
        { name: '1  Add a verified BEP-20 contract', value: 'add' },
        { name: '2  Review or remove saved custom tokens', value: 'review' },
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (action.value === 'add') return addToken();
  if (action.value !== 'review') return;
  if (!config.tokens.length)
    return console.log(
      c.yellow(
        'No saved custom tokens for this installation. Built-in token-list entries cannot be removed here.',
      ),
    );
  const pick = await ask([
    {
      type: 'select',
      name: 'index',
      message: 'Saved custom tokens:',
      choices: [
        ...config.tokens.map((t, i) => ({ name: `${i + 1}  ${t.symbol} — ${short(t.address)}`, value: i })),
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (pick.index === 'back') return;
  const token = config.tokens[pick.index];
  console.log(`${theme.white(token.name)} · ${token.symbol} · ${token.decimals} decimals\n${token.address}`);
  const remove = await ask([
    {
      type: 'confirm',
      name: 'yes',
      message: `Remove ${token.symbol} from local display? This never affects on-chain assets.`,
      default: false,
    },
  ]);
  if (remove.yes) {
    config.tokens.splice(pick.index, 1);
    await save();
    console.log(c.green('Custom token removed from local display.'));
  }
}
async function inspect() {
  const a = await chooseAddress('Address to inspect');
  if (!a) return;
  await dashboard(a);
  const next = await ask([
    {
      type: 'select',
      name: 'action',
      message: 'Address actions:',
      choices: [
        { name: '1  Show public-address QR', value: 'qr' },
        { name: '2  Save as a public watch profile', value: 'profile' },
        { name: '← Back', value: 'back' },
      ],
    },
  ]);
  if (next.action === 'qr') qrcode.generate(a, { small: true });
  if (next.action === 'profile') await savePublicProfile(a);
}
async function rpcMenu() {
  console.log(`\nCurrent configured RPC: ${rpcDisplay(config.rpc)}`);
  console.log(`Active RPC: ${rpcDisplay(activeRpc)}`);
  const a = await ask([
    {
      type: 'input',
      name: 'rpc',
      message: 'New HTTPS RPC endpoint (Enter/BACK returns; example: https://node.example):',
      validate: (x) =>
        !x.trim() || /^back$/i.test(x) || /^https:\/\//.test(x) || 'Use an HTTPS URL, or BACK.',
    },
  ]);
  if (!a.rpc.trim() || /^back$/i.test(a.rpc)) return;
  const old = config.rpc;
  config.rpc = a.rpc.trim();
  try {
    await connect({ allowFallback: false });
    const persist = await ask([
      {
        type: 'confirm',
        name: 'yes',
        message: 'Save this RPC URL locally? (URLs can contain provider credentials)',
        default: false,
      },
    ]);
    if (persist.yes) {
      await save();
      console.log(c.green(`Connected, confirmed chain ID ${CHAIN_ID}, and saved.`));
    } else console.log(c.green(`Connected and confirmed chain ID ${CHAIN_ID} for this session only.`));
    if (wallet) wallet = wallet.connect(provider);
  } catch (e) {
    config.rpc = old;
    await connect();
    throw e;
  }
}
async function networkMenu() {
  const a = await ask([
    {
      type: 'select',
      name: 'network',
      message: 'BNB Smart Chain network:',
      choices: [
        { name: 'BNB Smart Chain mainnet (chain 56)', value: 'mainnet' },
        { name: 'BNB Smart Chain testnet (chain 97)', value: 'testnet' },
        { name: '← Back', value: 'back' },
      ],
      default: config.network === 'testnet' ? 1 : 0,
    },
  ]);
  if (a.network === 'back' || a.network === config.network) return;
  const old = { network: config.network, rpc: config.rpc };
  applyNetwork(a.network);
  config.rpc = DEFAULT_RPC;
  try {
    await connect({ allowFallback: true });
    if (wallet) wallet = wallet.connect(provider);
    await save();
    live(`Switched to BSC ${config.network}; chain ${CHAIN_ID} verified`, 'ok');
  } catch (e) {
    applyNetwork(old.network);
    config.rpc = old.rpc;
    await connect();
    throw e;
  }
}
async function health() {
  const [n, b] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
  console.log(c.green(`RPC healthy: chain ${n.chainId}, latest block ${b}.`));
}
function guide() {
  console.log(theme.orange('\n━━ SAFE USE GUIDE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(
    theme.white(
      '1. Wallets: Open or import only a wallet you control. A 12-word BIP-39 phrase is accepted; use the shown Ethereum path unless you know yours differs.',
    ),
  );
  console.log(
    theme.white(
      '2. Profiles: profiles save only label + public address. Rename/delete changes local display only, never blockchain funds.',
    ),
  );
  console.log(
    theme.white(
      '3. Assets: verify every custom contract with the issuer or BscScan. A symbol/name alone can be impersonated.',
    ),
  );
  console.log(
    theme.white(
      '4. Send: verify recipient and amount, retain BNB for gas, review the final screen, then broadcast once. A transaction cannot be reversed.',
    ),
  );
  console.log(
    theme.white(
      '5. Timeout: wait and inspect BscScan/your nonce before retrying. A timeout can mean the node lost its response after accepting the transaction.',
    ),
  );
  console.log(
    theme.white(
      '6. Privacy: secrets stay in RAM, but any RPC sees public address requests and your IP. A self-operated BSC node is strongest; a VPN/Tor does not anonymize the public ledger.',
    ),
  );
  console.log(
    theme.white(
      '7. Back: select ← Back in menus or type BACK in address, amount, key, phrase, keystore-path, and RPC fields.',
    ),
  );
  console.log(
    theme.white(
      `8. Project support: Jack Hudson · ${terminalLink('https://github.com/jackh0006', 'github.com/jackh0006')} · jackh109867@gmail.com`,
    ),
  );
  console.log(
    theme.orange(
      'Never share a phrase, private key, or keystore password. The “show secret” feature is only for offline backup you explicitly request.',
    ),
  );
}
function credentialGuide() {
  console.log(theme.orange('\n━━ BSC / BNB WALLET CREDENTIAL GUIDE ━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(
    theme.white(
      'BNB Smart Chain uses standard EVM accounts. There is one underlying credential: a 32-byte secp256k1 private key, normally written as 0x followed by 64 hexadecimal characters. There is no separate “BNB private-key type,” Bitcoin WIF key, or PEM key for a normal BSC wallet.',
    ),
  );
  console.log(
    theme.white(
      '\n1. Raw private key: directly controls one EVM account. Import only the 0x + 64-hex form. Anyone with it can spend that account’s funds.',
    ),
  );
  console.log(
    theme.white(
      "2. BIP-39 recovery phrase: usually 12 or 24 words. It deterministically derives many private keys; the derivation path identifies which account. This app defaults to m/44'/60'/0'/0/0.",
    ),
  );
  console.log(
    theme.white(
      '3. BIP-39 passphrase: optional extra secret used alongside a phrase. It produces a different wallet; losing it makes that wallet unrecoverable. It is not the wallet password.',
    ),
  );
  console.log(
    theme.white(
      '4. Ethereum V3 keystore JSON: an encrypted file containing a private key. It needs its password to decrypt. It is a storage format, not a different blockchain key.',
    ),
  );
  console.log(
    theme.white(
      '5. Hardware wallet signer: the private key remains inside the device and transactions are approved there. Never import that device’s phrase into this app.',
    ),
  );
  console.log(
    theme.orange(
      '\nFor a new wallet, this app can display its phrase and—only if you request it—the matching raw private key. They grant equivalent control over that first derived account. Keep backups offline and never share them.',
    ),
  );
}
async function walletMenu() {
  const a = await ask([
    {
      type: 'select',
      name: 'action',
      message: 'Wallet & portfolio:',
      choices: [
        { name: '1  Open, import, or create wallet', value: 'import' },
        { name: '2  View balances and configured assets', value: 'balance' },
        { name: '3  Show my receive address as QR', value: 'receive' },
        { name: '4  View transaction history (BscScan)', value: 'history' },
        { name: '5  Manage saved public profiles', value: 'profiles' },
        { name: '6  Show private key or recovery phrase', value: 'secrets' },
        { name: '←  Back', value: 'back' },
      ],
    },
  ]);
  if (a.action === 'import') await importWallet();
  else if (a.action === 'balance') await dashboard();
  else if (a.action === 'receive') {
    if (!wallet) console.log(c.yellow('Open a wallet first.'));
    else {
      console.log(c.bold(wallet.address));
      qrcode.generate(wallet.address, { small: true });
    }
  } else if (a.action === 'history') await history();
  else if (a.action === 'profiles') await manageProfiles();
  else if (a.action === 'secrets') await revealSecrets();
}
async function settingsMenu() {
  const a = await ask([
    {
      type: 'select',
      name: 'action',
      message: 'Network & asset settings:',
      choices: [
        { name: '1  Switch BSC mainnet / testnet', value: 'network' },
        { name: '2  Manage custom BEP-20 tokens', value: 'token' },
        { name: '3  Change and verify RPC node', value: 'rpc' },
        { name: '4  Node health check', value: 'health' },
        { name: '←  Back', value: 'back' },
      ],
    },
  ]);
  if (a.action === 'network') await networkMenu();
  else if (a.action === 'token') await manageTokens();
  else if (a.action === 'rpc') await rpcMenu();
  else if (a.action === 'health') await health();
}
async function main() {
  await load();
  try {
    await connect();
  } catch (initialError) {
    header();
    fail(initialError);
    console.log(
      c.yellow(
        '\nYour network could not reach the built-in public RPCs. Add a working HTTPS BSC RPC now, or start with BNB_RPC_URL=https://your-node.example npm start.',
      ),
    );
    const a = await ask([
      {
        type: 'input',
        name: 'rpc',
        message: 'Custom BSC RPC URL:',
        validate: (x) => /^https:\/\//.test(x) || 'Use an HTTPS URL.',
      },
    ]);
    config.rpc = a.rpc.trim();
    await connect({ allowFallback: false });
    const persist = await ask([
      {
        type: 'confirm',
        name: 'yes',
        message: 'Save this RPC URL locally? (URLs can contain provider credentials)',
        default: false,
      },
    ]);
    if (persist.yes) await save();
  }
  while (true) {
    header();
    console.log(theme.muted(` Active node  ${rpcDisplay(activeRpc)}`));
    if (activeRpc !== config.rpc)
      console.log(theme.orange(' Configured node did not respond; using a temporary fallback.'));
    if (wallet) console.log(theme.white(` Unlocked     ${short(wallet.address)}`));
    if (activityFeed.length)
      console.log(
        theme.matrix(` Live activity  ${activityFeed.map((e) => `${e.icon} ${e.message}`).join('  ·  ')}`),
      );
    const a = await ask([
      {
        type: 'select',
        name: 'action',
        message: 'Choose an action:',
        choices: [
          ['1  Wallet & portfolio', 'wallet'],
          ['2  Send BNB or token', 'send'],
          ['3  Inspect any public address', 'inspect'],
          ['4  Network & asset settings', 'settings'],
          ['5  Complete safety & error guide', 'guide'],
          ['6  Lock and exit', 'exit'],
        ].map(([name, value]) => ({ name, value })),
      },
    ]);
    try {
      if (a.action === 'wallet') await walletMenu();
      else if (a.action === 'send') await send();
      else if (a.action === 'inspect') await inspect();
      else if (a.action === 'settings') await settingsMenu();
      else if (a.action === 'guide') guide();
      else {
        wallet = undefined;
        console.log(c.green('Locked. Goodbye.'));
        break;
      }
    } catch (e) {
      fail(e);
    }
    await ask([{ type: 'input', name: 'go', message: 'Press Enter to continue' }]);
  }
}
main().catch((e) => {
  fail(e);
  process.exitCode = 1;
});
