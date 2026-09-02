export function inventoryFlow(): string { return `version 1
surface surface.inventory-demo revision 1
budget nodes=128 bindings=16 instances=64 text=64 glyphs=512 events=64 clips=32
input capacity enum:small|medium|large default small
input enabled bool default true
input selected_item enum:apple|hammer default apple
flow inventory-lab
surface inventory-demo overlay w 640 h 480 fill #17212B
  panel backpack column x 40 y 40 w 420 h 360 fill #22313D
    text title value "冒险者背包"
    text capacity-label value "容量"
  button expand-button h 42 enabled $enabled value "扩大 4 格" event inventory.capacity.expand
  button collapse-button h 42 enabled $enabled value "减少 4 格" event inventory.capacity.collapse
  button select-apple h 28 value "选择苹果" event inventory.item.select
  button move-apple h 28 value "移动苹果" event inventory.item.move
`; }
