// Multi-case test runner.
//   L0 offline: pure domain rules run a deterministic intent sequence (JSONL).
//   L1 static:  scanFlow / validateFlowSource against the closed vocabulary.
//   L2 runtime: start the real v0.2.5 runtime (headless) and dispatch intents.
//
// Usage:
//   node dist/src/run.js [--runtime] [--case <id>] [--timeout-ms <n>]
import { deepStrictEqual } from "node:assert";
import { RuntimeSession, NeonClient, UiClient, UiSession, ObservableStore, IntentRouter, scanFlow, validateFlowSource, describeCapabilities } from "@neon3/sdk";
import { cases } from "./cases/registry.js";
import type { CaseDef, LiveContext, LiveStepResult } from "./cases/types.js";

const emit = (value: unknown) => process.stdout.write(JSON.stringify(value) + "\n");
const argv = process.argv.slice(2);
const withRuntime = argv.includes("--runtime");
const onlyCase = argv.includes("--case") ? argv[argv.indexOf("--case") + 1] : null;
const timeoutMs = argv.includes("--timeout-ms") ? Number(argv[argv.indexOf("--timeout-ms") + 1]) : 12000;
const runId = `multi-case-${withRuntime ? "runtime" : "offline"}-${Date.now()}`;
const portOffset = Number.parseInt(process.env.NEON3_PORT_OFFSET ?? "0", 10) || 0;
const endpoint = (port: number) => `127.0.0.1:${port + portOffset}`;

