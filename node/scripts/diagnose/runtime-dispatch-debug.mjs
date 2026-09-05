// Use SDK UiSession.dispatchIntent in a loop; observe where stale rejection kicks in.
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
  const client = new NeonClient("127.0.0.1:39102", { origin: "neon3-debug2", timeoutMs: 6000 });
  const ui = new UiClient(client);
  const session = new UiSession(ui);
  await session.mountFlow(FLOW);
  emit({ stage: "mounted", session_rev: session.inputRevision });

  // Alternate two intents to mimic real flows.
  const intents = ["debug.tick", "debug.other", "debug.tick", "debug.other"];
  for (let i = 0; i < intents.length; i += 1) {
    const before = session.inputRevision;
    try {
      const result = await session.dispatchIntent(intents[i], {}, { sourceNodeKey: intents[i] === "debug.tick" ? "tick-button" : "other-button" });
      emit({ stage: "dispatch", sequence: i + 1, intent: intents[i], before, after: session.inputRevision, status: result.status, code: result.code, message: result.message, result_keys: result.result ? Object.keys(result.result) : null });
    } catch (e) {
      emit({ stage: "dispatch.error", sequence: i + 1, intent: intents[i], before, after: session.inputRevision, error: String(e?.message ?? e), name: e?.name });
    }
  }
} finally {
  await runtime.stop();
}