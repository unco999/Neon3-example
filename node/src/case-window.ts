import { NeonApp, NeonClient, ObservableStore, UiClient } from "@neon3/sdk";
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
    if (response.status !== "accepted") throw new Error(`asset upload rejected: ${imageId}`);
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

const intents = [] as string[];
for (const intent of intents) {
  app.intent(intent)((event: any) => {
    try {
      const next = def.apply(intent, unwrapPayload(event.payload), state) as Record<string, unknown>;
      Object.assign(state, next);
      publishState(state);
      return { status: "accepted", state: next };
    } catch (error) {
      return { status: "rejected", error: (error as Error).message };
    }
  });
}

// SDK 0.1.5 performs a capability preflight before ui.flow.submit. Its
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
process.once("SIGINT", () => { domainServer.close(); void app.stop(); });
