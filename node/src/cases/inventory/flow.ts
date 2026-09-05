// Case 1: inventory NUI Flow source (grid, capacity state machine, drag/drop intents).
export function flow(): string {
  const rows: string[] = [];
  const itemInputs: string[] = [];
  const itemImages: string[] = [];
  const dragDeclarations: string[] = [];
  const dropDeclarations: string[] = [];
  for (const [item, initialSlot] of [["apple", 1], ["hammer", 2]] as const) {
    for (let slot = 1; slot <= 24; slot += 1) {
      const slotKey = slot.toString().padStart(2, "0");
      itemInputs.push(`input ${item}_in_slot_${slotKey} bool default ${slot === initialSlot ? "true" : "false"}`);
      const col = (slot - 1) % 4;
      const row = Math.floor((slot - 1) / 4);
      itemImages.push(`      image ${item}-icon-${slotKey} resource ${item} x ${col * 82 + 8} y ${row * 82 + 8} w 56 h 56 visible $${item}_in_slot_${slotKey}`);
      dragDeclarations.push(`drag ${item}-drag-${slotKey} source ${item}-icon-${slotKey} axis both snap 8 threshold 3 within surface`);
      for (let target = 1; target <= 24; target += 1) {
        const targetKey = target.toString().padStart(2, "0");
        dropDeclarations.push(`drop ${item}-from-${slotKey}-to-${targetKey} target slot-${targetKey} accepts ${item}-drag-${slotKey} placement into emit inventory.item.move`);
      }
    }
  }
  for (let row = 0; row < 6; row += 1) {
    const slots: string[] = [];
    for (let col = 1; col <= 4; col += 1) {
      const id = row * 4 + col;
      slots.push(`        panel slot-${id.toString().padStart(2, "0")} overlay w 72 h 72 fill #263B49 line #6A8FA8 radius 4 frame slot nine_slice 12 12 12 12 border 8 8 8 8 mode stretch fill_center true`);
    }
    rows.push(`      panel slot-row-${String(row + 1).padStart(2, "0")} row w 328 h 72 gap 10 visible $row_${row + 1}_visible\n${slots.join("\n")}`);
  }
  return `version 1
surface surface.inventory-demo revision 1
budget nodes=512 bindings=80 instances=512 text=384 glyphs=4096 events=1200 clips=512
input capacity enum:small|medium|large default small
input enabled bool default true
input selected_item enum:apple|hammer default apple
input row_1_visible bool default true
input row_2_visible bool default true
input row_3_visible bool default true
input row_4_visible bool default true
input row_5_visible bool default false
input row_6_visible bool default false
${itemInputs.join("\n")}
resource slot image
resource apple image
resource hammer image
flow inventory-lab
${dragDeclarations.join("\n")}
${dropDeclarations.join("\n")}
motion bag-expand duration 360 easing ease_out
motion bag-collapse duration 240 easing ease_in_out
machine bag initial small
state bag medium
state bag large
on bag inventory.capacity.expand when $capacity=small -> medium emit inventory.capacity.expand
on bag inventory.capacity.expand when $capacity=medium -> large emit inventory.capacity.expand
on bag inventory.capacity.collapse when $capacity=medium -> small emit inventory.capacity.collapse
on bag inventory.capacity.collapse when $capacity=large -> medium emit inventory.capacity.collapse
transition bag small -> medium motion bag-expand
transition bag medium -> large motion bag-expand
transition bag medium -> small motion bag-collapse
transition bag large -> medium motion bag-collapse
style bag.small.backpack x 360 y 120 w 420 h 500
style bag.medium.backpack x 360 y 120 w 420 h 580
style bag.large.backpack x 360 y 120 w 420 h 660
surface inventory-demo overlay w 1440 h 900 fill #17212B
  panel backpack column x 360 y 120 w 420 h 500 gap 12 pad 16 frame slot nine_slice 12 12 12 12 border 12 12 12 12 mode stretch fill_center true
    panel header row h 44 pad 8 align center fill #2A3B48 line #6A8FA8 radius 4
      text title value "冒险者背包"
      branch capacity-small-label when $capacity=small
        text capacity-label-small value "容量 16 / 16"
      branch capacity-medium-label when $capacity=medium
        text capacity-label-medium value "容量 16 / 20"
      branch capacity-large-label when $capacity=large
        text capacity-label-large value "容量 16 / 24"
    panel inventory-grid column w 356 gap 10 pad 10 align center
${rows.join("\n")}
${itemImages.join("\n")}
    panel footer row h 36 pad 8 fill #22313D line #4E6A7F radius 4
      text drag-hint value "拖动物品图标到空格"
  panel inventory-controls column x 900 y 270 w 250 h 220 gap 12 pad 18 fill #1C2A35 line #4E6A7F radius 6
    text controls-title value "背包容量"
    text controls-subtitle value "每次调整 4 格"
    button expand-button h 42 enabled $enabled value "扩大 4 格" event inventory.capacity.expand
    button collapse-button h 42 enabled $enabled value "减少 4 格" event inventory.capacity.collapse
    button select-apple h 28 value "选择苹果" event inventory.item.select
    button move-apple h 28 value "移动苹果" event inventory.item.move
    text controls-min value "最少 4 × 4"
`;
}
