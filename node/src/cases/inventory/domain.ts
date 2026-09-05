// Case 1: inventory — grid slots, item move/swap, capacity expand/collapse, selection.
export type Capacity = "small" | "medium" | "large";
export interface InventoryItem { key: string; kind: string; name: string; slot_key: string | null; rarity: string; description: string }
export interface InventoryState { capacity: Capacity; items: InventoryItem[]; selected: string | null; enabled: boolean }

export const capacities: Record<Capacity, number> = { small: 16, medium: 20, large: 24 };
export const expand: Record<Capacity, Capacity> = { small: "medium", medium: "large", large: "large" };
export const collapse: Record<Capacity, Capacity> = { small: "small", medium: "small", large: "medium" };

export function initialState(): InventoryState {
  return { capacity: "small", items: initialItems(), selected: null, enabled: true };
}
export function initialItems(): InventoryItem[] {
  return [
    { key: "apple", kind: "consumable", name: "Apple", slot_key: "slot-01", rarity: "common", description: "Restores 25 health" },
    { key: "hammer", kind: "tool", name: "Repair Hammer", slot_key: "slot-02", rarity: "rare", description: "Repairs equipment durability" },
  ];
}
export function slotNumber(slot: string): number {
  if (!/^slot-\d{2}$/.test(slot)) throw new Error(`invalid slot key: ${slot}`);
  const n = Number(slot.slice(5));
  if (n < 1 || n > 24) throw new Error(`invalid slot key: ${slot}`);
  return n;
}
export function moveItems(state: InventoryState, itemId: string, source: string, target: string): InventoryState {
  if (!state.enabled) throw new Error("inventory is disabled");
  const limit = capacities[state.capacity];
  const sourceN = slotNumber(source);
  const targetN = slotNumber(target);
  if (targetN > limit) throw new Error("drop target is outside the active capacity");
  const item = state.items.find((i) => i.key === itemId);
  if (!item || item.slot_key !== source) throw new Error("drag source does not own the declared item");
  const items = state.items.map((i) =>
    i.key === itemId ? { ...i, slot_key: target }
    : i.slot_key === target ? { ...i, slot_key: `slot-${sourceN.toString().padStart(2, "0")}` }
    : i
  );
  return { ...state, items };
}
export function select(state: InventoryState, itemId: string): InventoryState {
  if (!state.items.some((i) => i.key === itemId)) throw new Error(`unknown item: ${itemId}`);
  return { ...state, selected: itemId };
}
export function expandCapacity(state: InventoryState): InventoryState {
  if (!state.enabled) throw new Error("inventory is disabled");
  return { ...state, capacity: expand[state.capacity] };
}
export function collapseCapacity(state: InventoryState): InventoryState {
  if (!state.enabled) throw new Error("inventory is disabled");
  return { ...state, capacity: collapse[state.capacity] };
}
export function stateOf(state: InventoryState) {
  return {
    capacity: state.capacity,
    apple_slot: state.items.find((i) => i.key === "apple")?.slot_key,
    hammer_slot: state.items.find((i) => i.key === "hammer")?.slot_key,
    selected: state.selected,
  };
}
export function apply(intent: string, payload: Record<string, unknown>, state: InventoryState): InventoryState {
  switch (intent) {
    case "inventory.item.select": return select(state, String(payload.item_id));
    case "inventory.item.move": return moveItems(state, String(payload.item_id), String(payload.source_slot), String(payload.target_slot));
    case "inventory.capacity.expand": return expandCapacity(state);
    case "inventory.capacity.collapse": return collapseCapacity(state);
    default: throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "inventory.item.select", payload: { item_id: "apple" }, source_node_key: "select-apple", label: "select apple" },
    { intent: "inventory.capacity.expand", payload: {}, source_node_key: "expand-button", label: "expand to medium" },
    { intent: "inventory.item.move", payload: { item_id: "apple", source_slot: "slot-01", target_slot: "slot-05", placement: "into" }, source_node_key: "move-apple", label: "move apple slot-01->slot-05" },
    { intent: "inventory.capacity.expand", payload: {}, source_node_key: "expand-button", label: "expand to large" },
    { intent: "inventory.capacity.collapse", payload: {}, source_node_key: "collapse-button", label: "collapse back to medium" },
  ];
}
export function expectedFinal() {
  return { capacity: "medium", apple_slot: "slot-05", hammer_slot: "slot-02", selected: "apple" };
}
