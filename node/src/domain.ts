export type Capacity = "small" | "medium" | "large";
export type InventoryItem = {key:string; kind:string; name:string; slot_key:string|null; rarity:string; description:string};
export const capacities: Record<Capacity, number> = {small:16, medium:20, large:24};
export const expand: Record<Capacity, Capacity> = {small:"medium", medium:"large", large:"large"};
export const collapse: Record<Capacity, Capacity> = {small:"small", medium:"small", large:"medium"};
export function initialItems(): InventoryItem[] { return [{key:"apple",kind:"consumable",name:"Apple",slot_key:"slot-01",rarity:"common",description:"Restores 25 health"},{key:"hammer",kind:"tool",name:"Repair Hammer",slot_key:"slot-02",rarity:"rare",description:"Repairs equipment durability"}]; }
function slotNumber(slot:string): number { if (!/^slot-\d{2}$/.test(slot)) throw new Error(`invalid slot key: ${slot}`); const n=Number(slot.slice(5)); if(n<1||n>24) throw new Error(`invalid slot key: ${slot}`); return n; }
export function moveItems(items:InventoryItem[], itemId:string, source:string, target:string, capacity:Capacity):InventoryItem[] { const sourceN=slotNumber(source); const targetN=slotNumber(target); if(targetN>capacities[capacity]) throw new Error("drop target is outside the active capacity"); const item=items.find(i=>i.key===itemId); if(!item||item.slot_key!==source) throw new Error("drag source does not own the declared item"); return items.map(i=>i.key===itemId?{...i,slot_key:target}:i.slot_key===target?{...i,slot_key:`slot-${sourceN.toString().padStart(2,"0")}`}: {...i}); }
export function stateOf(capacity:Capacity, items:InventoryItem[], selected:string|null) { return {capacity,apple_slot:items.find(i=>i.key==="apple")?.slot_key,hammer_slot:items.find(i=>i.key==="hammer")?.slot_key,selected}; }
