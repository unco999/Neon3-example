// v0.2.5 headless-mode spawn check: does wgpu survive without DX12 interop?
import { spawn } from "node:child_process";
import { NeonClient } from "@neon3/sdk";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const V025 = "C:/Users/10540/AppData/Local/Neon3Sdk/runtime/v0.2.5";
const ports = { eventd: "127.0.0.1:39601", ui: "127.0.0.1:39602", wgpu: "127.0.0.1:39603", domain: "127.0.0.1:39604" };
const children = {};
const spawnProc = (name, args) => {
  const child = spawn(`${V025}/${name}.exe`, args, { cwd: V025, stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
  child.stdout.on("data", (d) => emit({ stage: "stdout", name, line: d.toString().trim().split("\n").slice(0, 8) }));
  child.stderr.on("data", (d) => emit({ stage: "stderr", name, line: d.toString().trim().split("\n").slice(0, 8) }));
  child.on("exit", (code, signal) => emit({ stage: "exit", name, code, signal }));
  children[name] = child;
};
const healthy = async (endpoint, target) => {
  try {
    const c = new NeonClient(endpoint, { timeoutMs: 800 });
    const r = await c.call(target, "service.health", {}, { raiseForStatus: false });
    return { ok: r.status === "accepted" && r.result?.status === "healthy", raw: r.result?.status };
  } catch (e) { return { ok: false, raw: String(e?.message ?? e) }; }
};

spawnProc("neon-eventd", ["--server", ports.eventd, "1"]);
await new Promise((r) => setTimeout(r, 800));
spawnProc("neon-wgpu-runtime", ["--headless-server", ports.wgpu]);
await new Promise((r) => setTimeout(r, 800));
spawnProc("neon-ui-runtime", ["--forward-server", ports.ui, ports.wgpu, ports.domain, "--eventd", ports.eventd]);

for (let i = 1; i <= 16; i += 1) {
  await new Promise((r) => setTimeout(r, 500));
  const alive = Object.entries(children).map(([n, c]) => `${n}:${c.exitCode === null ? "up" : "dead(" + c.exitCode + "/" + c.signalCode + ")"}`).join(" ");
  const h = await healthy(ports.wgpu, "wgpu-runtime");
  emit({ stage: "tick", ms: i * 500, alive, wgpu_health: h });
  if (children["neon-wgpu-runtime"].exitCode !== null) break;
}
for (const child of Object.values(children)) if (child.exitCode === null) child.kill();