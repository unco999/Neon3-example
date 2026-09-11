import { EventClient, NeonApp, NeonClient, ObservableStore, RenderClient, UiClient } from "@neon3/sdk";
import { inflateSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { caseById, cases } from "./cases/registry.js";
import * as inventoryDomain from "./cases/inventory/domain.js";
import type { InventoryState } from "./cases/inventory/domain.js";
import * as shopDomain from "./cases/shop/domain.js";
import type { ShopState } from "./cases/shop/domain.js";
import { pulseShaderPackages } from "./cases/music-player/shaders.js";
import { flow as musicPlayerFlow, type FlowTrack } from "./cases/music-player/flow.js";
import { scanMusicDir, uploadCoverImage, type ScannedTrack } from "./cases/music-player/music-scanner.js";
import { AudioPlayer, type DecodedAudio, type TrackMeta } from "./cases/music-player/audio-engine.js";

/**
 * FNV-1a 32-bit hash - matches the constant used in WGSL shader event IDs.
 */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Subscribe to a named GPU shader event. Runtime publishes shader.event
 * to eventd when a material calls emit_shader_event(id, payload).
 */
async function onShaderEvent(
  app: NeonApp,
  eventName: string,
  callback: (payload: number[]) => void,
): Promise<void> {
  const targetId = fnv1a32(eventName);
  // Use external_host kind — the local runtime rejects SDK-default app_host
  // for event subscriptions (same reason ui/render clients are rebranded).
  const eventdEndpoint = (app.events as unknown as { endpoint?: string } | null)?.endpoint
    ?? "127.0.0.1:39101";
  const eventClient = new EventClient(eventdEndpoint, {
    origin: "neon3-case-shader-events",
    kind: "external_host",
  });
  const sub = await eventClient.subscribe({ name: "shader.event" });
  console.log("[shader-event] subscribed to " + eventName + " (id=" + targetId + ")");
  (async () => {
    // typedEvents defaults to a 10s recv timeout; pass a long horizon so the
    // subscription stays alive across idle frames. The runtime only publishes
    // shader.event when a material actually emits, so gaps are normal.
    for await (const env of sub.typedEvents("shader.event", 86400000)) {
      const p = env.payload as { event_id: number; payload: number[] };
      if (p && p.event_id === targetId) {
        callback(p.payload ?? []);
      }
    }
  })().catch((error) => console.warn("[shader-event] subscription error:", error));
}



const caseId = process.argv[2] ?? "inventory";
const def = caseById(caseId);

if (!def) {
  console.error(`Unknown case: ${caseId}`);
  console.error(`Available cases: ${cases().map((item) => item.id).join(", ")}`);
  process.exit(2);
}

const state = def.initialState() as Record<string, unknown>;
const store = new ObservableStore({ enabled: true });
// Use the locally fixed Neon3 v0.2.5 runtime by default. Set NEON_ROOT to a
// different runtime root when testing an installed release; the SDK expects
// target/release/*.exe below that root.
const runtimeVersion = process.env.NEON3_RUNTIME_VERSION ?? "v0.2.5";
const neonRoot = process.env.NEON_ROOT
  ?? (runtimeVersion === "v0.2.5" ? "D:\\Neon3" : undefined)
  ?? (runtimeVersion === "latest"
    ? undefined
    : `${process.env.LOCALAPPDATA ?? ""}\\Neon3Sdk\\runtime\\${runtimeVersion}`);
const portOffset = Number.parseInt(process.env.NEON3_PORT_OFFSET ?? "0", 10);
const endpoint = (port: number) => `127.0.0.1:${port + (Number.isFinite(portOffset) ? portOffset : 0)}`;
const externalServices = process.env.NEON3_EXTERNAL === "1";
if (process.env.NEON3_WINDOW_CHROME === "borderless") process.env.NEON_WINDOW_CHROME = "borderless";

function publishState(next: Record<string, unknown>) {
  for (const [key, value] of Object.entries(next)) {
    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
      store.value(key).set(value);
    }
  }
}

function unwrapPayload(payload: Record<string, any> = {}) {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value?.value ?? value]));
}

function decodePngRgba(bytes: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!bytes.subarray(0, 8).equals(signature)) throw new Error("asset is not a PNG");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset); offset += 4;
    const type = bytes.toString("ascii", offset, offset + 4); offset += 4;
    const data = bytes.subarray(offset, offset + length); offset += length + 4;
    if (type === "IHDR") {
      width = bytes.readUInt32BE(offset - length - 4);
      height = bytes.readUInt32BE(offset - length);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error("asset PNG must be 8-bit RGB/RGBA");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const rows = Buffer.alloc(height * stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source++];
    const row = rows.subarray(y * stride, (y + 1) * stride);
    const previous = y === 0 ? undefined : rows.subarray((y - 1) * stride, y * stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous?.[x] ?? 0;
      const upperLeft = x >= channels ? (previous?.[x - channels] ?? 0) : 0;
      const value = raw[source++];
      if (![0, 1, 2, 3, 4].includes(filter)) throw new Error(`unsupported PNG filter ${filter}`);
      const paeth = left + up - upperLeft;
      const predictor = filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : filter === 4
        ? (Math.abs(paeth - left) <= Math.abs(paeth - up) && Math.abs(paeth - left) <= Math.abs(paeth - upperLeft) ? left : Math.abs(paeth - up) <= Math.abs(paeth - upperLeft) ? up : upperLeft)
        : 0;
      row[x] = (value + predictor) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < rows.length; i += channels, p += 4) {
    rgba[p] = rows[i]; rgba[p + 1] = rows[i + 1]; rgba[p + 2] = rows[i + 2]; rgba[p + 3] = channels === 4 ? rows[i + 3] : 255;
  }
  return { width, height, bytes: [...rgba] };
}

async function uploadInventoryAssets(app: NeonApp) {
  const assets = { slot: "UI_Slot_Selected.png", apple: "Icon_Consumable_Apple.png", hammer: "Icon_Tool_RepairHammer.png" };
  const assetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "assets");
  for (const [imageId, filename] of Object.entries(assets)) {
    const path = resolve(assetsRoot, filename);
    const source = decodePngRgba(await readFile(path));
    const response = await app.client.call("ui-runtime", "ui.image.upload", { source: { image_id: imageId, media_type: "application/x-neon-rgba8", ...source } }, { raiseForStatus: false, idempotencyKey: `inventory-asset-${imageId}` });
    if (response.status !== "accepted") throw new Error(`asset upload rejected: ${imageId}: ${JSON.stringify(response.error)}`);
  }
}

