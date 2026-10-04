const SUPA_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let cfg = {};
try {
  cfg = JSON.parse(document.getElementById('cfg').textContent) || {};
} catch (e) {
  cfg = {};
}

const CDN = cfg.supabaseCdn || SUPA_URL;

const KEY_STORE = 'cc_overlay_key_v1';

function savedKey() {
  try { return String(localStorage.getItem(KEY_STORE) || '').trim(); } catch (e) { return ''; }
}

function saveKey(v) {
  try { localStorage.setItem(KEY_STORE, String(v).trim()); } catch (e) { /* modo privado */ }
}

function hasKey() {
  return channelName().length > 0;
}

function channelName() {
  const hash = new URLSearchParams(location.hash.slice(1)).get('key');
  return String(hash || savedKey() || cfg.overlayKey || '').trim();
}

// Alfabeto sin 0, 1, o, i, l para evitar confusiones al leerla en voz alta.
const KEY_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

function generateKey(len = 24) {
  const n = KEY_ALPHABET.length;
  const limit = 256 - (256 % n); // descarta los ultimos bytes para no sesgar
  const out = [];
  while (out.length < len) {
    const bytes = new Uint8Array(len * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < limit) out.push(KEY_ALPHABET[b % n]);
      if (out.length === len) break;
    }
  }
  return out.join('');
}

const KEY_OK = /^[A-Za-z0-9._=-]+$/;

function validKey(v) {
  return KEY_OK.test(String(v || ''));
}

function overlayUrl(key) {
  const base = new URL('index.html', location.href);
  base.hash = 'key=' + encodeURIComponent(key);
  return base.href;
}

function configured() {
  return !!(cfg.supabaseUrl && cfg.supabaseKey);
}

let client = null;

async function getClient() {
  if (!configured()) throw new Error('Falta configuracion de Supabase');
  if (!client) {
    const mod = await import(CDN);
    client = mod.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  }
  return client;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function frameCard(blob, name) {
  const nameBytes = enc.encode(name);
  const imageBytes = new Uint8Array(await blob.arrayBuffer());
  const buf = new Uint8Array(4 + nameBytes.length + imageBytes.length);
  new DataView(buf.buffer).setUint32(0, nameBytes.length, true);
  buf.set(nameBytes, 4);
  buf.set(imageBytes, 4 + nameBytes.length);
  return buf;
}

export function createBridge() {
  const handlers = { status: [], card: [], state: [] };
  let channel = null;

  async function connect() {
    const c = await getClient();
    channel = c.channel(channelName(), { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'state' }, (msg) => {
      handlers.state.forEach((h) => h(msg.payload));
    });

    channel.on('broadcast', { event: 'card' }, (payload) => {
      const buf = payload instanceof ArrayBuffer ? new Uint8Array(payload) : payload;
      const len = new DataView(buf.buffer, buf.byteOffset).getUint32(0, true);
      const name = dec.decode(buf.subarray(4, 4 + len));
      const data = buf.subarray(4 + len);
      handlers.card.forEach((h) => h(new Blob([data], { type: 'image/jpeg' }), name));
    });

    return new Promise((resolve) => {
      channel.subscribe((status) => {
        handlers.status.forEach((h) => h(status));
        if (status === 'SUBSCRIBED') resolve();
      });
    });
  }

  return {
    connect,
    isConnected: () => !!(channel && channel.state === 'joined'),
    async reload() {
      if (channel && client) await client.removeChannel(channel);
      channel = null;
      return connect();
    },
    sendState(state) {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: 'state', payload: state });
    },
    async sendCard(blob, name) {
      if (!channel) return;
      const framed = await frameCard(blob, name);
      await channel.send({
        type: 'broadcast',
        event: 'card',
        payload: framed.buffer
      });
    },
    onStatus(fn) { handlers.status.push(fn); },
    onCard(fn) { handlers.card.push(fn); },
    onState(fn) { handlers.state.push(fn); }
  };
}

export {
  configured, hasKey, channelName, savedKey, saveKey,
  generateKey, validKey, overlayUrl, cfg,
};