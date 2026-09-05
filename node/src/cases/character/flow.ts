// Case 5: character NUI Flow source (stat rows with totals, allocate/deallocate).
export function flow(): string {
  const stats = ["strength", "agility", "intellect", "vitality"].map((key, index) => `    panel stat-${key} row w 520 h 46 gap 8 pad 6 fill #22313D line #4E6A7F radius 4
      text stat-label-${key} value "属性 ${key}" w 100
      text stat-base-label-${key} value "基础" w 34
      text stat-base-${key} value "5" w 32
      text stat-equip-label-${key} value "装备+" w 40
      text stat-equip-${key} value "0" w 32
      text stat-total-label-${key} value "合计" w 34
      text stat-total-${key} value "5" w 32
      button alloc-${key} h 30 w 52 value "+" event character.allocate.${key}
      button dealloc-${key} h 30 w 52 value "-" event character.deallocate.${key}`).join("\n");
  return `version 1
surface surface.character-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input level i32 default 1
input unspent_points i32 default 8
input strength_base i32 default 5
input agility_base i32 default 5
input intellect_base i32 default 5
input vitality_base i32 default 5
input strength_equip i32 default 2
input agility_equip i32 default 0
input intellect_equip i32 default 3
input vitality_equip i32 default 1
input strength_total i32 default 7
input agility_total i32 default 5
input intellect_total i32 default 8
input vitality_total i32 default 6
input enabled bool default true
flow character-lab
surface character-demo overlay w 640 h 480 fill #17212B
  panel character-panel column x 40 y 40 w 560 h 400 gap 10 pad 16 fill #1C2A35 line #4E6A7F radius 6
    panel character-header row w 520 h 40 gap 8 align center
      text character-title value "角色属性" h 28
      text character-level-label value "等级" h 24
      text character-level value "1" h 24
      text character-points-label value "可用点数" h 24
      text character-points value "8" h 24
${stats}
    text character-hint value "加点受上限约束；装备加成实时叠加" h 24
`;
}