async function uploadMusicAssets(app: NeonApp) {
  const assets = {
    "album-purple": "album-purple-small.png", "album-gold": "album-gold-small.png",
    "album-hero": "album-hero-small.png", "album-hero-green": "album-hero-green.png", "album-architecture": "album-architecture-small.png",
    "pulse-control": "pulse-control.png", "pulse-control-hover": "pulse-control-hover.png",
    "pulse-slider-track": "pulse-slider-track.png", "pulse-slider-fill": "pulse-slider-fill.png",
    "pulse-slider-thumb": "pulse-slider-thumb.png", "icon-menu": "icon-menu.png", "icon-heart": "icon-heart.png",
    "icon-previous": "icon-previous.png", "icon-play": "icon-play.png", "icon-pause": "icon-pause.png", "icon-next": "icon-next.png",
    "icon-shuffle": "icon-shuffle.png", "icon-repeat": "icon-repeat.png", "icon-volume": "icon-volume.png", "icon-queue": "icon-queue.png", "icon-equalizer": "icon-equalizer.png",
    "icon-home": "icon-home.png", "icon-settings": "icon-settings.png",
  };
  const assetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "assets", "music-player");
  for (const [imageId, filename] of Object.entries(assets)) {
    const source = decodePngRgba(await readFile(resolve(assetsRoot, filename)));
    console.log(`[asset] uploading ${imageId} (${source.width}x${source.height})`);
    const response = await app.client.call("ui-runtime", "ui.image.upload", { source: { image_id: imageId, media_type: "application/x-neon-rgba8", ...source } }, { raiseForStatus: false, idempotencyKey: `music-player-asset-${imageId}-v2` });
    console.log(`[asset] ${imageId}: ${response.status}`);
    if (response.status !== "accepted") throw new Error(`asset upload rejected: ${imageId}: ${JSON.stringify(response.error)}`);
  }
}

const frame = (value: unknown) => {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
};

async function startDomainHost(app: NeonApp, port: number) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", async (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length < 4) return;
      const size = buffer.readUInt32BE(0);
      if (buffer.length < size + 4) return;
      const request = JSON.parse(buffer.subarray(4, size + 4).toString("utf8"));
      const id = request.request_id;
      let response: unknown;
      if (request.method === "service.health") {
        response = { request_id: id, status: "accepted", revision: null, result: { service: "neon3-case-domain", status: "healthy", epoch: 1 }, snapshot: null, error: null };
      } else if (request.method === "service.describe") {
        response = { request_id: id, status: "accepted", revision: null, result: { service: "neon3-case-domain", endpoint: `127.0.0.1:${port}`, epoch: 1, capabilities: ["ui.host.publication.v1"] }, snapshot: null, error: null };
      } else if (request.method === "ui.host.inbound") {
        try {
          const semantic = request.params?.event;
          if (request.params?.kind === "semantic_intent" && typeof semantic?.committed_text?.value === "string") {
            semantic.payload ??= {};
            semantic.payload.text ??= { kind: "enum", value: semantic.committed_text.value };
          }
          const outcome = await app.handleInbound(request.params);
          // UiRuntime forwards host requests with a derived request id
          // (`<client-request>-host`). The response must echo that outer RPC
          // id, while the semantic event id remains inside the publication.
          response = { ...outcome.response, request_id: id };
        } catch (error) {
          response = { request_id: id, status: "rejected", revision: null, result: null, snapshot: null, error: { code: "domain_rejected", message: String(error) } };
        }
      } else {
        response = { request_id: id, status: "rejected", revision: null, result: null, snapshot: null, error: { code: "unsupported_method", message: "method is not supported" } };
      }
      socket.end(frame(response));
    });
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  return server;
}

