// Manually spawn the three runtime binaries with captured stdio to see why
// ui-runtime vanishes when NeonApp connects. Reproduces the exact NeonApp CLI.
import { spawn } from "node:child_process";
import net from "node:net";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const DIR = "C:/Users/10540/AppData/Local/Neon3Sdk/runtime/v0.2.3/target/release";
const ports = { eventd: "127.0.0.1:39201", ui: "127.0.0.1:39202", wgpu: "127.0.0.1:39203", domain: "127.0.0.1:39204" };

const children = [];
const spawnProcs = () => {
  const specs = [
    ["eventd", "neon-eventd.exe", ["--server", ports.eventd, "1"]],
    ["wgpu", "neon-wgpu-runtime.exe", ["--window-server", ports.wgpu, ports.ui, "--eventd", ports.eventd]],
    ["ui", "neon-ui-runtime.exe", ["--forward-server", ports.ui, ports.wgpu, ports.domain, "--eventd", ports.eventd]],
  ];
  for (const [name, exe, args] of specs) {
    const child = spawn(`${DIR}/${exe}`, args, { cwd: DIR, stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
    child.stdout.on("data", (d) => emit({ stage: "child.stdout", name, line: d.toString().trim().split("\n") }));
    child.stderr.on("data", (d) => emit({ stage: "child.stderr", name, line: d.toString().trim().split("\n") }));
    child.on("exit", (code, signal) => emit({ stage: "child.exit", name, code, signal }));
    children.push(child);
  }
};
const waitHealthy = async (endpoint, target, label) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const result = await rpc(endpoint, target, "service.health");
      if (result?.result?.status === "healthy") { emit({ stage: "health.ok", label, target }); return; }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  emit({ stage: "health.timeout", label });
};
const rpc = (endpoint, target, method, params = {}, opts = {}) => new Promise((resolve, reject) => {
  const [host, port] = endpoint.split(":");
  const socket = net.createConnection({ host, port: Number(port) });
  const request = { protocol: "neon3.rpc", version: { major: 1, minor: 0 }, request_id: opts.requestId ?? crypto.randomUUID(), client: { kind: "probe", instance_id: crypto.randomUUID(), pid: process.pid, origin: "neon3-manual-probe" }, target, method, params, expected_revision: null, idempotency_key: opts.idempotencyKey ?? null };
  const payload = Buffer.from(JSON.stringify(request));
  const chunks = [];
  let expected;
  let done = false;
  socket.on("connect", () => socket.write(Buffer.concat([u32(payload.length), payload])));
  socket.on("data", (chunk) => {
    chunks.push(chunk);
    const all = Buffer.concat(chunks);
    if (expected === undefined && all.length >= 4) expected = all.readUInt32BE(0);
    if (expected !== undefined && all.length >= expected + 4) {
      const body = JSON.parse(all.subarray(4, expected + 4).toString("utf8"));
      if (!done) { done = true; socket.end(); resolve(body); }
    }
  });
  socket.on("error", (e) => { if (!done) { done = true; reject(e); } });
});
const u32 = (v) => { const b = Buffer.allocUnsafe(4); b.writeUInt32BE(v); return b; };

const FLOW = `version 1
surface surface.smoke revision 1
budget nodes=64 bindings=8 instances=64 text=32 glyphs=256 events=16 clips=8
input clicks i32 default 0
flow smoke-lab
surface smoke overlay w 320 h 200 fill #102030
  text title value "smoke"
  button tick-button h 32 value "tick" event smoke.tick
`;

spawnProcs();
try {
  await waitHealthy(ports.eventd, "eventd", "eventd");
  await waitHealthy(ports.wgpu, "wgpu-runtime", "wgpu");
  await waitHealthy(ports.ui, "ui-runtime", "ui");

  // Emulate exactly what UiClient.capabilities does: service.describe on ui.
  emit({ stage: "describe.calling" });
  for (let i = 0; i < 3; i += 1) {
    try {
      const r = await rpc(ports.ui, "ui-runtime", "service.describe");
      emit({ stage: "describe.ok", attempt: i, has_result: !!r.result, caps: r.result?.capabilities?.length });
    } catch (e) { emit({ stage: "describe.error", attempt: i, error: String(e?.message ?? e) }); await new Promise((r) => setTimeout(r, 500)); }
  }
  emit({ stage: "submit.calling" });
  try {
    const r = await rpc(ports.ui, "ui-runtime", "ui.flow.submit", { source: FLOW }, { idempotencyKey: "manual-flow-1" });
    emit({ stage: "submit.ok", status: r.status, surface: r.result?.surface_id });
  } catch (e) { emit({ stage: "submit.error", error: String(e?.message ?? e) }); }
  await new Promise((r) => setTimeout(r, 2000));
  emit({ stage: "alive-check-after" });
} finally {
  for (const child of children) if (!child.killed) child.kill();
}