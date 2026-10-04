// Fijado a una version concreta: el soporte de payloads binarios llega en la
// 2.91.0 y en versiones anteriores se descartan en silencio.
const SUPA_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

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

const SEND_TIMEOUT = 12000;

function withTimeout(promise, ms) {
  let timer;
  const guard = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), ms); });
  return Promise.race([
    promise.then(() => 'ok', () => 'error'),
    guard,
  ]).finally(() => clearTimeout(timer));
}

// Acepta ArrayBuffer o cualquier ArrayBufferView.
function toBytes(v) {
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return null;
}

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
  const handlers = { status: [], card: [], state: [], needCards: [] };
  let channel = null;

  async function connect() {
    const c = await getClient();
    channel = c.channel(channelName(), { config: { broadcast: { self: false } } });

    channel.on('broadcast', { event: 'state' }, (msg) => {
      handlers.state.forEach((h) => h(msg.payload));
    });

    // El callback recibe el sobre {type, event, payload}; el binario va dentro.
    channel.on('broadcast', { event: 'card' }, (msg) => {
      try {
        const buf = toBytes(msg && msg.payload);
        if (!buf) throw new Error('payload no binario');
        const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0, true);
        if (4 + len > buf.byteLength) throw new Error('trama incompleta');
        const name = dec.decode(buf.subarray(4, 4 + len));
        const data = buf.subarray(4 + len);
        handlers.card.forEach((h) => h(new Blob([data], { type: 'image/jpeg' }), name));
      } catch (e) {
        console.error('bridge: trama de carta invalida', e);
      }
    });

    // El overlay avisa al entrar para que el panel le reenvie la biblioteca.
    channel.on('broadcast', { event: 'need-cards' }, (msg) => {
      handlers.needCards.forEach((h) => h(msg.payload));
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
    requestCards() {
      if (!channel) return;
      channel.send({ type: 'broadcast', event: 'need-cards', payload: { at: Date.now() } });
    },
    async sendCard(blob, name) {
      if (!channel) return;
      const framed = await frameCard(blob, name);
      const sent = await withTimeout(
        channel.send({ type: 'broadcast', event: 'card', payload: framed.buffer }),
        SEND_TIMEOUT,
      );
      if (sent === 'timeout') {
        throw new Error('el envio de ' + name + ' no respondio');
      }
    },
    onStatus(fn) { handlers.status.push(fn); },
    onCard(fn) { handlers.card.push(fn); },
    onState(fn) { handlers.state.push(fn); },
    onNeedCards(fn) { handlers.needCards.push(fn); },
  };
}

export {
  configured, hasKey, channelName, savedKey, saveKey,
  generateKey, overlayUrl, cfg,
};