function visualFlow(source: string, id: string, value: any) {
  if (id === "shop") {
    return source.replace(/(text shop-gold value )"[^"]*"/, `$1"${value.gold}"`);
  }
  if (id === "skill-tree") {
    let next = source.replace(/(text skilltree-points value )"[^"]*"/, `$1"${value.points}"`);
    const max: Record<string, number> = { sword_mastery: 3, whirlwind: 1, shield_wall: 1, frost_bolt: 3, blizzard: 1, haste: 2 };
    for (const [key, limit] of Object.entries(max)) {
      next = next.replace(new RegExp(`(text skill-rank-${key} value )"[^"]*"`), `$1"${value.learned?.[key] ?? 0} / ${limit}"`);
    }
    return next;
  }
  if (id === "character") {
    let next = source
      .replace(/(text character-level value )"[^"]*"/, `$1"${value.level}"`)
      .replace(/(text character-points value )"[^"]*"/, `$1"${value.unspent_points}"`);
    for (const key of ["strength", "agility", "intellect", "vitality"]) {
      const base = value.base?.[key] ?? 0;
      const equip = value.equipment_bonus?.[key] ?? 0;
      const total = base + equip + (value.invested?.[key] ?? 0);
      next = next
        .replace(new RegExp(`(text stat-base-${key} value )"[^"]*"`), `$1"${base}"`)
        .replace(new RegExp(`(text stat-equip-${key} value )"[^"]*"`), `$1"${equip}"`)
        .replace(new RegExp(`(text stat-total-${key} value )"[^"]*"`), `$1"${total}"`);
    }
    return next;
  }
  if (id === "quest-log") {
    return source.replace(/(text questlog-gold value )"[^"]*"/, `$1"${value.gold}"`);
  }
  if (id === "equipment") {
    let next = source.replace(/(text equipment-power value )"[^"]*"/, `$1"${Object.values(value.slots ?? {}).reduce((sum: number, item: any) => sum + (value.bag?.find((entry: any) => entry.key === item)?.power ?? 0), 0)}"`);
    for (const key of ["head", "chest", "weapon", "offhand", "legs"]) {
      const itemKey = value.slots?.[key];
      const item = value.bag?.find((entry: any) => entry.key === itemKey);
      next = next.replace(new RegExp(`(text equip-slot-item-${key} value )"[^"]*"`), `$1"${item?.name ?? "空"}"`);
    }
    return next;
  }
  if (id === "crafting") {
    const materials = value.materials ?? {};
    return source
      .replace(/(text crafting-limit value )"[^"]*"/, `$1"${value.crafts_remaining}"`)
      .replace(/(text mats-line-label value )"[^"]*"/, `$1"草药 ${materials.herb ?? 0} 水 ${materials.water ?? 0} 铁矿 ${materials.iron_ore ?? 0} 煤 ${materials.coal ?? 0} 木 ${materials.wood ?? 0} 铁锭 ${materials.iron_ingot ?? 0}"`)
      .replace(/(text crafting-health-potion value )"[^"]*"/, `$1"${value.output?.health_potion ?? 0}"`)
      .replace(/(text crafting-steel-sword value )"[^"]*"/, `$1"${value.output?.steel_sword ?? 0}"`);
  }
  if (id === "party") {
    let next = source.replace(/(text party-size value )"[^"]*"/, `$1"${value.members?.length ?? 0}"`);
    for (let index = 1; index <= 4; index += 1) {
      const member = value.members?.[index - 1];
      next = next
        .replace(new RegExp(`(text member-name-p${index} value )"[^"]*"`), `$1"${member?.name ?? "空"}"`)
        .replace(new RegExp(`(text member-class-p${index} value )"[^"]*"`), `$1"${member?.class_name ?? "empty"}"`);
    }
    return next;
  }
  if (id === "settings") {
    let next = source;
    for (const key of ["gamma", "mouse_sensitivity", "resolution", "language"]) {
      next = next.replace(new RegExp(`(text setting-value-${key} value )"[^"]*"`), `$1"${value.values?.[key]}"`);
    }
    return next;
  }
  if (id === "chat") {
    let next = source.replace(/(text chat-sample-count value )"[^"]*"/, `$1"${value.messages?.length ?? 0}"`);
    for (const key of ["world", "party", "whisper"]) {
      const count = value.messages?.filter((message: any) => message.channel === key).length ?? 0;
      next = next.replace(new RegExp(`(text chat-${key}-count value )"[^"]*"`), `$1"${count}"`);
    }
    return next;
  }
  if (id === "music-player") {
    const track = value.tracks?.find((item: any) => item.key === value.current_track) ?? value.tracks?.[0];
    const cover = track?.cover ?? "album-hero";
    const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    let result = source
      .replace(/(input position i32:0\.\.)\d+( default )\d+/, `$1${Math.max(1, Math.floor(track?.duration ?? value.duration ?? 600))}$2${Math.floor(value.position ?? 0)}`)
      .replace(/(input duration i32:1\.\.)\d+( default )\d+/, `$1${Math.max(1, Math.floor(track?.duration ?? value.duration ?? 600))}$2${Math.max(1, Math.floor(track?.duration ?? value.duration ?? 600))}`)
      .replace(/(input is_playing bool default )\w+/, `$1${value.is_playing ? "true" : "false"}`)
      .replace(/(input is_paused bool default )\w+/, `$1${value.is_paused ? "true" : "false"}`)
      .replace(/(input current_track enum:[^ ]+ default )\S+/, `$1${value.current_track ?? "track-0"}`)
      .replace(/(input enabled bool default )\w+/, `$1${value.enabled ? "true" : "true"}`);
    for (const t of (value.tracks ?? [])) {
      const safeKey = t.key.replace(/-/g, "_");
      result = result.replace(new RegExp(`(input pl_active_${safeKey} bool default )\\w+`), `$1${t.key === value.current_track ? "true" : "false"}`);
    }
    return result
      .replace(/(image now-art resource )[^\s]+/, `$1${cover}`)
      .replace(/(image mini-art resource )[^\s]+/, `$1${cover}`)
      .replace(/(text now-title value )"[^"]*"/, `$1"${track?.title ?? ""}"`)
      .replace(/(text now-artist value )"[^"]*"/, `$1"${track?.artist ?? ""}"`)
      .replace(/(text now-album value )"[^"]*"/, `$1"${track?.album ?? ""}"`)
      .replace(/(text elapsed value )"[^"]*"/, `$1"${formatTime(value.position ?? 0)}"`)
      .replace(/(text total value )"[^"]*"/, `$1"${formatTime(track?.duration ?? value.duration ?? 0)}"`)
      .replace(/(text mini-title value )"[^"]*"/, `$1"${track?.title ?? ""}"`)
      .replace(/(text mini-artist value )"[^"]*"/, `$1"${track?.artist ?? ""}"`)
      .replace(/(text volume-value value )"[^"]*"/, `$1"${value.volume ?? 0}"`)
      .replace(/(text player-status value )"[^"]*"/, `$1"${value.is_playing ? "PLAYING" : "READY"}"`);
  }
  return source;
}

function visualInputChanges(id: string, value: any) {
  if (id === "character") {
    const changes: any[] = [
      { key: "level", value: { kind: "i32", value: value.level } },
      { key: "unspent_points", value: { kind: "i32", value: value.unspent_points } },
    ];
    for (const key of ["strength", "agility", "intellect", "vitality"]) {
      const base = value.base?.[key] ?? 0;
      const equip = value.equipment_bonus?.[key] ?? 0;
      changes.push({ key: `${key}_base`, value: { kind: "i32", value: base } });
      changes.push({ key: `${key}_equip`, value: { kind: "i32", value: equip } });
      changes.push({ key: `${key}_total`, value: { kind: "i32", value: base + equip + (value.invested?.[key] ?? 0) } });
    }
    return changes;
  }
  if (id !== "skill-tree") return [];
  const max: Record<string, number> = { sword_mastery: 3, whirlwind: 1, shield_wall: 1, frost_bolt: 3, blizzard: 1, haste: 2 };
  const changes: any[] = [{ key: "points", value: { kind: "i32", value: value.points } }];
  for (const [key, limit] of Object.entries(max)) {
    const rank = value.learned?.[key] ?? 0;
    const prereqs: Record<string, string[]> = { sword_mastery: [], whirlwind: ["sword_mastery"], shield_wall: ["sword_mastery"], frost_bolt: [], blizzard: ["frost_bolt"], haste: [] };
    const costs: Record<string, number> = { sword_mastery: 1, whirlwind: 2, shield_wall: 2, frost_bolt: 1, blizzard: 3, haste: 1 };
    changes.push({ key: `${key}_rank`, value: { kind: "i32", value: rank } });
    changes.push({ key: `${key}_can`, value: { kind: "bool", value: value.points >= costs[key] && rank < limit && prereqs[key].every((p) => (value.learned?.[p] ?? 0) > 0) } });
  }
  return changes;
}