function guard<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms @ ${label}`)), ms))]);
}
function equals(actual: unknown, expected: unknown): boolean {
  try { deepStrictEqual(actual, expected); return true; } catch { return false; }
}
/** Wrap a plain JS payload into canonical SemanticPayloadValue envelopes. */
function wrapPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const wrapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (key === "_reject_expected") continue;
    if (value !== null && typeof value === "object" && "kind" in (value as object)) {
      wrapped[key] = value;
    } else if (typeof value === "boolean") {
      wrapped[key] = { kind: "bool", value };
    } else if (typeof value === "number") {
      wrapped[key] = { kind: Number.isInteger(value) ? "i32" : "f32", value };
    } else {
      wrapped[key] = { kind: "enum", value: String(value) };
    }
  }
  return wrapped;
}

// ---------- L0: offline domain verification ----------
async function runOffline(def: CaseDef) {
  const records: unknown[] = [];
  const state = def.initialState();
  let allPassed = true;
  const seq = def.sequence();
  seq.forEach((step, index) => {
    let applied: unknown = state;
    let error: string | null = null;
    let rejectExpected = false;
    try {
      applied = def.apply(step.intent, step.payload ?? {}, state as never);
      Object.assign(state as Record<string, unknown>, applied as Record<string, unknown>);
    } catch (e) {
      error = (e as Error).message;
    }
    // Steps marked with payload._reject_expected expect a rejection.
    rejectExpected = Boolean(step.payload?._reject_expected);
    const passed = rejectExpected ? error !== null : error === null;
    if (!passed) allPassed = false;
    const record = {
      run_id: runId, stage: "l0.offline", case_id: def.id, sequence: index + 1,
      input: { intent: step.intent, payload: step.payload, source_node_key: step.source_node_key, label: step.label },
      producer: { revision: index, source: "domain-rules" },
      consumer: { state: applied, rejected: error },
      pairing: { status: error ? "rejected" : "matched" },
      result: passed ? "passed" : "failed", pass_result: passed,
    };
    records.push(record);
    emit(record);
  });
  const finalState = state;
  const finalMatched = equals(def.expectedFinal(), def.stateOf ? def.stateOf(finalState) : finalState);
  if (!finalMatched) allPassed = false;
  const completion = {
    run_id: runId, stage: "l0.completed", case_id: def.id, result: allPassed && finalMatched ? "passed" : "failed",
    pass_result: allPassed && finalMatched, expected: def.expectedFinal(),
    actual: def.stateOf ? def.stateOf(finalState) : finalState,
  };
  emit(completion);
  return allPassed && finalMatched;
}

// ---------- L1: static flow validation ----------
function runStatic(def: CaseDef) {
  const source = def.flow();
  const scanned = scanFlow(source);
  const components = [...new Set(scanned.map((s) => s.component))].sort();
  const required = validateFlowSource(source, null, "ui-runtime");
  const gated = required.filter((cap) => !def.requiredCapabilities.includes(cap));
  const passed = gated.length === 0;
  const record = {
    run_id: runId, stage: "l1.static", case_id: def.id,
    flow_nodes: components, flow_required_capabilities: required,
    declared_capabilities: def.requiredCapabilities,
    missing_declaration: gated,
    result: passed ? "passed" : "failed", pass_result: passed,
  };
  emit(record);
  return passed;
}

// ---------- L2: real runtime probe ----------
async function runRuntime(def: CaseDef) {
  const records: unknown[] = [];
  const session = new RuntimeSession({
    mode: "headless", runtimeVersion: "v0.2.5", timeoutMs: 20000,
    eventd: endpoint(39101), ui: endpoint(39102), wgpu: endpoint(39103), domain: endpoint(39104),
  });
  try {
    await guard(session.start(), 25000, "runtime.start");
    const client = new NeonClient(endpoint(39102), { origin: `neon3-case-${def.id}`, timeoutMs: 6000 });
    const ui = new UiClient(client);
    const sessionUi = new UiSession(ui);
    const capabilities = await guard(describeCapabilities(client, ["ui-runtime"]), 8000, "capabilities");

    const store = new ObservableStore({});
    const router = new IntentRouter();
    const ctx: LiveContext = { session: sessionUi, store, router, capabilities };
    def.wire?.(ctx);

    const program = await guard(sessionUi.mountFlow(def.flow(), { validate: true }), 8000, "mountFlow");
    let passedSoFar = true;
    const seq = def.sequence();
    for (let index = 0; index < seq.length; index += 1) {
      const step = seq[index];
      const sourceNodeKey = step.source_node_key ?? "sdk";
      const before = sessionUi.inputRevision;
      let result: LiveStepResult = { status: "rejected", code: null, input_revision: before, message: "not dispatched" };
      let error: string | null = null;
      try {
        // Workaround: UIKitSession.dispatchIntent auto-increments input_revision
        // after each accepted intent, but the v0.2.5 headless host keeps its
        // input_revision at 0, so the second dispatch is rejected as stale.
        // Build the semantic event and force the host snapshot revision instead.
        const event = await guard(sessionUi.buildIntentEvent(step.intent, wrapPayload(step.payload ?? {}) as never, { sourceNodeKey }), timeoutMs, "buildIntentEvent");
        const host = await ui.hostInputSnapshot();
        const snapshotRevision = host?.scalar_inputs?.input_revision ?? 0;
        event.input_revision = snapshotRevision;
        const response = await guard(client.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, {
          raiseForStatus: false,
          requestId: event.request_id,
          idempotencyKey: event.idempotency_key,
        }), timeoutMs, "hostInbound");
        const accepted = response.status === "accepted";
        result = { status: accepted ? "accepted" : "rejected", code: null, input_revision: snapshotRevision, message: accepted ? "" : String(response.error?.message ?? response.status) };
      } catch (e) {
        error = (e as Error).message;
        result = { status: "rejected", code: null, input_revision: before, message: error ?? "dispatch failed" };
      }
      // Domain-level rejections (marked _reject_expected) are verified in L0
      // against the pure rules. L2 verifies transport integrity: the runtime
      // must accept every well-formed declared intent even when domain rules
      // would reject it, so we assert "accepted" for every step here.
      const rejectExpected = Boolean(step.payload?._reject_expected);
      const stepPassed = result.status === "accepted";
      if (!stepPassed) {
        emit({ run_id: runId, stage: "l2.step_failed", case_id: def.id, sequence: index + 1, intent: step.intent, status: result.status, code: result.code, message: result.message, expected_domain_reject: rejectExpected });
      }
      passedSoFar = passedSoFar && stepPassed;
      const record = {
        run_id: runId, stage: "l2.runtime", case_id: def.id, sequence: index + 1,
        input: { intent: step.intent, payload: step.payload, source_node_key: sourceNodeKey, label: step.label, expected_domain_reject: rejectExpected },
        producer: { event_revision_before: before, renderer_epoch: sessionUi.rendererEpoch },
        consumer: { status: result.status, code: result.code, input_revision: result.input_revision, message: result.message, error },
        pairing: { status: result.status === "accepted" ? "matched" : "rejected" },
        result: stepPassed ? "passed" : "failed", pass_result: stepPassed,
      };
      records.push(record);
      emit(record);
    }
    const completed = {
      run_id: runId, stage: "l2.completed", case_id: def.id,
      surface_id: program.surface_id, program_revision: program.program_revision.revision,
      input_revision: sessionUi.inputRevision, renderer_epoch: sessionUi.rendererEpoch,
      result: passedSoFar ? "passed" : "failed", pass_result: passedSoFar,
    };
    emit(completed);
    return passedSoFar;
  } finally {
    await session.stop();
  }
}

async function main() {
  const selected = cases().filter((c) => !onlyCase || c.id === onlyCase);
  const summary: unknown[] = [];
  let allPassed = true;
  for (const def of selected) {
    const l0 = await runOffline(def);
    const l1 = runStatic(def);
    let l2 = true;
    if (withRuntime) {
      try {
        l2 = await runRuntime(def);
      } catch (e) {
        l2 = false;
        emit({ run_id: runId, stage: "l2.error", case_id: def.id, error: String((e as Error).message) });
      }
    }
    const row = { case_id: def.id, l0, l1, l2: withRuntime ? l2 : "skipped", passed: l0 && l1 && (withRuntime ? l2 : true) };
    summary.push(row);
    if (!row.passed) allPassed = false;
  }
  emit({ run_id: runId, stage: "summary", results: summary, result: allPassed ? "passed" : "failed", pass_result: allPassed });
  process.exitCode = allPassed ? 0 : 1;
}
main().catch((error) => {
  emit({ run_id: runId, stage: "fatal", error: String(error?.message ?? error) });
  process.exitCode = 1;
});
