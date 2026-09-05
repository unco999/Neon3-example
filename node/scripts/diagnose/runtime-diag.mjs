// Step 1: bare ui.flow.submit with idempotency_key. Step 2 (app): full NeonApp mountFlow.
import { RuntimeSession, NeonClient, NeonApp } from "@neon3/sdk";
import { randomUUID } from "node:crypto";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const APP_FLOW = `version 1
surface surface.smoke revision 1
budget nodes=64 bindings=8 instances=64 text=32 glyphs=256 events=16 clips=8
input clicks i32 default 0
flow smoke-lab
surface smoke overlay w 320 h 200 fill #102030
  text title value "smoke"
  button tick-button h 32 value "tick" event smoke.tick
`;

const mode = process.argv.includes("--windowed") ? "windowed" : "headless";
const useApp = process.argv.includes("--app");
emit({ stage: "boot", mode, use_app: useApp });

if (useApp) {
  const app = await NeonApp.start({ mode, origin: "neon3-smoke-node", runtimeVersion: "v0.2.3" });
  try {
    emit({ stage: "app.started" });
    app.intent("smoke.tick")(() => { const v = (app.store?.value("clicks").get()?.value ?? 0) + 1; app.store?.value("clicks").set(v); });
    emit({ stage: "flow.submitting" });
    const t0 = Date.now();
    const program = await Promise.race([
      app.mountFlow(APP_FLOW, { validate: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("manual-timeout-10s")), 10000)),
    ]);
    emit({ stage: "flow.submitted", elapsed_ms: Date.now() - t0, surface_id: program.surface_id, revision: program.program_revision.revision });
    const result = await app.session.dispatchIntent("smoke.tick", {}, { sourceNodeKey: "tick-button" });
    emit({ stage: "intent.dispatched", status: result.status, code: result.code, message: result.message, input_revision: result.input_revision });
    const clicks = app.store?.value("clicks").get()?.value ?? 0;
    emit({ stage: "completed", clicks, pass_result: result.status === "accepted" && clicks === 1 });
  } finally {
    await app.stop();
  }
} else {
  const runtime = new RuntimeSession({ mode, runtimeVersion: "v0.2.3" });
  try {
    await runtime.start();
    const ui = new NeonClient("127.0.0.1:39102", { timeoutMs: 8000 });
    for (let i = 0; i < 2; i += 1) {
      const t0 = Date.now();
      const response = await Promise.race([
        ui.call("ui-runtime", "ui.flow.submit", { source: APP_FLOW }, { raiseForStatus: false, idempotencyKey: `smoke-${i}-${randomUUID()}` }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("manual-timeout-10s")), 10000)),
      ]);
      emit({ stage: "flow.submit.response", attempt: i, elapsed_ms: Date.now() - t0, status: response.status, has_result: !!response.result, result_keys: response.result ? Object.keys(response.result) : null, error: response.error });
    }
  } finally {
    await runtime.stop();
  }
}