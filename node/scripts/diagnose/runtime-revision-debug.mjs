// Debug: inspect the raw ui.host.inbound result to understand revision tracking.
import { RuntimeSession, NeonClient, UiClient, UiSession } from "@neon3/sdk";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const FLOW = `version 1
surface surface.debug revision 1
budget nodes=64 bindings=8 instances=64 text=32 glyphs=256 events=16 clips=8
input clicks i32 default 0
flow debug-lab
surface debug overlay w 320 h 200 fill #102030
  text title value "debug"
  button tick-button h 32 value "tick" event debug.tick
  button other-button h 32 value "other" event debug.other
`;
const wrap = (p) => Object.fromEntries(Object.entries(p ?? {}).map(([k, v]) => [k, typeof v === "boolean" ? { kind: "bool", value: v } : typeof v === "number" ? { kind: "i32", value: v } : { kind: "enum", value: String(v) }]));

const runtime = new RuntimeSession({ mode: "headless", runtimeVersion: "v0.2.5", timeoutMs: 20000 });
try {
  await runtime.start();
  const client = new NeonClient("127.0.0.1:39102", { origin: "neon3-debug", timeoutMs: 6000 });
  const ui = new UiClient(client);
  const session = new UiSession(ui);
  const program = await session.mountFlow(FLOW);
  emit({ stage: "mounted", revision: program.program_revision.revision, session_rev: session.inputRevision });

  for (let i = 1; i <= 4; i += 1) {
    const event = await session.buildIntentEvent("debug.tick", {}, { sourceNodeKey: "tick-button" });
    emit({ stage: "event.built", sequence: i, input_revision: event.input_revision, event_id: event.event_id });
    const response = await client.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, { raiseForStatus: false, requestId: event.request_id, idempotencyKey: event.idempotency_key });
    emit({ stage: "host.inbound.response", sequence: i, status: response.status, revision: response.revision, result: response.result, error: response.error, snapshot: response.snapshot });
    // replicate session revision observation
    const inner = response.result?.semantic_intent;
    emit({ stage: "revision.trace", sequence: i, inner_status: inner?.status, accepted_input_revision: inner?.accepted_input_revision ?? null, result_input_revision: response.result?.input_revision ?? null });
    if (inner?.accepted_input_revision != null) session.inputRevision = Math.max(session.inputRevision, inner.accepted_input_revision);
  }
  emit({ stage: "final_session_rev", input_revision: session.inputRevision });
} finally {
  await runtime.stop();
}