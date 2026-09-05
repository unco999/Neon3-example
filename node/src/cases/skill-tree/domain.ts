// Case 3: skill-tree — multi-branch tree, prerequisite unlocks, point budget, learn/reset.
export interface Skill { key: string; name: string; branch: string; rank: number; max_rank: number; cost: number; prerequisites: string[] }
export interface SkillTreeState { points: number; learned: Record<string, number>; enabled: boolean }

export function initialState(): SkillTreeState {
  return { points: 5, learned: {}, enabled: true };
}
export const SKILLS: Skill[] = [
  { key: "sword_mastery", name: "剑术精通", branch: "warrior", rank: 1, max_rank: 3, cost: 1, prerequisites: [] },
  { key: "whirlwind", name: "旋风斩", branch: "warrior", rank: 2, max_rank: 1, cost: 2, prerequisites: ["sword_mastery"] },
  { key: "shield_wall", name: "盾墙", branch: "warrior", rank: 3, max_rank: 1, cost: 2, prerequisites: ["sword_mastery"] },
  { key: "frost_bolt", name: "寒冰箭", branch: "mage", rank: 1, max_rank: 3, cost: 1, prerequisites: [] },
  { key: "blizzard", name: "暴风雪", branch: "mage", rank: 4, max_rank: 1, cost: 3, prerequisites: ["frost_bolt"] },
  { key: "haste", name: "迅捷", branch: "rogue", rank: 1, max_rank: 2, cost: 1, prerequisites: [] },
];
export function skillByKey(key: string): Skill {
  const skill = SKILLS.find((s) => s.key === key);
  if (!skill) throw new Error(`unknown skill: ${key}`);
  return skill;
}
export function canLearn(state: SkillTreeState, key: string): boolean {
  if (!state.enabled) return false;
  const skill = skillByKey(key);
  const current = state.learned[key] ?? 0;
  if (current >= skill.max_rank) return false;
  const missing = skill.prerequisites.filter((p) => (state.learned[p] ?? 0) < 1);
  if (missing.length > 0) return false;
  return state.points >= skill.cost;
}
export function learn(state: SkillTreeState, key: string): SkillTreeState {
  if (!canLearn(state, key)) throw new Error(`cannot learn: ${key} (prerequisite or points missing)`);
  const skill = skillByKey(key);
  return {
    ...state,
    points: state.points - skill.cost,
    learned: { ...state.learned, [key]: (state.learned[key] ?? 0) + 1 },
  };
}
export function resetBranch(state: SkillTreeState, branch: string): SkillTreeState {
  if (!state.enabled) throw new Error("skill tree is disabled");
  const refund = SKILLS.filter((s) => s.branch === branch).reduce((sum, s) => sum + s.cost * (state.learned[s.key] ?? 0), 0);
  const learned = { ...state.learned };
  for (const skill of SKILLS.filter((s) => s.branch === branch)) delete learned[skill.key];
  return { ...state, points: state.points + refund, learned };
}
export function apply(intent: string, payload: Record<string, unknown>, state: SkillTreeState): SkillTreeState {
  switch (intent) {
    case "skilltree.learn": return learn(state, String(payload.skill_id));
    case "skilltree.reset_branch": return resetBranch(state, String(payload.branch));
    default:
      if (intent.startsWith("skilltree.learn.")) return learn(state, intent.slice("skilltree.learn.".length));
      throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "skilltree.learn.sword_mastery", payload: { skill_id: "sword_mastery" }, source_node_key: "learn-sword_mastery", label: "learn sword_mastery (1pt)" },
    { intent: "skilltree.learn.whirlwind", payload: { skill_id: "whirlwind" }, source_node_key: "learn-whirlwind", label: "learn whirlwind (2pt, prereq met)" },
    { intent: "skilltree.learn.blizzard", payload: { skill_id: "blizzard", _reject_expected: true }, source_node_key: "learn-blizzard", label: "learn blizzard should FAIL (prereq frost_bolt missing)" },
    { intent: "skilltree.learn.frost_bolt", payload: { skill_id: "frost_bolt" }, source_node_key: "learn-frost_bolt", label: "learn frost_bolt (1pt)" },
    { intent: "skilltree.reset_branch", payload: { branch: "warrior" }, source_node_key: "reset-warrior", label: "reset warrior branch refund 3pt" },
    { intent: "skilltree.learn.haste", payload: { skill_id: "haste" }, source_node_key: "learn-haste", label: "learn haste (1pt)" },
  ];
}
export function expectedFinal() {
  return {
    points: 3,
    sword_mastery: 0,
    whirlwind: 0,
    frost_bolt: 1,
    blizzard: 0,
    haste: 1,
  };
}
export function stateOf(state: SkillTreeState) {
  const rank = (k: string) => state.learned[k] ?? 0;
  return {
    points: state.points,
    sword_mastery: rank("sword_mastery"),
    whirlwind: rank("whirlwind"),
    frost_bolt: rank("frost_bolt"),
    blizzard: rank("blizzard"),
    haste: rank("haste"),
  };
}
