import {test} from "node:test";
import {strict as assert} from "node:assert";
import {cases} from "../src/cases/registry.js";

// L0-style: run every case's deterministic intent sequence over its pure domain
// rules. Steps marked _reject_expected must throw; everything else must apply.
for (const def of cases()) {
  test(`l0 domain: ${def.id} (${def.title})`, () => {
    const state = def.initialState();
    for (const step of def.sequence()) {
      const payload = step.payload ?? {};
      const rejectExpected = Boolean(payload._reject_expected);
      const sanitized = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "_reject_expected"));
      if (rejectExpected) {
        assert.throws(
          () => def.apply(step.intent, sanitized, state),
          (error: unknown) => true,
          `${def.id} step should reject: ${step.intent}`,
        );
      } else {
        assert.doesNotThrow(() => {
          const next = def.apply(step.intent, sanitized, state) as Record<string, unknown>;
          Object.assign(state, next);
        }, `${def.id} step should accept: ${step.intent} ${step.label ?? ""}`);
      }
    }
  });
}
// Final-state assertions for every case.
for (const def of cases()) {
  test(`l0 final-state: ${def.id}`, () => {
    const state = def.initialState();
    for (const step of def.sequence()) {
      const payload = step.payload ?? {};
      const sanitized = Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "_reject_expected"));
      try {
        const next = def.apply(step.intent, sanitized, state) as Record<string, unknown>;
        Object.assign(state, next);
      } catch {
        // expected rejection path; state stays unchanged
      }
    }
    const projected = def.stateOf ? def.stateOf(state) : state;
    assert.deepEqual(projected, def.expectedFinal(), `${def.id} must reach its expected final state`);
  });
}
// L1 static: every Flow stays within the SDK's closed vocabulary (validateFlowSource
// is a pure helper; a null capability set skips the runtime gating).
import {scanFlow, validateFlowSource} from "@neon3/sdk";
for (const def of cases()) {
  test(`l1 static flow: ${def.id}`, () => {
    const required = validateFlowSource(def.flow(), null, "ui-runtime");
    for (const cap of required) {
      assert.ok(def.requiredCapabilities.includes(cap), `${def.id} must declare capability ${cap}`);
    }
    const scanned = scanFlow(def.flow());
    const keys = scanned.map((s) => s.component);
    assert.ok(keys.length > 3, `${def.id} flow should contain several components`);
  });
}