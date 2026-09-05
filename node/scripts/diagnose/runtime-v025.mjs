// Spawn v0.2.5 runtime binaries with captured output to diagnose wgpu startup.
import { spawn } from "node:child_process";
import { NeonClient } from "@neon3/sdk";

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const DIR = "C:/Users/10540/AppData/Local/Neon3Sdk/runtime/v0.2.5";
const ports = { eventd: "127.0.0.1:39301", ui: "127.0.0.1:39302", wgpu: "127.0.0.1:39303", domain: "127.0.0.1:39304" };
const children = [];
const spawnProcs = () => {
  const specs = [
    ["eventd", `${DIR}/neon-eventd.exe`, ["--server", ports.eventd, "1"]],
    ["wgpu", `${DIR}/neon-wgpu-runtime.exe`, ["--window-server", ports.wgpu, ports.ui, "--eventd", ports.eventd]],
    ["ui", `${DIR}/neon-ui-runtime.exe`, ["--forward-server", ports.ui, ports.wgpu, ports.domain, "--eventd", ports.eventd]],
  ];
  for (const [name, exe, args] of specs) {
    const child = spawn(exe, args, { cwd: DIR, stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
    child.stdout.on("data", (d) => emit({ stage: "child.stdout", name, line: d.toString().trim().split("\n").slice(0, 8) }));
    child.stderr.on("data", (d) => emit({ stage: "child.stderr", name, line: d.toString().trim().split("\n").slice(0, 8) }));
    child.on("exit", (code, signal) => emit({ stage: "child.exit", name, code, signal }));
    children.push(child);
  }
};
const health = async (endpoint, target, label) => {
  const deadline = Date.now() + 20000;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const c = new NeonClient(endpoint, { timeoutMs: 800 });
      const r = await c.call(target, "service.health", {}, { raiseForStatus: false });
      if (r.status === "accepted") { emit({ stage: "health.ok", label, status: r.result?.status }); return; }
      lastError = `status=${r.status}`;
    } catch (e) { lastError = String(e?.message ?? e); }
    await new Promise((r) => setTimeout(r, 200));
  }
  emit({ stage: "health.fail", label, lastError });
};
spawnProcs();
try {
  await health(ports.eventd, "eventd", "eventd");
  await health(ports.wgpu, "wgpu-runtime", "wgpu");
  await health(ports.ui, "ui-runtime", "ui");
} finally {
  for (const child of children) if (!child.killed) child.kill();
}