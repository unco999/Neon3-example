// Case 7: equipment — gear slots, equip/unequip, slot conflicts, stat aggregation.
export interface GearItem { key: string; name: string; slot: string; power: number; }
export interface EquipSlot { key: string; label: string; }
export interface EquipmentState { slots: Record<string, string | null>; bag: GearItem[]; enabled: boolean }

export const SLOTS: EquipSlot[] = [
  { key: "head", label: "头盔" },
  { key: "chest", label: "胸甲" },
  { key: "weapon", label: "武器" },
  { key: "offhand", label: "副手" },
  { key: "legs", label: "腿甲" },
];
export function initialState(): EquipmentState {
  return {
    slots: { head: null, chest: null, weapon: "iron_sword", offhand: null, legs: null },
    bag: [
      { key: "iron_sword", name: "铁剑", slot: "weapon", power: 12 },
      { key: "leather_helm", name: "皮盔", slot: "head", power: 5 },
      { key: "steel_chest", name: "钢甲", slot: "chest", power: 14 },
      { key: "oak_shield", name: "橡木盾", slot: "offhand", power: 8 },
      { key: "two_hand_sword", name: "双手巨剑", slot: "weapon", power: 25 },
      { key: "cloth_legs", name: "布裤", slot: "legs", power: 3 },
    ],
    enabled: true,
  };
}
export function totalPower(state: EquipmentState): number {
  return Object.values(state.slots).reduce((sum, key) => {
    const item = state.bag.find((g) => g.key === key);
    return sum + (item?.power ?? 0);
  }, 0);
}
export function equip(state: EquipmentState, itemKey: string): EquipmentState {
  if (!state.enabled) throw new Error("equipment is disabled");
  const item = state.bag.find((g) => g.key === itemKey);
  if (!item) throw new Error(`unknown gear: ${itemKey}`);
  const slot = item.slot;
  const equipped = Object.entries(state.slots).find(([, key]) => key === itemKey);
  if (equipped) throw new Error(`already equipped: ${itemKey}`);
  // A weapon conflict: equipping a two-hander frees the offhand.
  const slots = { ...state.slots };
  if (slot === "weapon" && itemKey === "two_hand_sword") slots.offhand = null;
  const displaced = slots[slot];
  slots[slot] = itemKey;
  const bag = displaced ? state.bag.map((g) => (g.key === displaced ? { ...g } : g)) : state.bag;
  return { ...state, slots, bag };
}
export function unequip(state: EquipmentState, slot: string): EquipmentState {
  if (!state.enabled) throw new Error("equipment is disabled");
  if (!(slot in state.slots)) throw new Error(`unknown slot: ${slot}`);
  return { ...state, slots: { ...state.slots, [slot]: null } };
}
export function apply(intent: string, payload: Record<string, unknown>, state: EquipmentState): EquipmentState {
  switch (intent) {
    case "equipment.equip": return equip(state, String(payload.item_id));
    case "equipment.unequip": return unequip(state, String(payload.slot));
    default:
      if (intent.startsWith("equipment.equip.")) return equip(state, intent.slice("equipment.equip.".length));
      if (intent.startsWith("equipment.unequip.")) return unequip(state, intent.slice("equipment.unequip.".length));
      throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "equipment.unequip.weapon", payload: { slot: "weapon" }, source_node_key: "unequip-weapon", label: "unequip iron sword" },
    { intent: "equipment.equip.steel_chest", payload: { item_id: "steel_chest" }, source_node_key: "equip-steel_chest", label: "equip steel chest" },
    { intent: "equipment.equip.leather_helm", payload: { item_id: "leather_helm" }, source_node_key: "equip-leather_helm", label: "equip leather helm" },
    { intent: "equipment.equip.two_hand_sword", payload: { item_id: "two_hand_sword" }, source_node_key: "equip-two_hand_sword", label: "equip 2H sword (frees offhand)" },
    { intent: "equipment.equip.oak_shield", payload: { item_id: "oak_shield" }, source_node_key: "equip-oak_shield", label: "equip oak shield into freed offhand" },
  ];
}
export function expectedFinal() {
  return {
    head: "leather_helm",
    chest: "steel_chest",
    weapon: "two_hand_sword",
    offhand: "oak_shield",
    legs: null,
    total_power: 5 + 14 + 25 + 8,
  };
}
export function stateOf(state: EquipmentState) {
  return { ...state.slots, total_power: totalPower(state) };
}