function declaredInputChanges(source: string, changes: any[]) {
  const allowed = new Set([...source.matchAll(/^input\s+([A-Za-z0-9_]+)\s+/gm)].map((match) => match[1]));
  return changes.filter((change) => allowed.has(change.key));
}

// A Flow submission resets scalar inputs to its declared defaults. Re-publish
// every current declared input after a visual re-submit, not only the diff.
function currentDeclaredInputChanges(source: string, store: any) {
  const keys = [...source.matchAll(/^input\s+([A-Za-z0-9_]+)\s+/gm)].map((match) => match[1]);
  return keys.map((key) => {
    const value = store.value(key).current;
    return value ? { key, value } : null;
  }).filter(Boolean);
}

const app = await NeonApp.start({
  mode: "windowed",
  origin: `neon3-case-${def.id}`,
  store,
  external: externalServices,
  runtimeVersion,
  profile: process.env.NEON_PROFILE === "debug"
    ? "debug"
    : process.env.NEON_PROFILE === "release" ? "release" : "auto",
  eventd: endpoint(39101),
  ui: endpoint(39102),
  wgpu: endpoint(39103),
  domain: endpoint(39104),
  ...(caseId === "music-player" ? {
    windowBackdrop: {
      kind: "acrylic" as const,
      blurAmount: Number(process.env.NEON_BLUR_AMOUNT ?? "8"),
      tint: process.env.NEON_BACKDROP_TINT ?? "#000000",
      tintOpacity: Number(process.env.NEON_BACKDROP_TINT_OPACITY ?? "0.28"),
    },
  } : {}),
  ...(neonRoot ? { neonRoot } : {}),
});

// Neon3 v0.2.5 removed the SDK-only `app_host` client kind. Replace the
// wrapper client for this local visual entry point with the public
// `external_host` protocol identity before the first RPC.
// Use the protocol-compatible identity for both direct and external launches.
// The local v0.2.5 UI runtime rejects the SDK-only `app_host` enum before the
// first Flow request, so the visual entry point must replace the wrapper client
// before any UI RPC is sent.
{
  app.client = new NeonClient(endpoint(39102), {
    origin: `neon3-case-${def.id}`,
    kind: "external_host",
  });
  (app.ui.session as unknown as { ui: UiClient }).ui = new UiClient(app.client);

  // Also rebuild the render (wgpu) client. The SDK default app_host kind is
  // rejected by v0.2.5 for wgpu.shader.register, so shader packages would
  // silently fall back to standard_ui without this.
  const renderClient = new NeonClient(endpoint(39103), {
    origin: `neon3-case-${def.id}-render`,
    kind: "external_host",
  });
  app.render = new RenderClient(renderClient, "wgpu-runtime", renderClient);
}

publishState(state);

const domainServer = await startDomainHost(app, 39104 + (Number.isFinite(portOffset) ? portOffset : 0));

if (def.id === "inventory") {
  const inventoryState = state as unknown as InventoryState;
  const items = store.collection("items");
  items.setKeyOf((item: any) => item.key);
  items.replace(inventoryState.items);
  items.markApplied();
  const selection = store.selection("items");
  const publishSlots = () => {
    for (const item of ["apple", "hammer"]) {
      const current = items.items.find((entry: any) => entry.key === item)?.slot_key;
      for (let slot = 1; slot <= 24; slot += 1) store.value(`${item}_in_slot_${slot.toString().padStart(2, "0")}`).set(current === `slot-${slot.toString().padStart(2, "0")}`);
    }
  };
  publishSlots();
  const syncInventory = () => {
    store.value("capacity").set(inventoryState.capacity);
    store.value("selected_item").set(inventoryState.selected ?? "apple");
    store.value("row_5_visible").set(inventoryState.capacity !== "small");
    store.value("row_6_visible").set(inventoryState.capacity === "large");
    for (const item of ["apple", "hammer"]) {
      const current = inventoryState.items.find((entry) => entry.key === item)?.slot_key;
      for (let slot = 1; slot <= 24; slot += 1) store.value(`${item}_in_slot_${slot.toString().padStart(2, "0")}`).set(current === `slot-${slot.toString().padStart(2, "0")}`);
    }
  };
  app.intent("inventory.item.select")((event: any) => {
    const id = String(event.payload.item_id?.value ?? event.payload.item_id);
    Object.assign(inventoryState, inventoryDomain.select(inventoryState, id));
    selection.set(id); syncInventory();
    return { status: "accepted", state: inventoryDomain.stateOf(inventoryState) };
  });
  app.intent("inventory.capacity.expand")(() => {
    Object.assign(inventoryState, inventoryDomain.expandCapacity(inventoryState));
    syncInventory();
    return { status: "accepted", state: inventoryDomain.stateOf(inventoryState) };
  });
  app.intent("inventory.capacity.collapse")(() => {
    Object.assign(inventoryState, inventoryDomain.collapseCapacity(inventoryState));
    syncInventory();
    return { status: "accepted", state: inventoryDomain.stateOf(inventoryState) };
  });
  app.intent("inventory.item.move")(async (event: any) => {
    const payload = Object.fromEntries(Object.entries(event.payload).map(([key, value]: any) => [key, value?.value ?? value]));
    const item = inventoryState.items.find((entry) => entry.key === String(payload.item_id));
    // Renderer-resolved drag/drop carries source_key/target_key in its wire
    // payload. The Python host fills these domain fields before applying the
    // move; do the same here so a real drop is not treated as an incomplete
    // semantic intent.
    payload.source_slot ??= item?.slot_key;
    payload.target_slot ??= event.target_key;
    Object.assign(inventoryState, inventoryDomain.moveItems(inventoryState, String(payload.item_id), String(payload.source_slot), String(payload.target_slot)));
    items.replace(inventoryState.items); items.markApplied(); syncInventory();
    refreshDragCatalog();
    return { status: "accepted", state: inventoryDomain.stateOf(inventoryState) };
  });
  for (let slot = 1; slot <= 24; slot += 1) app.ui.dropTarget(`slot-${slot.toString().padStart(2, "0")}`, "inventory.item.move", ["consumable-drag", "tool-drag"]);
  for (const item of ["apple", "hammer"] as const) for (let slot = 1; slot <= 24; slot += 1) {
    const slotKey = `slot-${slot.toString().padStart(2, "0")}`;
    const nodeKey = `${item}-icon-${slot.toString().padStart(2, "0")}`;
    app.ui.dragSource(nodeKey, {
      payload: () => ({ item_id: item, source_slot: slotKey, kind: item === "apple" ? "consumable-drag" : "tool-drag" }),
      kindOf: () => item === "apple" ? "consumable-drag" : "tool-drag",
    });
  }
  const refreshDragCatalog = () => {
    const catalog: Record<string, InventoryState["items"][number]> = {};
    for (const item of inventoryState.items) {
      if (!item.slot_key) continue;
      catalog[`${item.key}-icon-${item.slot_key.slice(5)}`] = item;
      catalog[`${item.key}-drag-${item.slot_key.slice(5)}`] = item;
    }
    app.router.setCatalogMap(catalog);
  };
  refreshDragCatalog();
} else if (def.wire) {
  // Use the same per-case domain projection as the headless runner. The
  // visual entry must publish the case's scalar inputs and derive event
  // payloads from stable node keys; registering only empty app.intent handlers
  // makes the window look static and causes button events to fail validation.
  await def.wire({
    session: app.session,
    store,
    router: app.router,
    capabilities: {} as any,
    onStateChanged: (next) => {
      // The v0.2.5 contract renders literal text and typed inputs separately.
      // Re-submit the same surface after a domain mutation so shop totals and
      // sold-out branches are visible immediately; this is deferred until the
      // domain RPC has returned to avoid re-entering the UI forwarder.
      if (def.id !== "inventory") {
        const changes = currentDeclaredInputChanges(def.flow(), store);
        setTimeout(() => void app.ui.mountFlow(visualFlow(def.flow(), def.id, next), { validate: false })
          .then(() => app.ui.publish(changes))
          .then(() => store.markApplied())
          .catch(() => undefined), 0);
      }
    },
  });
}

