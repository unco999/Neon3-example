// Deterministic cross-process state probe. Start case-window first.
import { NeonClient } from "@neon3/sdk";

const caseId = process.argv[2];
const endpoint = process.argv[3] ?? "127.0.0.1:39102";
const emit = (record) => process.stdout.write(`${JSON.stringify(record)}\n`);
const scenarios = {
  shop: { intent: "shop.item.buy", node: "buy-health_potion", before: ["gold", "stock_health_potion_ok"], after: { gold: 450, stock_health_potion_ok: true } },
  "skill-tree": { intent: "skilltree.learn.sword_mastery", node: "learn-sword_mastery", before: ["points", "sword_mastery_rank"], after: { points: 4, sword_mastery_rank: 1 } },
  "quest-log": { intent: "quest.accept.q_wolves", node: "accept-q_wolves", before: ["q_wolves_not_accepted"], after: { q_wolves_not_accepted: false, q_wolves_in_progress: true } },
  character: { intent: "character.allocate.strength", node: "alloc-strength", before: ["unspent_points", "strength_total"], after: { unspent_points: 7, strength_total: 8 } },
  equipment: { intent: "equipment.equip.two_hand_sword", node: "equip-two_hand_sword", before: ["weapon_item_equipped", "total_power"], after: { weapon_item_equipped: true, weapon_item_empty: false, total_power: 25 } },
  crafting: { intent: "crafting.craft.r_health_potion", node: "craft-r_health_potion", before: ["crafts_remaining", "health_potion_count"], after: { crafts_remaining: 4, health_potion_count: 1 } },
  party: { intent: "party.set_ready.p2", node: "ready-p2", before: ["p2_ready", "can_start"], after: { p2_ready: true, can_start: true } },
  settings: { intent: "settings.set_value.music", node: "toggle-music", before: ["music"], after: { music: false, music_off: true } },
  chat: { intent: "chat.switch_channel.party", node: "channel-party", before: ["active_channel"], after: { active_channel: "party" } },
  "chat-text": { intent: "chat.send", node: "chat-input-send", kind: "activate", text: "跨进程消息", before: ["message_count"], after: { message_count: 2 } },
};
const scenario = scenarios[caseId];
if (!scenario) throw new Error(`unknown case: ${caseId}`);
const client = new NeonClient(endpoint, { timeoutMs: 5000, kind: "external_host", origin: "case-window-state-probe" });
const snapshot = async () => {
  let lastError = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await client.call("ui-runtime", "debug.ui.host.snapshot", {}, { raiseForStatus: false });
      if (response.result?.scalar_inputs) return response.result.scalar_inputs;
      lastError = response.error;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`snapshot timeout: ${JSON.stringify(lastError)}`);
};
const values = (snapshot, keys) => Object.fromEntries(keys.map((key) => [key, snapshot.values?.[key]?.value?.value]));
const before = await snapshot();
emit({ probe: "case-window-state", stage: "before", case_id: caseId, endpoint, input_revision: before.input_revision, consumer: values(before, scenario.before) });
const event = {
  event_id: `probe-${caseId}-1`, kind: scenario.kind ?? "activate", intent: scenario.intent, source_node_key: scenario.node, payload: {},
  program_revision: before.program_revision, input_revision: before.input_revision,
  request_id: `probe-${caseId}-1`, idempotency_key: `probe-${caseId}-1`,
  interaction: { interaction_id: `probe-${caseId}-1`, sequence: 1, renderer_epoch: 1 },
};
if (scenario.text) event.committed_text = { value: scenario.text };
const response = await client.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, { requestId: event.request_id, idempotencyKey: event.idempotency_key, raiseForStatus: false });
await new Promise((resolve) => setTimeout(resolve, 600));
const after = await snapshot();
const consumer = values(after, Object.keys(scenario.after));
const pass = response.status === "accepted" && Object.entries(scenario.after).every(([key, expected]) => consumer[key] === expected);
emit({ probe: "case-window-state", stage: "after", case_id: caseId, input_revision: after.input_revision, producer: { intent: scenario.intent, source_node_key: scenario.node }, response: { status: response.status, error: response.error }, consumer, pass });
process.exitCode = pass ? 0 : 1;
