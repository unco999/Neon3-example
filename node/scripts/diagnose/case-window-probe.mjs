// Cross-process window probe. The case window must already be running.
import { NeonClient } from "@neon3/sdk";

const endpoint = process.argv[2] ?? "127.0.0.1:39102";
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const client = new NeonClient(endpoint, { timeoutMs: 5000, kind: "external_host", origin: "case-window-probe" });

const snapshot = async () => (await client.call("ui-runtime", "debug.ui.host.snapshot", {}, { raiseForStatus: false })).result?.scalar_inputs;
const before = await snapshot();
emit({
  probe: "case-window",
  stage: "before",
  input_revision: before?.input_revision,
  quest: {
    not_accepted: before?.values?.q_wolves_not_accepted?.value?.value,
    in_progress: before?.values?.q_wolves_in_progress?.value?.value,
  },
});

const event = {
  event_id: "case-window-quest-accept-1",
  kind: "activate",
  intent: "quest.accept.q_wolves",
  source_node_key: "accept-q_wolves",
  payload: {},
  program_revision: before.program_revision,
  input_revision: before.input_revision,
  request_id: "case-window-quest-accept-1",
  idempotency_key: "case-window-quest-accept-1",
  interaction: { interaction_id: "case-window-quest-accept-1", sequence: 1, renderer_epoch: 1 },
};
const response = await client.call("ui-runtime", "ui.host.inbound", { kind: "semantic_intent", event }, {
  requestId: event.request_id,
  idempotencyKey: event.idempotency_key,
  raiseForStatus: false,
});
await new Promise((resolve) => setTimeout(resolve, 300));
const after = await snapshot();
const pass = response.status === "accepted"
  && after?.values?.q_wolves_not_accepted?.value?.value === false
  && after?.values?.q_wolves_in_progress?.value?.value === true;
emit({
  probe: "case-window",
  stage: "after",
  input_revision: after?.input_revision,
  response: { status: response.status, error: response.error },
  quest: {
    not_accepted: after?.values?.q_wolves_not_accepted?.value?.value,
    in_progress: after?.values?.q_wolves_in_progress?.value?.value,
  },
  pass,
});
process.exitCode = pass ? 0 : 1;
