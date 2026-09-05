// Reproduce the SDK RuntimeSession spawn exactly (stdio ignore, target/release
// exe, cwd neonRoot, no delays) and see if wgpu dies.
import { spawn } from "node:child_process";
import { NeonClient, UiClient, UiSession } from "@neon3/sdk";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const V025 = "C:/Users/10540/AppData/Local/Neon3Sdk/runtime/v0.2.5";
const ports = { eventd: "127.0.0.1:39801", ui: "127.0.0.1:39802", wgpu: "127.0.0.1:39803", domain: "127.0.0.1:39804" };
const children = [];
const spawnExact = (name, exePath, args) => {
  const child = spawn(exePath, args, { cwd: V025, stdio: "ignore", windowsHide: false });
  child.on("exit", (code, signal) => emit({ stage: "exit", name, code, signal }));
  children.push(child);
};
const waitHealthy = async (endpoint, target) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const c = new NeonClient(endpoint, { timeoutMs: 800 });
      const r = await c.call(target, "service.health", {}, { raiseForStatus: false });
      if (r.status === "accepted" && r.result?.status === "healthy") return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
};
const guard = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`manual-timeout-${ms}ms@${label}`)), ms))]);

const FLOW = `version 1
surface surface.smoke revision 1
budget nodes=64 bindings=8 instances=64 text=32 glyphs=256 events=16 clips=8
input clicks i32 default 0
flow smoke-lab
surface smoke overlay w 320 h 200 fill #102030
  text title value "smoke"
  button tick-button h 32 value "tick" event smoke.tick
`;

const exe = (n) => `${V025}/target/release/${n}.exe`;
spawnExact("eventd", exe("neon-eventd"), ["--server", ports.eventd, "1"]);
spawnExact("wgpu", exe("neon-wgpu-runtime"), ["--headless-server", ports.wgpu]);
spawnExact("ui", exe("neon-ui-runtime"), ["--forward-server", ports.ui, ports.wgpu, ports.domain, "--eventd", ports.eventd]);

emit({ stage: "waiting", eventd: await waitHealthy(ports.eventd, "eventd"), wgpu: await waitHealthy(ports.wgpu, "wgpu-runtime"), ui: await waitHealthy(ports.ui, "ui-runtime") });

try {
  const client = new NeonClient(ports.ui, { origin: "neon3-repro", timeoutMs: 4000 });
  const ui = new UiClient(client);
  const session = new UiSession(ui);
  const caps = await guard(ui.capabilities({ refresh: true }), 6000, "capabilities");
  emit({ stage: "capabilities.ok", count: caps.capabilities.size });
  const program = await guard(session.mountFlow(FLOW), 6000, "mountFlow");
  emit({ stage: "mountFlow.ok", surface_id: program.surface_id });
  const result = await guard(session.dispatchIntent("smoke.tick", {}, { sourceNodeKey: "tick-button" }), 6000, "dispatchIntent");
  emit({ stage: "intent.dispatched", status: result.status });
  emit({ stage: "completed", pass_result: result.status === "accepted" });
  process.exitCode = result.status === "accepted" ? 0 : 1;
} catch (e) {
  emit({ stage: "chain.error", error: String(e?.message ?? e) });
  process.exitCode = 1;
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  emit({ stage: "done" });
}