if (def.id === "shop") {
  const shopState = state as unknown as ShopState;
  const syncShop = () => {
    store.value("gold").set(shopState.gold);
    for (const item of shopState.items) {
      store.value(`stock_${item.key}_ok`).set(item.stock > 0);
      store.value(`stock_${item.key}_out`).set(item.stock <= 0);
    }
  };
  const refreshShop = () => {
    syncShop();
    const changes = currentDeclaredInputChanges(def.flow(), store);
    setTimeout(() => void app.ui.mountFlow(visualFlow(def.flow(), def.id, shopState), { validate: false })
      .then(() => app.ui.publish(changes))
      .then(() => store.markApplied())
      .catch(() => undefined), 0);
  };
  const itemFromSource = (event: any) => String(event.source_node_key ?? "").replace(/^(?:buy|sell)-/, "");
  app.router.on("shop.item.buy", (event: any) => {
    Object.assign(shopState, shopDomain.buy(shopState, itemFromSource(event), 1));
    refreshShop();
    return { status: "accepted", state: shopDomain.stateOf(shopState) };
  });
  app.router.on("shop.item.sell", (event: any) => {
    Object.assign(shopState, shopDomain.sell(shopState, itemFromSource(event), 1));
    refreshShop();
    return { status: "accepted", state: shopDomain.stateOf(shopState) };
  });
  app.router.on("shop.restock", () => {
    Object.assign(shopState, shopDomain.restock(shopState));
    refreshShop();
    return { status: "accepted", state: shopDomain.stateOf(shopState) };
  });
  syncShop();
}

if (def.id === "inventory") await uploadInventoryAssets(app);
if (def.id === "music-player") await uploadMusicAssets(app);

