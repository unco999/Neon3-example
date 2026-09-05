// Case 2: shop NUI Flow source (catalog rows, buy/sell buttons, sold-out branches).
export function flow(): string {
  const rows = ["health_potion", "mana_potion", "iron_sword"].map((key, index) => `    panel shop-row-${index + 1} row w 320 h 48 gap 8 pad 6 fill #22313D line #4E6A7F radius 4
      text shop-name-${key} value "${key}" w 120
      branch shop-stock-${key}-ok when $stock_${key}_ok
        button buy-${key} h 32 w 64 value "购买" event shop.item.buy
      branch shop-stock-${key}-out when $stock_${key}_out
        text soldout-${key} value "售罄" w 64
      button sell-${key} h 32 w 64 value "出售" event shop.item.sell`).join("\n");
  return `version 1
surface surface.shop-demo revision 1
budget nodes=256 bindings=40 instances=256 text=192 glyphs=2048 events=600 clips=256
input gold i32 default 500
input stock_health_potion_ok bool default true
input stock_health_potion_out bool default false
input stock_mana_potion_ok bool default true
input stock_mana_potion_out bool default false
input stock_iron_sword_ok bool default true
input stock_iron_sword_out bool default false
input enabled bool default true
flow shop-lab
surface shop-demo overlay w 800 h 520 fill #17212B
  panel shop-panel column x 40 y 40 w 720 h 440 gap 10 pad 16 fill #1C2A35 line #4E6A7F radius 6
    text shop-title value "杂货铺" h 36
    text shop-gold-label value "金币" h 24
    text shop-gold value "500" h 24
${rows}
    panel shop-footer row w 680 h 40 gap 8 pad 8 align center
      button restock-button h 34 value "补货" event shop.restock
      text shop-hint value "购买扣除金币；售罄商品禁用购买" h 24
`;
}
