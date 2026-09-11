/**
 * NCM (NetEase Cloud Music) encrypted audio decoder.
 *
 * Format (reverse-engineered, verified against ncmdump-net):
 *   [0..7]    magic "CTENFDAM"
 *   [8..9]    2 bytes gap
 *   [10..13]  uint32 LE — key box length
 *   [14..]    key data (each byte XOR 0x64), then AES-128-ECB decrypt
 *             with CoreKey; plaintext = "neteasecloudmusic" + actualKey
 *   ...       uint32 LE — metadata length
 *   ...       metadata bytes (each XOR 0x63) → UTF-8 string
 *             "163 key(Don't modify):" + base64 → AES-128-ECB(ModifyKey)
 *             → "music:" + JSON
 *   ...       skip 5 bytes (CRC32 + gap)
 *   ...       uint32 LE cover frame len, uint32 LE cover data len
 *   ...       cover image bytes, then skip (frameLen - dataLen)
 *   ...       audio payload — RC4-like XOR with 256-byte key box
 *
 * Uses Node built-in crypto only.
 */

import { createDecipheriv } from "node:crypto";

// Keys as raw bytes (from ncmdump-net) to avoid string escaping issues
const CORE_KEY = Buffer.from([0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f, 0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57]); // hzHRAmso5kInbaxW
const MODIFY_KEY = Buffer.from([0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21, 0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28]); // #14ljk_!\]&0U'(
const KEY_XOR_MASK = 0x64;
const META_XOR_MASK = 0x63;
const KEY_PREFIX = "neteasecloudmusic";
const META_PREFIX = "163 key(Don't modify):";
const MUSIC_PREFIX = "music:";

export interface NcmMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  bitrate: number;
  coverUrl: string;
  format: string;
}

export interface NcmDecodeResult {
  audio: Buffer;
  format: string;
  metadata: NcmMetadata;
  cover: Buffer | null;
}

export function isNcm(buffer: Buffer): boolean {
  return buffer.length >= 10 && buffer.toString("ascii", 0, 8) === "CTENFDAM";
}

/** Build the 256-byte RC4-like key box from the decrypted actual key. */
function buildKeyBox(key: Buffer): Buffer {
  const box = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) box[i] = i;
  let last = 0;
  let keyOff = 0;
  for (let i = 0; i < 256; i++) {
    const swap = box[i];
    const c = (swap + last + key[keyOff]) & 0xff;
    keyOff++;
    if (keyOff >= key.length) keyOff = 0;
    box[i] = box[c];
    box[c] = swap;
    last = c;
  }
  return box;
}

/** Decrypt audio payload in place using the key box. */
function decryptAudio(box: Buffer, data: Buffer): Buffer {
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i++) {
    const j = (i + 1) & 0xff;
    out[i] ^= box[(box[j] + box[(box[j] + j) & 0xff]) & 0xff];
  }
  return out;
}

function aesEcbDecrypt(key: Buffer, data: Buffer): Buffer {
  const d = createDecipheriv("aes-128-ecb", key, null);
  d.setAutoPadding(true);
  return Buffer.concat([d.update(data), d.final()]);
}

export function decodeNcm(buffer: Buffer): NcmDecodeResult {
  if (!isNcm(buffer)) throw new Error("not an NCM file (bad magic)");

  let offset = 10; // skip magic(8) + gap(2)

  // ── 1. Key box ──
  const keyLen = buffer.readUInt32LE(offset);
  offset += 4;
  if (keyLen <= 0 || keyLen > 1024) throw new Error(`invalid key length: ${keyLen}`);

  const keyRaw = Buffer.from(buffer.subarray(offset, offset + keyLen));
  offset += keyLen;
  for (let i = 0; i < keyRaw.length; i++) keyRaw[i] ^= KEY_XOR_MASK;

  const keyPlain = aesEcbDecrypt(CORE_KEY, keyRaw);
  const keyPrefixStr = keyPlain.toString("utf8", 0, KEY_PREFIX.length);
  if (keyPrefixStr !== KEY_PREFIX) throw new Error("invalid key prefix after decrypt");
  const actualKey = keyPlain.subarray(KEY_PREFIX.length);
  const keyBox = buildKeyBox(actualKey);

  // ── 2. Metadata ──
  const metaLen = buffer.readUInt32LE(offset);
  offset += 4;
  let metadata: NcmMetadata = {
    title: "Unknown", artist: "Unknown", album: "Unknown",
    duration: 0, bitrate: 0, coverUrl: "", format: "mp3",
  };
  if (metaLen > 0 && metaLen < 1 << 20) {
    const metaRaw = Buffer.from(buffer.subarray(offset, offset + metaLen));
    offset += metaLen;
    for (let i = 0; i < metaRaw.length; i++) metaRaw[i] ^= META_XOR_MASK;
    metadata = parseMetadata(metaRaw.toString("utf8"));
  } else {
    offset += metaLen;
  }

  // ── 3. Cover image ──
  let cover: Buffer | null = null;
  if (offset + 9 <= buffer.length) {
    offset += 5; // skip CRC32 (4) + gap (1)
    const frameLen = buffer.readUInt32LE(offset);
    const dataLen = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (dataLen > 0 && dataLen <= frameLen && offset + dataLen <= buffer.length) {
      cover = Buffer.from(buffer.subarray(offset, offset + dataLen));
    }
    offset += frameLen; // skip entire frame (data + padding)
  }

  // ── 4. Audio ──
  const audioEnc = buffer.subarray(offset);
  const audio = decryptAudio(keyBox, audioEnc);

  // Detect format from decrypted magic
  if (audio.length >= 4) {
    if (audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
      metadata.format = "mp3";
    } else if (audio[0] === 0x66 && audio[1] === 0x4c && audio[2] === 0x61 && audio[3] === 0x43) {
      metadata.format = "flac";
    }
  }

  return { audio, format: metadata.format, metadata, cover };
}

function parseMetadata(metaStr: string): NcmMetadata {
  const defaultMeta: NcmMetadata = {
    title: "Unknown", artist: "Unknown", album: "Unknown",
    duration: 0, bitrate: 0, coverUrl: "", format: "mp3",
  };
  if (!metaStr.startsWith(META_PREFIX)) return defaultMeta;

  try {
    const b64 = metaStr.slice(META_PREFIX.length);
    const encrypted = Buffer.from(b64, "base64");
    const decrypted = aesEcbDecrypt(MODIFY_KEY, encrypted);
    const musicPrefix = decrypted.toString("utf8", 0, MUSIC_PREFIX.length);
    if (musicPrefix !== MUSIC_PREFIX) return defaultMeta;

    const jsonStr = decrypted.subarray(MUSIC_PREFIX.length).toString("utf8");
    const data = JSON.parse(jsonStr);

    const artist = Array.isArray(data.artist)
      ? data.artist.map((a: any) => a?.[0] ?? "").filter(Boolean).join(", ")
      : data.artist ?? "Unknown";

    return {
      title: data.musicName ?? data.name ?? "Unknown",
      artist: artist || "Unknown",
      album: data.album ?? "Unknown",
      duration: Math.round((data.duration ?? 0) / 1000),
      bitrate: data.bitrate ?? 0,
      coverUrl: data.albumPic ?? data.cover ?? "",
      format: data.format ?? (data.bitrate && data.bitrate >= 800000 ? "flac" : "mp3"),
    };
  } catch {
    return defaultMeta;
  }
}
