// Case 7: equipment NUI Flow source (slot grid, bag rows, equip/unequip).
export function flow(): string {
  const slots = SLOTS.map((slot, index) =>
    `    panel equip-slot-${slot.key} row w 600 h 44 gap 6 pad 6 fill #22313D line #4E6A7F radius 4
      text equip-slot-label-${slot.key} value "槽位 ${slot.label}" w 90
      branch equip-slot-filled-${slot.key} when $${slot.key}_item_equipped
        text equip-slot-item-${slot.key} value "已装备" w 420
      branch equip-slot-empty-${slot.key} when $${slot.key}_item_empty
        text equip-slot-item-${slot.key}-empty value "空" w 420
      button unequip-${slot.key} h 28 w 52 value "卸下" event equipment.unequip.${slot.key}`).join("\n");
  const bag = ["iron_sword", "leather_helm", "steel_chest", "oak_shield", "two_hand_sword", "cloth_legs"].map((key, index) =>
    `    panel bag-${key} row w 600 h 40 gap 6 pad 6 fill #22313D line #4E6A7F radius 4
      text bag-item-${key} value "物品 ${key}" w 520
      button equip-${key} h 28 w 52 value "穿戴" event equipment.equip.${key}`).join("\n");
  return `version 1
surface surface.equipment-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input total_power i32 default 12
input head_item_equipped bool default false
input head_item_empty bool default true
input chest_item_equipped bool default false
input chest_item_empty bool default true
input weapon_item_equipped bool default true
input weapon_item_empty bool default false
input offhand_item_equipped bool default false
input offhand_item_empty bool default true
input legs_item_equipped bool default false
input legs_item_empty bool default true
input enabled bool default true
flow equipment-lab
surface equipment-demo overlay w 720 h 760 fill #17212B
  panel equipment-panel column x 40 y 40 w 640 h 700 gap 10 pad 16 fill #1C2A35 line #4E6A7F radius 6
    panel equipment-header row w 600 h 40 gap 8 align center
      text equipment-title value "装备栏" h 28
      text equipment-power-label value "总战力" h 24
      text equipment-power value "12" h 24
${slots}
    text equipment-bag-title value "背包" h 24
${bag}
`;
}
export const SLOTS = [
  { key: "head", label: "头盔" },
  { key: "chest", label: "胸甲" },
  { key: "weapon", label: "武器" },
  { key: "offhand", label: "副手" },
  { key: "legs", label: "腿甲" },
];
