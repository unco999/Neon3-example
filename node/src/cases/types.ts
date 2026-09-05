// Shared contract for every case in the multi-case suite.
// Each case is a self-contained directory under src/cases/<id>/ with
// domain.ts (pure rules), flow.ts (NUI Flow source), and optional live wiring.

export type CaseCategory = "management" | "growth" | "social" | "system";

export interface CaseIntentStep {
  intent: string;
  payload?: Record<string, unknown>;
  source_node_key?: string;
  /** Optional label shown in JSONL output. */
  label?: string;
}

export interface CaseDef<State = unknown> {
  id: string;
  title: string;
  category: CaseCategory;
  /** What real game UI scene this case represents. */
  scene: string;
  /** Complex behaviours under test. */
  behaviours: string[];
  /** Flow constructs exercised by this case. */
  flowFeatures: string[];
  /** Runtime capabilities this case depends on (validated in L1). */
  requiredCapabilities: string[];
  initialState(): State;
  /** Apply one semantic intent to the pure domain state. Returns new state or throws. */
  apply(intent: string, payload: Record<string, unknown>, state: State): State;
  /** Deterministic event sequence for probes. */
  sequence(): CaseIntentStep[];
  /** Expected final state (deep-equal against apply() result). */
  expectedFinal(): unknown;
  /** Optional projection of state for comparison; defaults to raw state. */
  stateOf?(state: State): unknown;
  /** NUI Flow source for this case (used for L1 static validation + L2 runtime). */
  flow(): string;
  /** Optional live wiring: configure app intents + store; called only in --runtime mode. */
  wire?(ctx: LiveContext): Promise<void> | void;
  /** Optional per-case probe assertions on the live session; default checks accepted. */
  probe?(ctx: LiveContext, step: CaseIntentStep, index: number, result: LiveStepResult): boolean;
}

export interface LiveContext {
  session: import("@neon3/sdk").UiSession;
  store: import("@neon3/sdk").ObservableStore;
  router: import("@neon3/sdk").IntentRouter;
  capabilities: import("@neon3/sdk").CapabilitySet;
  onStateChanged?: (state: unknown) => void;
}

export interface LiveStepResult {
  status: string;
  code: string | null;
  input_revision: number;
  message: string;
}
