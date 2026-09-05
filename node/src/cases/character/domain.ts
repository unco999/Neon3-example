// Case 5: character — stat allocation, equipment bonus stacking, caps.
export interface StatName { key: string; label: string }
export interface CharacterState {
  level: number;
  unspent_points: number;
  base: Record<string, number>;
  equipment_bonus: Record<string, number>;
  invested: Record<string, number>;
  caps: Record<string, number>;
  enabled: boolean;
}

export const STATS: StatName[] = [
  { key: "strength", label: "力量" },
  { key: "agility", label: "敏捷" },
  { key: "intellect", label: "智力" },
  { key: "vitality", label: "耐力" },
];
export function initialState(): CharacterState {
  return {
    level: 1,
    unspent_points: 8,
    base: { strength: 5, agility: 5, intellect: 5, vitality: 5 },
    equipment_bonus: { strength: 2, agility: 0, intellect: 3, vitality: 1 },
    invested: { strength: 0, agility: 0, intellect: 0, vitality: 0 },
    caps: { strength: 20, agility: 20, intellect: 20, vitality: 20 },
    enabled: true,
  };
}
export function total(state: CharacterState, key: string): number {
  return state.base[key] + state.equipment_bonus[key] + state.invested[key];
}
export function allocate(state: CharacterState, key: string, amount = 1): CharacterState {
  if (!state.enabled) throw new Error("character panel is disabled");
  if (!STATS.some((s) => s.key === key)) throw new Error(`unknown stat: ${key}`);
  if (state.unspent_points < amount) throw new Error(`not enough points: have ${state.unspent_points}, need ${amount}`);
  const next = total(state, key) + amount;
  if (next > state.caps[key]) throw new Error(`stat cap reached: ${key}`);
  return {
    ...state,
    unspent_points: state.unspent_points - amount,
    invested: { ...state.invested, [key]: state.invested[key] + amount },
  };
}
export function deallocate(state: CharacterState, key: string, amount = 1): CharacterState {
  if (!state.enabled) throw new Error("character panel is disabled");
  if (state.invested[key] < amount) throw new Error(`nothing to deallocate: ${key}`);
  return {
    ...state,
    unspent_points: state.unspent_points + amount,
    invested: { ...state.invested, [key]: state.invested[key] - amount },
  };
}
export function apply(intent: string, payload: Record<string, unknown>, state: CharacterState): CharacterState {
  switch (intent) {
    case "character.allocate": return allocate(state, String(payload.stat), Number(payload.amount ?? 1));
    case "character.deallocate": return deallocate(state, String(payload.stat), Number(payload.amount ?? 1));
    default:
      if (intent.startsWith("character.allocate.")) return allocate(state, intent.slice("character.allocate.".length), Number(payload.amount ?? 1));
      if (intent.startsWith("character.deallocate.")) return deallocate(state, intent.slice("character.deallocate.".length), Number(payload.amount ?? 1));
      throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "character.allocate.strength", payload: { stat: "strength", amount: 3 }, source_node_key: "alloc-strength", label: "strength +3" },
    { intent: "character.allocate.agility", payload: { stat: "agility", amount: 2 }, source_node_key: "alloc-agility", label: "agility +2" },
    { intent: "character.allocate.intellect", payload: { stat: "intellect", amount: 2 }, source_node_key: "alloc-intellect", label: "intellect +2 (equipment +3 total 10)" },
    { intent: "character.allocate.vitality", payload: { stat: "vitality", amount: 1 }, source_node_key: "alloc-vitality", label: "vitality +1" },
    { intent: "character.deallocate.agility", payload: { stat: "agility", amount: 1 }, source_node_key: "dealloc-agility", label: "agility -1 refund" },
  ];
}
export function expectedFinal() {
  return {
    unspent_points: 1,
    strength: 10,
    agility: 6,
    intellect: 10,
    vitality: 7,
  };
}
export function stateOf(state: CharacterState) {
  return {
    unspent_points: state.unspent_points,
    strength: total(state, "strength"),
    agility: total(state, "agility"),
    intellect: total(state, "intellect"),
    vitality: total(state, "vitality"),
  };
}
