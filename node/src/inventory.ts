import {NeonApp, ObservableStore, DragSpec} from "@neon3/sdk";
import {initialItems, expand, collapse, moveItems} from "./domain.js";
import {inventoryFlow} from "./flow.js";

export function configure(app:NeonApp, store:ObservableStore) {
  const items=store.collection("items"); items.setKeyOf((item:any)=>item.key); items.replace(initialItems()); items.markApplied();
  const selection=store.selection("items");
  app.intent("inventory.item.select")((event:any)=>{const id=event.payload.item_id?.value??event.payload.item_id; items.get(id); selection.set(id); store.value("selected_item").set(id);});
  app.intent("inventory.capacity.expand")(()=>{const value=store.value("capacity").get() as any; store.value("capacity").set(expand[value.value as keyof typeof expand]);});
  app.intent("inventory.capacity.collapse")(()=>{const value=store.value("capacity").get() as any; store.value("capacity").set(collapse[value.value as keyof typeof collapse]);});
  app.intent("inventory.item.move")((event:any)=>{const capacity=(store.value("capacity").get() as any).value; items.replace(moveItems(items.items,event.payload.item_id,event.payload.source_slot,event.payload.target_slot,capacity));});
  return {items,selection};
}
export async function createApp(options:any={}) { const store=new ObservableStore({capacity:"small",enabled:true}); const version=options.runtimeVersion??process.env.NEON3_RUNTIME_VERSION??"latest"; const neonRoot=options.neonRoot??(version!=="latest"?`${process.env.LOCALAPPDATA}/Neon3Sdk/runtime/${version}`:undefined); const app=await NeonApp.start({mode:"windowed",origin:"neon3-inventory-node",store,...options,...(neonRoot?{neonRoot}:{})}); const refs=configure(app,store); await app.ui.mountFlow(inventoryFlow()); return {app,store,refs}; }

if (process.argv[1]?.endsWith("inventory.js")) {
  const {app}=await createApp();
  process.once("SIGINT",()=>void app.stop());
}
