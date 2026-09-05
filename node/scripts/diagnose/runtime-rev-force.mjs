// Hypothesis: headless host input_revision stays 0; always submit snapshot value.
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

const runtime = new RuntimeSession({ mode: "headless", runtimeVersion: "v0.2.5", timeoutMs: 20000 });
try {
  await runtime.start();
  const client = new NeonClient("127.0.0.1:39102", { origin: "neon3-debug3", timeoutMs: 6000 });
  const ui = new UiClient(client);
  const session = new UiSession(ui);
  await session.mountFlow(FLOW);

  // Strategy A: force event input_revision to current host snapshot value each time.
  async function snapshotRevision() {
    const host = await ui.hostInputSnapshot();
    return host?.scalar_inputs?.input_revision ?? 0;
  }

  const intents = ["debug.tick", "debug.other", "debug.tick", "debug.other", "debug.tick"];
  let accepted = 0;
  for (let i = 0; i < intents.length; i += 1) {
    const snapRev = await snapshotRevision();
    const event = await session.buildIntentEvent(intents[i], {}, { sourceNodeKey: intents[i] === "debug.tick" ? "tick-button" : "other-button" });
    // Patch the event's input_revision to the snapshot value.
    (event).input_revision = snapRev;
    const response = await client.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, { raiseForStatus: false, requestId: event.request_id, idempotencyKey: event.idempotency_key });
    const acceptedInner = response.status === "accepted";
    if (acceptedInner) accepted += 1;
    emit({ stage: "forced.snapshot", sequence: i + 1, intent: intents[i], submitted_rev: snapRev, rpc_status: response.status, revision: response.revision, result: response.result, error: response.error });
  }
  emit({ stage: "completed", accepted, total: intents.length, pass_result: accepted === intents.length });
} finally {
  await runtime.stop();
}