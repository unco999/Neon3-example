// Case 8: crafting — recipe chain, material consumption, material-output reflux, attempt limits.
export interface Recipe {
  key: string; name: string; materials: Record<string, number>;
  output: string; output_count: number; output_is_material?: boolean;
}
export interface CraftingState { materials: Record<string, number>; output: Record<string, number>; crafts_remaining: number; enabled: boolean }

export const RECIPES: Recipe[] = [
  { key: "r_health_potion", name: "生命药水", materials: { herb: 2, water: 1 }, output: "health_potion", output_count: 1 },
  { key: "r_iron_ingot", name: "铁锭", materials: { iron_ore: 3, coal: 1 }, output: "iron_ingot", output_count: 1, output_is_material: true },
  { key: "r_steel_sword", name: "钢剑", materials: { iron_ingot: 2, wood: 1 }, output: "steel_sword", output_count: 1 },
];
export function initialState(): CraftingState {
  return {
    materials: { herb: 5, water: 4, iron_ore: 6, coal: 2, iron_ingot: 0, wood: 3 },
    output: { health_potion: 0, iron_ingot: 0, steel_sword: 0 },
    crafts_remaining: 5,
    enabled: true,
  };
}
export function recipeByKey(key: string): Recipe {
  const recipe = RECIPES.find((r) => r.key === key);
  if (!recipe) throw new Error(`unknown recipe: ${key}`);
  return recipe;
}
export function craft(state: CraftingState, recipeKey: string, times = 1): CraftingState {
  if (!state.enabled) throw new Error("crafting is disabled");
  const recipe = recipeByKey(recipeKey);
  if (state.crafts_remaining < times) throw new Error(`craft limit reached: ${state.crafts_remaining} left`);
  for (const [material, need] of Object.entries(recipe.materials)) {
    const have = state.materials[material] ?? 0;
    if (have < need * times) throw new Error(`missing material ${material}: need ${need * times}, have ${have}`);
  }
  const materials = { ...state.materials };
  for (const [material, need] of Object.entries(recipe.materials)) materials[material] -= need * times;
  if (recipe.output_is_material) {
    materials[recipe.output] = (materials[recipe.output] ?? 0) + recipe.output_count * times;
  }
  return {
    ...state,
    materials,
    output: recipe.output_is_material
      ? state.output
      : { ...state.output, [recipe.output]: state.output[recipe.output] + recipe.output_count * times },
    crafts_remaining: state.crafts_remaining - times,
  };
}
export function apply(intent: string, payload: Record<string, unknown>, state: CraftingState): CraftingState {
  switch (intent) {
    case "crafting.craft": return craft(state, String(payload.recipe_id), Number(payload.times ?? 1));
    default:
      if (intent.startsWith("crafting.craft.")) return craft(state, intent.slice("crafting.craft.".length), Number(payload.times ?? 1));
      throw new Error(`unhandled intent: ${intent}`);
  }
}
export function sequence() {
  return [
    { intent: "crafting.craft.r_health_potion", payload: { recipe_id: "r_health_potion", times: 1 }, source_node_key: "craft-r_health_potion", label: "craft health potion (herb-2 water-1)" },
    { intent: "crafting.craft.r_iron_ingot", payload: { recipe_id: "r_iron_ingot", times: 1 }, source_node_key: "craft-r_iron_ingot", label: "craft iron ingot (ore-3 coal-1) reflux to material" },
    { intent: "crafting.craft.r_steel_sword", payload: { recipe_id: "r_steel_sword", times: 1, _reject_expected: true }, source_node_key: "craft-r_steel_sword", label: "steel sword should FAIL (need 2 ingots, have 1)" },
    { intent: "crafting.craft.r_iron_ingot", payload: { recipe_id: "r_iron_ingot", times: 1 }, source_node_key: "craft-r_iron_ingot", label: "craft 2nd iron ingot" },
    { intent: "crafting.craft.r_steel_sword", payload: { recipe_id: "r_steel_sword", times: 1 }, source_node_key: "craft-r_steel_sword", label: "craft steel sword (ingot-2 wood-1)" },
  ];
}
export function expectedFinal() {
  return {
    materials: { herb: 3, water: 3, iron_ore: 0, coal: 0, iron_ingot: 0, wood: 2 },
    output: { health_potion: 1, iron_ingot: 0, steel_sword: 1 },
    crafts_remaining: 1,
  };
}
export function stateOf(state: CraftingState) {
  return {
    materials: { ...state.materials },
    output: { ...state.output },
    crafts_remaining: state.crafts_remaining,
  };
}
