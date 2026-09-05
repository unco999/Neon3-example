// Case 4: quest-log — quest list, accept/abandon, progress updates, reward claim.
export interface Quest { key: string; name: string; goal: number; progress: number; accepted: boolean; reward_gold: number; claimed: boolean }
export interface QuestLogState { quests: Quest[]; gold: number; enabled: boolean }

export function initialState(): QuestLogState {
  return {
    gold: 0,
    enabled: true,
    quests: [
      { key: "q_wolves", name: "猎杀野狼", goal: 5, progress: 0, accepted: false, reward_gold: 100, claimed: false },
      { key: "q_herbs", name: "采集草药", goal: 3, progress: 0, accepted: false, reward_gold: 60, claimed: false },
      { key: "q_tower", name: "探索高塔", goal: 1, progress: 0, accepted: false, reward_gold: 250, claimed: false },
    ],
  };
}
export function accept(state: QuestLogState, key: string): QuestLogState {
  if (!state.enabled) throw new Error("quest log is disabled");
  const quest = state.quests.find((q) => q.key === key);
  if (!quest) throw new Error(`unknown quest: ${key}`);
  if (quest.accepted) throw new Error(`quest already accepted: ${key}`);
  return { ...state, quests: state.quests.map((q) => (q.key === key ? { ...q, accepted: true } : q)) };
}
export function abandon(state: QuestLogState, key: string): QuestLogState {
  if (!state.enabled) throw new Error("quest log is disabled");
  const quest = state.quests.find((q) => q.key === key);
  if (!quest) throw new Error(`unknown quest: ${key}`);
  if (!quest.accepted) throw new Error(`quest not accepted: ${key}`);
  return { ...state, quests: state.quests.map((q) => (q.key === key ? { ...q, accepted: false, progress: 0 } : q)) };
}
export function progress(state: QuestLogState, key: string, amount: number): QuestLogState {
  if (!state.enabled) throw new Error("quest log is disabled");
  const quest = state.quests.find((q) => q.key === key);
  if (!quest) throw new Error(`unknown quest: ${key}`);
  if (!quest.accepted) throw new Error(`quest not accepted: ${key}`);
  const progress = Math.min(quest.goal, quest.progress + amount);
  return { ...state, quests: state.quests.map((q) => (q.key === key ? { ...q, progress } : q)) };
}
export function claim(state: QuestLogState, key: string): QuestLogState {
  if (!state.enabled) throw new Error("quest log is disabled");
  const quest = state.quests.find((q) => q.key === key);
  if (!quest) throw new Error(`unknown quest: ${key}`);
  if (quest.progress < quest.goal) throw new Error(`quest incomplete: ${key}`);
  if (quest.claimed) throw new Error(`reward already claimed: ${key}`);
  return {
    ...state,
    gold: state.gold + quest.reward_gold,
    quests: state.quests.map((q) => (q.key === key ? { ...q, claimed: true } : q)),
  };
}
export function apply(intent: string, payload: Record<string, unknown>, state: QuestLogState): QuestLogState {
  switch (intent) {
    case "quest.accept": return accept(state, String(payload.quest_id));
    case "quest.abandon": return abandon(state, String(payload.quest_id));
    case "quest.progress": return progress(state, String(payload.quest_id), Number(payload.amount ?? 1));
    case "quest.claim": return claim(state, String(payload.quest_id));
    default: {
      const match = intent.match(/^quest\.(accept|progress|abandon|claim)\.(.+)$/);
      if (!match) throw new Error(`unhandled intent: ${intent}`);
      const key = match[2];
      if (match[1] === "accept") return accept(state, key);
      if (match[1] === "progress") return progress(state, key, Number(payload.amount ?? 1));
      if (match[1] === "abandon") return abandon(state, key);
      return claim(state, key);
    }
  }
}
export function sequence() {
  return [
    { intent: "quest.accept.q_wolves", payload: { quest_id: "q_wolves" }, source_node_key: "accept-q_wolves", label: "accept wolves quest" },
    { intent: "quest.progress.q_wolves", payload: { quest_id: "q_wolves", amount: 5 }, source_node_key: "progress-q_wolves", label: "kill 5 wolves (complete)" },
    { intent: "quest.claim.q_wolves", payload: { quest_id: "q_wolves" }, source_node_key: "claim-q_wolves", label: "claim reward +100g" },
    { intent: "quest.accept.q_herbs", payload: { quest_id: "q_herbs" }, source_node_key: "accept-q_herbs", label: "accept herbs quest" },
    { intent: "quest.abandon.q_herbs", payload: { quest_id: "q_herbs" }, source_node_key: "abandon-q_herbs", label: "abandon herbs quest" },
    { intent: "quest.accept.q_tower", payload: { quest_id: "q_tower" }, source_node_key: "accept-q_tower", label: "accept tower quest" },
  ];
}
export function expectedFinal() {
  return {
    gold: 100,
    q_wolves: { accepted: true, progress: 5, claimed: true },
    q_herbs: { accepted: false, progress: 0, claimed: false },
    q_tower: { accepted: true, progress: 0, claimed: false },
  };
}
export function stateOf(state: QuestLogState) {
  const q = (k: string) => state.quests.find((quest) => quest.key === k)!;
  return {
    gold: state.gold,
    q_wolves: { accepted: q("q_wolves").accepted, progress: q("q_wolves").progress, claimed: q("q_wolves").claimed },
    q_herbs: { accepted: q("q_herbs").accepted, progress: q("q_herbs").progress, claimed: q("q_herbs").claimed },
    q_tower: { accepted: q("q_tower").accepted, progress: q("q_tower").progress, claimed: q("q_tower").claimed },
  };
}
