// Case 2: shop — item catalog, buy/sell, gold balance, stock depletion, sold-out disable.
export interface ShopItem { key: string; name: string; price: number; stock: number; kind: string }
export interface ShopState { gold: number; items: ShopItem[]; inventory: Record<string, number>; sold_out: string[]; enabled: boolean }

export function initialState(): ShopState {
  return {
    gold: 500,
    items: [
      { key: "health_potion", name: "生命药水", price: 50, stock: 3, kind: "consumable" },
      { key: "mana_potion", name: "法力药水", price: 40, stock: 3, kind: "consumable" },
      { key: "iron_sword", name: "铁剑", price: 220, stock: 1, kind: "weapon" },
    ],
    inventory: { health_potion: 2, mana_potion: 0, iron_sword: 0 },
    sold_out: [],
    enabled: true,
  };
}
export function buy(state: ShopState, itemKey: string, quantity = 1): ShopState {
  if (!state.enabled) throw new Error("shop is disabled");
  const item = state.items.find((i) => i.key === itemKey);
  if (!item) throw new Error(`unknown shop item: ${itemKey}`);
  if (item.stock <= 0 || state.sold_out.includes(itemKey)) throw new Error(`item sold out: ${itemKey}`);
  const cost = item.price * quantity;
  if (state.gold < cost) throw new Error(`insufficient gold: need ${cost}, have ${state.gold}`);
  const stock = item.stock - quantity;
  return {
    ...state,
    gold: state.gold - cost,
    items: state.items.map((i) => (i.key === itemKey ? { ...i, stock } : i)),
    inventory: { ...state.inventory, [itemKey]: (state.inventory[itemKey] ?? 0) + quantity },
    sold_out: stock <= 0 ? [...state.sold_out, itemKey] : state.sold_out,
  };
}
export function sell(state: ShopState, itemKey: string, quantity = 1): ShopState {
  if (!state.enabled) throw new Error("shop is disabled");
  const held = state.inventory[itemKey] ?? 0;
  if (held < quantity) throw new Error(`not enough to sell: ${itemKey}`);
  const item = state.items.find((i) => i.key === itemKey);
  const refund = (item?.price ?? 10) * 0.5 * quantity;
  return {
    ...state,
    gold: state.gold + Math.floor(refund),
    inventory: { ...state.inventory, [itemKey]: held - quantity },
  };
}
export function restock(state: ShopState): ShopState {
  if (!state.enabled) throw new Error("shop is disabled");
  return { ...state, items: state.items.map((i) => ({ ...i, stock: Math.max(i.stock, 3) })), sold_out: [] };
}
export function apply(intent: string, payload: Record<string, unknown>, state: ShopState): ShopState {
  switch (intent) {
    case "shop.item.buy": return buy(state, String(payload.item_id), Number(payload.quantity ?? 1));
    case "shop.item.sell": return sell(state, String(payload.item_id), Number(payload.quantity ?? 1));
    case "shop.restock": return restock(state);
    default: throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "shop.item.buy", payload: { item_id: "health_potion", quantity: 1 }, source_node_key: "buy-health_potion", label: "buy 1 health potion (50g)" },
    { intent: "shop.item.buy", payload: { item_id: "health_potion", quantity: 1 }, source_node_key: "buy-health_potion", label: "buy 2nd health potion (50g)" },
    { intent: "shop.item.buy", payload: { item_id: "health_potion", quantity: 1 }, source_node_key: "buy-health_potion", label: "buy 3rd health potion -> sold out" },
    { intent: "shop.item.sell", payload: { item_id: "health_potion", quantity: 1 }, source_node_key: "sell-health_potion", label: "sell 1 health potion (+25g)" },
    { intent: "shop.restock", payload: {}, source_node_key: "restock-button", label: "restock all" },
  ];
}
export function expectedFinal() {
  return {
    gold: 375,
    health_potion_stock: 3,
    mana_potion_stock: 3,
    iron_sword_stock: 3,
    health_potion_held: 4,
    sold_out: [],
  };
}
export function stateOf(state: ShopState) {
  const byKey = (k: string) => state.items.find((i) => i.key === k)!;
  return {
    gold: state.gold,
    health_potion_stock: byKey("health_potion").stock,
    mana_potion_stock: byKey("mana_potion").stock,
    iron_sword_stock: byKey("iron_sword").stock,
    health_potion_held: state.inventory.health_potion ?? 0,
    sold_out: state.sold_out,
  };
}
