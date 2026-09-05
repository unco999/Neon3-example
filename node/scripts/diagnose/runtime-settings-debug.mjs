// Debug: settings case step-level dispatch with raw errors.
import { RuntimeSession, NeonClient, UiClient, UiSession } from "@neon3/sdk";
import { flow } from "../dist/src/cases/settings/flow.js";
import { sequence } from "../dist/src/cases/settings/domain.js";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const wrap = (p) => Object.fromEntries(Object.entries(p ?? {}).map(([k, v]) => k === "_reject_expected" ? null : [k, typeof v === "boolean" ? { kind: "bool", value: v } : typeof v === "number" ? { kind: "i32", value: v } : { kind: "enum", value: String(v) }]).filter(([k]) => k !== null));
const guard = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms @ ${label}`)), ms))]);

const runtime = new RuntimeSession({ mode: "headless", runtimeVersion: "v0.2.5", timeoutMs: 20000 });
try {
  await runtime.start();
  const client = new NeonClient("127.0.0.1:39102", { origin: "neon3-settings-debug", timeoutMs: 6000 });
  const ui = new UiClient(client);
  const session = new UiSession(ui);
  const program = await session.mountFlow(flow());
  emit({ stage: "mounted", surface: program.surface_id, schema: program.input_schema?.emit_event_keys ?? program.input_schema });
  const seq = sequence();
  for (let i = 0; i < seq.length; i += 1) {
    const step = seq[i];
    const event = await session.buildIntentEvent(step.intent, wrap(step.payload), { sourceNodeKey: step.source_node_key ?? "sdk" });
    const host = await ui.hostInputSnapshot();
    event.input_revision = host?.scalar_inputs?.input_revision ?? 0;
    const response = await client.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, { raiseForStatus: false, requestId: event.request_id, idempotencyKey: event.idempotency_key });
    emit({ stage: "step", sequence: i + 1, intent: step.intent, payload: step.payload, rpc: response.status, error: response.error, result: response.result });
  }
} finally {
  await runtime.stop();
}