// Register custom shader packages BEFORE mountFlow so the materials are
// available when the Flow references them.
if (def.id === "music-player") {
  // Register custom shaders via wgpu RPC
  const wgpuShaderClient = new NeonClient(endpoint(39103), {
    origin: `neon3-case-${def.id}-shader`,
    kind: "external_host",
  });
  for (const pkg of pulseShaderPackages()) {
    const result = await wgpuShaderClient.call("wgpu-runtime", "wgpu.shader.register", { package: pkg }, { raiseForStatus: false });
    console.log(`[shader-register] ${pkg.package_id} v${pkg.version}:`, JSON.stringify(result));
  }
  const shaderState = await wgpuShaderClient.call("wgpu-runtime", "wgpu.shader.state", {}, { raiseForStatus: false });
  console.log("[shader-state]", JSON.stringify(shaderState));

  // === Scan music directory and build dynamic playlist ===
  const musicDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "assets", "music-player");
  const scanned: ScannedTrack[] = await scanMusicDir(musicDir);
  console.log(`[playlist] scanned ${scanned.length} track(s) from ${musicDir}`);
  const flowTracks: FlowTrack[] = scanned.map((t) => ({
    key: t.key, title: t.title, artist: t.artist, album: t.album,
    duration: t.duration, cover: t.cover, liked: t.liked,
  }));
  // Mutate domain state with real tracks
  (state as any).tracks = flowTracks;
  (state as any).current_track = flowTracks[0]?.key ?? "";
  store.value("current_track").set(flowTracks[0]?.key ?? "");
  // Override flow to use dynamic playlist
  (def as any).flow = () => musicPlayerFlow(flowTracks);

  // === Audio Engine ===
  const audioPlayer = new AudioPlayer();

  // === Track load caching + race protection ===
  let loadToken = 0;
  const audioCache = new Map<string, { audio: DecodedAudio; meta: TrackMeta }>();
  const coverUploaded = new Set<string>();

  // mountFlow resets ALL flow inputs to their DSL defaults. This helper
  // re-publishes every current store value after mount so state (show_splash,
  // is_playing, current_track, active_view, …) survives re-mounts.
  const PERSISTED_INPUTS = [
    "active_view", "current_track", "is_playing", "is_paused", "position",
    "duration", "volume", "shuffle", "repeat", "enabled", "_anim_tick",
    "app_view", "show_splash", "show_transition", "player_visible",
    "playlist_visible", "page_transition",
    ...flowTracks.map((t) => `pl_active_${t.key.replace(/-/g, "_")}`),
  ];
  const mountFlowSafe = async (extra?: Record<string, unknown>) => {
    if (extra) Object.assign(state, extra);
    await app.ui.mountFlow(visualFlow(def.flow(), def.id, state), { validate: false });
    for (const k of PERSISTED_INPUTS) {
      try {
        const s = store.value(k) as any;
        if (s.current !== null) {
          // ScalarStore.set() no-ops when the wire value is unchanged, so a
          // plain get→set leaves dirty=false. The freshly-mounted flow has its
          // inputs reset to DSL defaults; force dirty so every persisted value
          // is re-published and survives the re-mount.
          s.dirty = true;
          (store as any).dirtyScalars.add(k);
        }
      } catch { /* input not declared in this flow variant */ }
    }
    const changes = declaredInputChanges(def.flow(), store.changedScalars());
    if (changes.length > 0) await app.ui.publish(changes);
    store.markApplied();
  };

  // Load a track by key: decode file, extract metadata + cover, upload cover, update UI
  let isLoading = false;
  const loadAndPlayTrack = async (key: string, autoplay: boolean = true) => {
    const track = scanned.find((t) => t.key === key);
    if (!track) { console.warn(`[audio] track not found: ${key}`); return; }
    // Skip if this track is already loaded and playing (prevents double-load from double-fired events)
    if (audioPlayer.isPlaying && (state as any).current_track === key) {
      console.log(`[audio] skip reload of current track: ${key}`);
      return;
    }
    if (isLoading) { console.log(`[audio] skip ${key}: another load in progress`); return; }
    isLoading = true;
    const t0 = Date.now();
    const myToken = ++loadToken;
    const isStale = () => loadToken !== myToken;
    try {
      const ft = flowTracks.find((t) => t.key === key);
      let needRemount = false;

      // Decode (cached: only first load hits ffmpeg, restores PCM instantly)
      const cached = audioCache.get(key);
      console.log(`[audio] load ${key} cached=${!!cached} playing=${audioPlayer.isPlaying} current=${(state as any).current_track}`);
      if (cached) {
        audioPlayer.loadFromCache(cached.audio, cached.meta);
      } else {
        await audioPlayer.loadFile(track.path);
        if (isStale()) return;
        if (audioPlayer.decodedAudio && audioPlayer.trackMeta) {
          audioCache.set(key, { audio: audioPlayer.decodedAudio, meta: audioPlayer.trackMeta });
        }
      }
      const meta = audioPlayer.trackMeta;
      const tDecode = Date.now() - t0;
      console.log(`[audio] decoded ${key} in ${tDecode}ms`);

      // Start playback IMMEDIATELY after decode, before any UI RPCs.
      // If speaker is already running this is a no-op (swapAudio already cut over);
      // if speaker was stopped this creates a new one right away.
      if (autoplay) {
        audioPlayer.play();
        console.log(`[audio] play() called at ${Date.now() - t0}ms, playing=${audioPlayer.isPlaying}`);
      }

      if (ft && meta) {
        ft.title = meta.title;
        ft.artist = meta.artist;
        ft.album = meta.album;
        ft.duration = Math.round(audioPlayer.duration);
        // Upload embedded cover (once per track) — async, doesn't block audio
        if (meta.cover && meta.cover.length > 0 && !coverUploaded.has(key)) {
          const coverId = `track-cover-${key}`;
          console.log(`[cover] uploading ${coverId} (${meta.cover.length} bytes)...`);
          const ok = await uploadCoverImage(app.client, coverId, meta.cover);
          if (isStale()) return;
          if (ok) {
            ft.cover = coverId;
            coverUploaded.add(key);
            needRemount = true;
            console.log(`[cover] uploaded ${coverId} OK`);
          } else {
            console.warn(`[cover] upload FAILED for ${coverId}`);
          }
        }
      }

      (state as any).current_track = key;
      (state as any).duration = Math.round(audioPlayer.duration);
      (state as any).position = 0;
      store.value("current_track").set(key);
      store.value("position").set(0);
      store.value("is_playing").set(true);
      store.value("is_paused").set(false);
      // Highlight now-playing row via dynamic inputs (sanitized: hyphens→underscores)
      for (const t of flowTracks) {
        store.value(`pl_active_${t.key.replace(/-/g, "_")}`).set(t.key === key);
      }

      if (needRemount) {
        // Full re-mount only when a new cover image was just uploaded
        await mountFlowSafe();
        if (isStale()) return;
      } else {
        // Fast path: publish changed inputs only (no re-mount) — cached tracks
        const changes = declaredInputChanges(def.flow(), store.changedScalars());
        if (changes.length > 0) await app.ui.publish(changes);
      }
      store.markApplied();
      if (isStale()) return;

      // Publish is_playing state (audio already started earlier)
      const ac = declaredInputChanges(def.flow(), store.changedScalars());
      if (ac.length > 0) { void app.ui.publish(ac).catch(() => undefined); store.markApplied(); }
      console.log(`[audio] loadAndPlayTrack ${key} done in ${Date.now() - t0}ms (decode=${tDecode}ms)`);
    } catch (err) {
      if (!isStale()) console.warn(`[audio] failed to load ${track.filename}:`, err);
    } finally {
      isLoading = false;
    }
  };

  // Load first track (no autoplay yet — splash sequence handles that)
  if (scanned.length > 0) {
    await loadAndPlayTrack(scanned[0].key, false);
  }

  // Background pre-decode: decode PCM + upload cover for every remaining track
  // so track switches are cache hits (no spawnSync ffmpeg blocking).
  const preDecodePlayer = new AudioPlayer();
  let preDecodeDone = false;
  const preDecodeAll = async () => {
    for (const t of scanned) {
      if (audioCache.has(t.key) && coverUploaded.has(t.key)) continue;
      try {
        if (!audioCache.has(t.key)) {
          const t0 = Date.now();
          await preDecodePlayer.loadFile(t.path);
          if (preDecodePlayer.decodedAudio && preDecodePlayer.trackMeta) {
            audioCache.set(t.key, { audio: preDecodePlayer.decodedAudio, meta: preDecodePlayer.trackMeta });
            console.log(`[predecode] cached ${t.key} in ${Date.now()-t0}ms: ${preDecodePlayer.trackMeta.title}`);
          }
        }
        const meta = preDecodePlayer.trackMeta;
        if (meta?.cover && meta.cover.length > 0 && !coverUploaded.has(t.key)) {
          const coverId = `track-cover-${t.key}`;
          const ok = await uploadCoverImage(app.client, coverId, meta.cover);
          if (ok) {
            coverUploaded.add(t.key);
            const ft = flowTracks.find((x) => x.key === t.key);
            if (ft) ft.cover = coverId;
            console.log(`[predecode] cover uploaded ${coverId}`);
          }
        }
      } catch (e) {
        console.warn(`[predecode] failed ${t.key}:`, e);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    preDecodeDone = true;
    console.log("[predecode] all tracks cached");
  };
  void preDecodeAll();

  // Dedicated wgpu client for audio frame uploads
  const audioWgpuClient = new NeonClient(endpoint(39103), {
    origin: `neon3-case-${def.id}-audio`,
    kind: "external_host",
  });

  // Register track play handlers for every scanned file
  for (const t of scanned) {
    app.router.on(`player.track.play.${t.key}`, () => {
      void loadAndPlayTrack(t.key, true);
      // Auto-close playlist after selecting a track
      const plVisible = (store.value("playlist_visible") as any)?.current?.value ?? false;
      if (plVisible) void transitionTo(false);
    });
  }

  // Page transition progress (-1 = no transition, 0..1 = active)
  let transitionProgress = -1;

  // Upload audio frame to runtime ~60fps
  let lastSecond = -1;
  // Pre-allocated extras buffer — reused every 16ms to avoid GC pauses
  const _extras: number[][] = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
  const audioUploadTimer = setInterval(async () => {
    if (!audioPlayer.isPlaying) return;
    const frame = audioPlayer.frame;
    try {
      // Pack audio data into the generic 10 x vec4 extras slot:
      //   extras[0..7] = spectrum[0..31]
      //   extras[8]    = [energy, bass, mid, treble]
      //   extras[9]    = [centroid, onset, beat, mode]
      for (let i = 0; i < 8; i++) {
        _extras[i][0] = frame.spectrum[i * 4];
        _extras[i][1] = frame.spectrum[i * 4 + 1];
        _extras[i][2] = frame.spectrum[i * 4 + 2];
        _extras[i][3] = frame.spectrum[i * 4 + 3];
      }
      const midVal = transitionProgress >= 0 ? transitionProgress : frame.mid;
      _extras[8][0] = frame.energy;
      _extras[8][1] = frame.bass;
      _extras[8][2] = midVal;
      _extras[8][3] = frame.treble;
      _extras[9][0] = frame.centroid;
      _extras[9][1] = frame.onset;
      _extras[9][2] = frame.beat;
      _extras[9][3] = frame.mode;
      await audioWgpuClient.call("wgpu-runtime", "wgpu.ui.set_view_extras", {
        extras: _extras,
      }, { raiseForStatus: false });
    } catch { /* ignore transient upload errors */ }
    // Update playback position
    const sec = Math.floor(audioPlayer.position);
    store.value("position").set(sec);
    store.value("duration").set(Math.floor(audioPlayer.duration));
    // Re-mount flow when second changes to refresh literal elapsed text.
    // Skip while playlist is open to avoid player-shell flashing over it.
    if (sec !== lastSecond) {
      lastSecond = sec;
      (state as any).position = sec;
      const plVisible = (store.value("playlist_visible") as any).current?.value ?? false;
      if (!plVisible) {
        void mountFlowSafe().catch(() => undefined);
      }
    }
    const posChanges = declaredInputChanges(def.flow(), store.changedScalars());
    if (posChanges.length > 0) {
      void app.ui.publish(posChanges).catch(() => undefined);
      store.markApplied();
    }
  }, 16);

  // Intercept playback control events
  const publishAudioState = () => {
    store.value("is_playing").set(audioPlayer.isPlaying);
    store.value("is_paused").set(!audioPlayer.isPlaying);
    store.value("position").set(Math.floor(audioPlayer.position));
    store.value("duration").set(Math.floor(audioPlayer.duration));
    const changes = declaredInputChanges(def.flow(), store.changedScalars());
    if (changes.length > 0) {
      void app.ui.publish(changes).catch(() => undefined);
      store.markApplied();
    }
  };

  app.router.on("player.transport.play_pause", () => {
    if (audioPlayer.isPlaying) audioPlayer.pause();
    else audioPlayer.play();
    publishAudioState();
    console.log(`[audio] ${audioPlayer.isPlaying ? "playing" : "paused"}`);
  });

  app.router.on("player.transport.next", () => {
    const idx = scanned.findIndex((t) => t.key === (state as any).current_track);
    const next = scanned[(idx + 1 + scanned.length) % scanned.length];
    if (next) { void loadAndPlayTrack(next.key, true); console.log(`[audio] next -> ${next.filename}`); }
  });

  app.router.on("player.transport.previous", () => {
    const idx = scanned.findIndex((t) => t.key === (state as any).current_track);
    const prev = scanned[(idx - 1 + scanned.length) % scanned.length];
    if (prev) { void loadAndPlayTrack(prev.key, true); console.log(`[audio] prev -> ${prev.filename}`); }
  });

  app.router.on("player.transport.seek", (event: any) => {
    const pos = Number(event.payload?.value?.value ?? event.payload?.value ?? 0);
    audioPlayer.seek(pos);
    publishAudioState();
  });

  // === Playlist page transition with sweep-light reveal ===
  const publishPageState = async () => {
    const changes = declaredInputChanges(def.flow(), store.changedScalars());
    if (changes.length > 0) {
      try {
        await app.ui.publish(changes);
        store.markApplied();
      } catch (e) {
        // StaleRevisionError is transient — another publish won the race; next tick catches up
        if ((e as any)?.code !== "stale_revision") console.warn("[page] publish failed:", e);
      }
    }
  };

  let transitionRunning = false;
  const transitionTo = (showPlaylist: boolean) => {
    if (transitionRunning) return;
    transitionRunning = true;
    store.value("page_transition").set(true);
    void publishPageState();

    const duration = 1000; // 1 second total transition
    const startTime = Date.now();
    let pageSwapped = false;

    const animFrame = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      transitionProgress = progress;

      // Swap pages at 50% (when sweep fully covers screen)
      if (!pageSwapped && progress >= 0.5) {
        pageSwapped = true;
        store.value("player_visible").set(!showPlaylist);
        store.value("playlist_visible").set(showPlaylist);
        void publishPageState();
      }

      if (progress < 1.0) {
        setTimeout(animFrame, 16);
      } else {
        transitionProgress = -1;
        store.value("page_transition").set(false);
        void publishPageState();
        transitionRunning = false;
        console.log(`[page] transition to ${showPlaylist ? "playlist" : "player"} complete`);
      }
    };
    setTimeout(animFrame, 50);
  };

  app.router.on("playlist.open", () => {
    console.log("[page] opening playlist");
    void transitionTo(true);
  });

  app.router.on("playlist.close", () => {
    console.log("[page] closing playlist");
    void transitionTo(false);
  });

  app.router.on("playlist.settings", () => {
    console.log("[page] playlist settings clicked");
    // TODO: open settings panel / directory configuration
  });

  (globalThis as any).__audioPlayer = audioPlayer;
  (globalThis as any).__audioUploadTimer = audioUploadTimer;
  console.log("[audio] engine initialized with playback controls");

  // Stop audio on any exit path (ALT+F4, close button, SIGINT, etc.)
  const stopAudioOnExit = () => {
    try { audioPlayer.stop(); } catch { /* ignore */ }
    try { clearInterval(audioUploadTimer); } catch { /* ignore */ }
  };
  process.once("SIGINT", stopAudioOnExit);
  process.once("SIGTERM", stopAudioOnExit);
  process.once("exit", stopAudioOnExit);

  // Auto-play after splash
  setTimeout(() => {
    if (scanned.length > 0) {
      audioPlayer.play();
      store.value("is_playing").set(true);
      store.value("is_paused").set(false);
      const changes = declaredInputChanges(def.flow(), store.changedScalars());
      if (changes.length > 0) {
        void app.ui.publish(changes).catch(() => undefined);
        store.markApplied();
      }
      console.log("[audio] auto-play started");
    }
  }, 2000);
}

