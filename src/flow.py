"""The smallest useful inventory Flow example."""

FLOW = '''version 1
surface surface.inventory-case revision 1
budget nodes=32 bindings=8 instances=64 text=32 glyphs=512 events=8 clips=32
input capacity enum:small|medium|large default small
input enabled bool default true
resource panel image
resource slot image
flow inventory-case
surface inventory-case overlay w 900 h 600 fill #17212B
  panel backpack column x 180 y 100 w 420 h 420 gap 12 pad 16 frame panel nine_slice 12 12 12 12 border 12 12 12 12 mode stretch fill_center true
    panel header row h 44 pad 8 fill #2A3B48
      text title value "冒险者背包"
      text capacity value "容量 16 / 16"
    panel grid row gap 10
      image slot-01 resource slot w 72 h 72
      image slot-02 resource slot w 72 h 72
      image slot-03 resource slot w 72 h 72
      image slot-04 resource slot w 72 h 72
    button expand h 42 enabled $enabled value "扩大 4 格" event inventory.capacity.expand
'''
