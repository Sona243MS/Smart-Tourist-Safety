const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple pluggable DID Registry with local anchoring.
// Later, swap the anchor() implementation to write to an EVM chain (Polygon/Ethereum)
// by using environment variables like CHAIN_EVM_RPC, CHAIN_PRIVATE_KEY, CHAIN_REGISTRY_ADDRESS.

const DATA_DIR = path.join(process.cwd(), 'data');
const ANCHOR_PATH = path.join(DATA_DIR, 'did-anchors.json');

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ANCHOR_PATH)) fs.writeFileSync(ANCHOR_PATH, JSON.stringify({ anchors: [] }, null, 2));
}

function load() {
  ensureStore();
  try {
    const raw = fs.readFileSync(ANCHOR_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.anchors || [];
  } catch (e) {
    return [];
  }
}

function persist(anchors) {
  ensureStore();
  fs.writeFileSync(ANCHOR_PATH, JSON.stringify({ anchors }, null, 2));
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Optional EVM config
function getChainConfig() {
  return {
    rpc: process.env.CHAIN_EVM_RPC || null,
    privateKey: process.env.CHAIN_PRIVATE_KEY || null,
    registry: process.env.CHAIN_REGISTRY_ADDRESS || null,
    explorerTxBase: process.env.CHAIN_EXPLORER_TX || null,
    network: process.env.CHAIN_NETWORK || 'local',
  };
}

// Minimal ABI for a registry contract method: anchor(bytes32 digest, string didId)
const REGISTRY_ABI = [
  "function anchor(bytes32 digest, string didId) public returns (bool)"
];

// Public API
// payload: { didId, kycHash, expiresAtISO }
function anchor(payload) {
  const now = new Date().toISOString();
  const digest = sha256Hex(Buffer.from(JSON.stringify(payload)));

  const anchors = load();
  const base = {
    id: crypto.randomUUID(),
    didId: payload.didId,
    payload,
    digest,
    chain: 'local',
    txHash: null,
    explorerTxBase: getChainConfig().explorerTxBase || null,
    status: 'anchored-local',
    createdAt: now,
  };
  let record = { ...base };

  // Try on-chain anchoring if configured
  const cfg = getChainConfig();
  if (cfg.rpc && cfg.privateKey && cfg.registry) {
    try {
      // Lazy require ethers to avoid forcing dependency in environments that don't need it
      const ethers = require('ethers');
      const provider = new ethers.JsonRpcProvider(cfg.rpc);
      const wallet = new ethers.Wallet(cfg.privateKey, provider);
      const contract = new ethers.Contract(cfg.registry, REGISTRY_ABI, wallet);
      // digest to bytes32 (take hex of sha256)
      const digestHex = '0x' + digest;
      // Send tx
      // eslint-disable-next-line no-undef
      const tx = contract.anchor(digestHex, String(payload.didId));
      // Ethers v6 returns a Promise for a transaction response
      // We won't block on confirmations; just store the hash
      // eslint-disable-next-line no-undef
      return Promise.resolve(tx).then((resp) => {
        const txHash = resp?.hash || null;
        record = { ...base, chain: cfg.network || 'evm', txHash, explorerTxBase: cfg.explorerTxBase || null, status: txHash ? 'anchored-onchain' : 'anchored-local' };
        anchors.push(record);
        if (anchors.length > 5000) anchors.splice(0, anchors.length - 4000);
        persist(anchors);
        return record;
      }).catch((_e) => {
        // Fallback to local
        anchors.push(record);
        if (anchors.length > 5000) anchors.splice(0, anchors.length - 4000);
        persist(anchors);
        return record;
      });
    } catch (e) {
      // ethers not available or runtime error; fallback to local
    }
  }

  anchors.push(record);
  // keep bounded
  if (anchors.length > 5000) anchors.splice(0, anchors.length - 4000);
  persist(anchors);
  return record;
}

function listAnchors({ didId } = {}) {
  const anchors = load();
  if (didId) return anchors.filter(a => a.didId === didId);
  return anchors;
}

module.exports = { anchor, listAnchors };