// NeonApp wrapper is incompatible with the v0.2.5 windowed forwarder, while
// the actual typed ui.flow.submit path is valid. Skip only that redundant
// preflight for this visual entry point.
await app.ui.mountFlow(visualFlow(def.flow(), def.id, state), { validate: false });
// `wire()` projects the domain defaults into the store before the Flow is
// mounted. Replay those dirty scalar values after mount so branch predicates
// are evaluated from the real initial state instead of all Flow defaults.
const initialChanges = declaredInputChanges(def.flow(), store.changedScalars());
if (initialChanges.length > 0) {
  await app.ui.publish(initialChanges);
  store.markApplied();
}
console.log(`Opened ${def.title} (${def.id}) on Neon3 runtime ${runtimeVersion}. Press Ctrl+C to close.`);

// Splash screen transition sequence for music-player
if (def.id === "music-player") {
  const publishAppView = async (value: string) => {
    store.value("app_view").set(value);
    store.value("show_splash").set(value === "splash");
    store.value("show_transition").set(value === "transition");
    store.value("player_visible").set(value === "player");
    const changes = declaredInputChanges(def.flow(), store.changedScalars());
    console.log("[splash] publishing: " + JSON.stringify(changes));
    await app.ui.publish(changes);
    store.markApplied();
    console.log("[splash] app_view -> " + value);
  };
  // Drive the splash scan-reveal from JS via view.extras[9][3]. The shader's
  // input.time_seconds is a global runtime clock (already ~2.5s by the time
  // the flow mounts), so we feed a host-controlled 0..1 progress to make the
  // animation start when the splash surface actually appears.
  const splashWgpu = new NeonClient(endpoint(39103), {
    origin: `neon3-case-${def.id}-splash`,
    kind: "external_host",
  });
  const SPLASH_DURATION_MS = 1500;
  const splashStartedAt = Date.now();
  // Initialize extras so the first frame is fully covered (progress = 0).
  const zeroExtras = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
  void splashWgpu.call("wgpu-runtime", "wgpu.ui.set_view_extras", { extras: zeroExtras }, { raiseForStatus: false });
  const splashAnimTimer = setInterval(() => {
    const elapsed = Date.now() - splashStartedAt;
    const progress = Math.min(elapsed / SPLASH_DURATION_MS, 1.0);
    const extras = Array.from({ length: 10 }, () => [0, 0, 0, 0]);
    extras[9][3] = progress;
    void splashWgpu.call("wgpu-runtime", "wgpu.ui.set_view_extras", { extras }, { raiseForStatus: false });
    if (progress >= 1.0) {
      clearInterval(splashAnimTimer);
    }
  }, 16);
  // When the sweep fully reveals the player, the shader emits
  // `pulse.splash.complete`; we listen for that GPU event and tear down the
  // splash layer — no hard-coded timeout.
  let splashCompleteHandled = false;
  const splashSubscribedAt = Date.now();
  void onShaderEvent(app, "pulse.splash.complete", (payload) => {
    if (splashCompleteHandled) return;
    splashCompleteHandled = true;
    clearInterval(splashAnimTimer);
    const elapsedMs = Date.now() - splashSubscribedAt;
    console.log("[splash] event fired after " + elapsedMs + "ms, shader t=" + (payload[0] ?? "?") + "s");
    store.value("show_splash").set(false);
    const changes = declaredInputChanges(def.flow(), store.changedScalars());
    void app.ui.publish(changes).then(() => store.markApplied());
    console.log("[splash] shader event pulse.splash.complete -> splash removed");
  });
}

process.once("SIGINT", () => { domainServer.close(); void app.stop(); });
