// Case 8: crafting NUI Flow source (recipe cards with material counts, craft buttons).
export function flow(): string {
  const recipes = RECIPES.map((recipe, index) =>
    `    panel recipe-${recipe.key} row w 560 h 46 gap 8 pad 6 fill #22313D line #4E6A7F radius 4
      text recipe-name-${recipe.key} value "配方 ${recipe.name}" w 120
      text recipe-mats-${recipe.key} value "材料: ${recipe.materials_desc}" w 220
      text recipe-count-${recipe.key} value "x${recipe.output_count}" w 40
      button craft-${recipe.key} h 30 w 60 value "合成" event crafting.craft.${recipe.key}`).join("\n");
  return `version 1
surface surface.crafting-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input crafts_remaining i32 default 3
input herb_count i32 default 5
input water_count i32 default 4
input iron_ore_count i32 default 6
input coal_count i32 default 2
input wood_count i32 default 3
input iron_ingot_count i32 default 0
input health_potion_count i32 default 0
input steel_sword_count i32 default 0
input enabled bool default true
flow crafting-lab
surface crafting-demo overlay w 680 h 480 fill #17212B
  panel crafting-panel column x 40 y 40 w 600 h 400 gap 10 pad 16 fill #1C2A35 line #4E6A7F radius 6
    panel crafting-header row w 560 h 40 gap 8 align center
      text crafting-title value "合成台" h 28
      text crafting-limit-label value "剩余次数" h 24
      text crafting-limit value "5" h 24
${recipes}
    panel crafting-mats row w 560 h 40 gap 8 align center fill #22313D line #4E6A7F radius 4
      text mats-line-label value "材料" h 22
    text crafting-output-label value "产出" h 22
    text crafting-health-potion value "0" h 22
    text crafting-output-separator value "·" h 22
    text crafting-steel-sword value "0" h 22
`;
}
export const RECIPES = [
  { key: "r_health_potion", name: "生命药水", materials_desc: "草药x2 水x1", output_count: 1 },
  { key: "r_iron_ingot", name: "铁锭", materials_desc: "铁矿x3 煤x1", output_count: 1 },
  { key: "r_steel_sword", name: "钢剑", materials_desc: "铁锭x2 木材x1", output_count: 1 },
];
