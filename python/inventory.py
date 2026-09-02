"""Standalone Neon3 inventory interaction example."""

from __future__ import annotations

import argparse
import json
import os
import socket
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from neon3_sdk import NeonApp, ObservableStore, RuntimeEndpoints, RuntimeMode
from neon3_sdk import DragSpec
from domain import CAPACITY_SLOTS, COLLAPSE, EXPAND, initial_items, move_items


def _emit(event: str, **data: object) -> None:
    print(json.dumps({"event": event, **data}, ensure_ascii=False), flush=True)


def _free_endpoint() -> str:
    with socket.socket() as stream:
        stream.bind(("127.0.0.1", 0))
        return f"127.0.0.1:{stream.getsockname()[1]}"


ASSET_ROOT = Path(__file__).resolve().parents[1] / "assets"


ASSETS = {
    "slot": "UI_Slot_Selected.png",
    "apple": "Icon_Consumable_Apple.png",
    "hammer": "Icon_Tool_RepairHammer.png",
    "progress_bg": "UI_Progress_Style2_Bg.png",
    "tooltip_badge": "frame_023.png",
}

SLOT_COLUMNS = 4
MIN_SLOT_COUNT = 16
MAX_SLOT_COUNT = 24
SLOT_SIZE = 72
SLOT_GAP = 10


def _slot_declarations() -> str:
    """Generate one uniform 4-column slot declaration per bounded slot ID."""
    rows: list[str] = []
    for row in range(MAX_SLOT_COUNT // SLOT_COLUMNS):
        slot_nodes = "\n".join(
            f"        panel slot-{slot_id:02d} overlay w {SLOT_SIZE} h {SLOT_SIZE} frame slot nine_slice 12 12 12 12 border 8 8 8 8 mode stretch fill_center true"
            for slot_id in range(row * SLOT_COLUMNS + 1, row * SLOT_COLUMNS + SLOT_COLUMNS + 1)
        )
        rows.append(
            f"      panel slot-row-{row + 1:02d} row w 328 h 72 gap {SLOT_GAP} visible $row_{row + 1}_visible\n{slot_nodes}"
        )
    return "\n".join(rows)


def _slot_drop_declarations() -> str:
    return "\n".join(
        f"drop {item}-from-{source_slot:02d}-to-{target_slot:02d} target slot-{target_slot:02d} accepts {item}-drag-{source_slot:02d} placement into emit inventory.item.move"
        for item in ("apple", "hammer")
        for source_slot in range(1, MAX_SLOT_COUNT + 1)
        for target_slot in range(1, MAX_SLOT_COUNT + 1)
    )


def _item_input_declarations() -> str:
    return "\n".join(
        f"input {item}_in_slot_{slot_id:02d} bool default {str(slot_id == initial_slot).lower()}"
        for item, initial_slot in (("apple", 1), ("hammer", 2))
        for slot_id in range(1, MAX_SLOT_COUNT + 1)
    )


def _item_declarations() -> str:
    rows: list[str] = []
    item_tooltips = {
        "apple": ("治疗苹果", "消耗品 · 普通", "恢复 25 点生命值"),
        "hammer": ("维修锤", "工具 · 精良", "修复装备耐久度"),
    }
    for item, resource in (("apple", "apple"), ("hammer", "hammer")):
        for slot_id in range(1, MAX_SLOT_COUNT + 1):
            column = (slot_id - 1) % SLOT_COLUMNS
            row = (slot_id - 1) // SLOT_COLUMNS
            x = column * (SLOT_SIZE + SLOT_GAP) + 8
            y = row * (SLOT_SIZE + SLOT_GAP) + 8
            rows.append(
                f"      image {item}-icon-{slot_id:02d} resource {resource} x {x} y {y} w 56 h 56 visible ${item}_in_slot_{slot_id:02d}"
            )
            name, rarity, description = item_tooltips[item]
            rich_header = json.dumps(json.dumps([
                {"value": name, "color": [1.0, 0.88, 0.54, 1.0], "scale": 1.15},
                {"value": "  " + rarity, "color": [0.55, 0.88, 1.0, 1.0], "scale": 0.9},
            ], ensure_ascii=False), ensure_ascii=False)
            rows.extend([
                    f"        tooltip {item}-tooltip-{slot_id:02d} x 64 y -6 w 246 h 126 column gap 4 pad 14 frame progress_bg nine_slice 12 12 12 12 border 12 12 12 12 mode stretch fill_center true",
                    f"          panel {item}-tooltip-header-{slot_id:02d} row h 28 gap 6 align center",
                    f"            image {item}-tooltip-emblem-{slot_id:02d} resource tooltip_badge w 18 h 18",
                    f"            text {item}-tooltip-rich-{slot_id:02d} rich {rich_header}",
                    f"          panel {item}-tooltip-divider-{slot_id:02d} h 1 fill #E6C36A opacity 0.65",
                    f"          text {item}-tooltip-description-{slot_id:02d} value \"{description}\"",
                    f"          text {item}-tooltip-meta-{slot_id:02d} value \"可拖拽物品\"",
            ])
    return "\n".join(rows)


def _item_drag_declarations() -> str:
    return "\n".join(
        f"drag {item}-drag-{slot_id:02d} source {item}-icon-{slot_id:02d} axis both snap 8 threshold 3 within surface"
        for item in ("apple", "hammer")
        for slot_id in range(1, MAX_SLOT_COUNT + 1)
    )


def asset_path(asset_root: Path, asset: str | Path) -> Path:
    return asset if isinstance(asset, Path) else asset_root / asset


def image_upload(asset_id: str, path: Path) -> dict[str, Any]:
    """Read one repository-bundled PNG and upload it via the public RPC."""
    encoded = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError(f"cannot decode bundled asset: {path.name}")
    if image.ndim == 2:
        image = cv2.cvtColor(image, cv2.COLOR_GRAY2RGBA)
    elif image.shape[2] == 4:
        image = cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA)
    else:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGBA)
    height, width = image.shape[:2]
    return {"source": {"image_id": asset_id, "media_type": "application/x-neon-rgba8", "width": int(width), "height": int(height), "bytes": image.reshape(-1).tolist()}}


_INVENTORY_FLOW_TEMPLATE = r'''version 1
surface surface.inventory-demo revision 1
budget nodes=512 bindings=80 instances=512 text=384 glyphs=4096 events=1200 clips=512
input capacity enum:small|medium|large default small
input item_grid grid default grid:empty
input enabled bool default true
input selected_item enum:apple|hammer default apple
input medium_visible bool default false
input large_visible bool default false
input row_1_visible bool default true
input row_2_visible bool default true
input row_3_visible bool default true
input row_4_visible bool default true
input row_5_visible bool default false
input row_6_visible bool default false
{item_input_declarations}
resource slot image
resource apple image
resource hammer image
resource progress_bg image
resource tooltip_badge image
flow inventory-lab
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
style bag.small.backpack x 430 y 170 w 420 h 420
style bag.medium.backpack x 430 y 170 w 420 h 510
style bag.large.backpack x 430 y 170 w 420 h 600
{item_drag_declarations}
{slot_drop_declarations}
surface inventory-demo overlay w 1440 h 900 fill #17212B
  panel backpack column x 430 y 170 w 420 h 420 gap 12 pad 16 frame progress_bg nine_slice 12 12 12 12 border 12 12 12 12 mode stretch fill_center true
    panel header row h 44 pad 8 align center fill #2A3B48 line #6A8FA8 radius 4
      text title value "冒险者背包"
      branch capacity-small-label when $capacity=small
        text capacity-label-small value "容量 16 / 16"
      branch capacity-medium-label when $capacity=medium
        text capacity-label-medium value "容量 16 / 20"
      branch capacity-large-label when $capacity=large
        text capacity-label-large value "容量 16 / 24"
    panel inventory-grid column w 356 gap 10 pad 10 align center
{slot_declarations}
{item_declarations}
    panel footer row h 36 pad 8 fill #22313D line #4E6A7F radius 4
      text drag-hint value "拖动物品图标到空格"
    panel inventory-controls column x 900 y 270 w 250 h 260 gap 12 pad 18 fill #1C2A35 line #4E6A7F radius 6
    text controls-title value "背包容量"
    text controls-subtitle value "每次调整 4 格"
    button expand-button h 42 enabled $enabled value "扩大 4 格" event inventory.capacity.expand
      button collapse-button h 42 enabled $enabled value "减少 4 格" event inventory.capacity.collapse
      button select-apple h 28 value "选择苹果" event inventory.item.select
      button move-apple h 28 value "移动苹果" event inventory.item.move
    text controls-min value "最少 4 × 4"
'''

INVENTORY_FLOW = _INVENTORY_FLOW_TEMPLATE.format(
    item_input_declarations=_item_input_declarations(),
    item_drag_declarations=_item_drag_declarations(),
    item_declarations=_item_declarations(),
    slot_declarations=_slot_declarations(),
    slot_drop_declarations=_slot_drop_declarations(),
)


def _configure_app(app: NeonApp, store: ObservableStore) -> None:
    items = store.collection("items"); items.set_key_of(lambda item: item["key"]); items.replace(initial_items()); items.mark_applied()
    selection = store.selection("items")

    def publish_item_slots() -> None:
        occupied = {item["key"]: item["slot_key"] for item in items.items}
        for item_key in ("apple", "hammer"):
            for slot_number in range(1, MAX_SLOT_COUNT + 1):
                store.value(f"{item_key}_in_slot_{slot_number:02d}").set(occupied[item_key] == f"slot-{slot_number:02d}")

    def register_drag_catalog() -> None:
        catalog: dict[str, dict[str, Any]] = {}
        for item in items.items:
            slot = item["slot_key"]
            drag_keys = (f"{item['key']}-drag-{slot[5:]}", f"{item['key']}-icon-{slot[5:]}")
            for drag_key in drag_keys:
                catalog[drag_key] = item
            app.ui.drag_source(drag_keys[0], lambda value, item=item: {
                "item_id": item["key"], "source_slot": item["slot_key"], "kind": f"{item['kind']}-drag",
            }, kind_of=lambda value, item=item: f"{item['kind']}-drag")
            app.ui.drag_source(drag_keys[1], lambda value, item=item: {
                "item_id": item["key"], "source_slot": item["slot_key"], "kind": f"{item['kind']}-drag",
            }, kind_of=lambda value, item=item: f"{item['kind']}-drag")
        app.router.catalog(catalog)

    for slot_number in range(1, MAX_SLOT_COUNT + 1):
        app.ui.drop_target(f"slot-{slot_number:02d}", "inventory.item.move", accepts=("consumable-drag", "tool-drag"))
    register_drag_catalog()
    @app.intent("inventory.item.select")
    def select(event: Any) -> None:
        item_id = event.payload.get("item_id", {}).get("value", event.payload.get("item_id"))
        if items.get(item_id) is None: raise ValueError(f"unknown item: {item_id}")
        selection.set(item_id)
        store.value("selected_item").set(item_id)
    @app.intent("inventory.capacity.expand")
    def expand(_event: Any) -> None: store.value("capacity").set(EXPAND[store.value("capacity").get()["value"]])
    @app.intent("inventory.capacity.collapse")
    def collapse(_event: Any) -> None: store.value("capacity").set(COLLAPSE[store.value("capacity").get()["value"]])
    @app.intent("inventory.item.move")
    def move(event: Any) -> None:
        payload = {key: (value.get("value") if isinstance(value, dict) else value) for key, value in event.payload.items()}
        payload.setdefault("target_slot", getattr(event, "target_key", ""))
        capacity = store.value("capacity").get()["value"]
        result = move_items(items.items, payload["item_id"], payload["source_slot"], payload["target_slot"], capacity)
        items.replace(result)
        publish_item_slots()
        register_drag_catalog()

def _state(store: ObservableStore) -> dict[str, Any]:
    scalar = lambda key: store.value(key).get()["value"]
    return {"capacity": scalar("capacity"), "apple_slot": next(i["slot_key"] for i in store.collection("items").items if i["key"] == "apple"), "hammer_slot": next(i["slot_key"] for i in store.collection("items").items if i["key"] == "hammer"), "selected": store.selection("items").get()}

def run_probe(app: NeonApp, store: ObservableStore, out: Path) -> int:
    run_id = "inventory-python-fixed"
    enum = lambda value: {"kind": "enum", "value": value}
    sequence = [("inventory.item.select", {"item_id": enum("apple")}), ("inventory.capacity.expand", {}), ("inventory.item.move", {"item_id": enum("apple"), "source_slot": enum("slot-01"), "target_slot": enum("slot-05"), "placement": enum("into")}), ("inventory.capacity.expand", {}), ("inventory.capacity.collapse", {})]
    records = []
    for number, (intent, payload) in enumerate(sequence, 1):
        source_node = "select-apple" if intent == "inventory.item.select" else ("move-apple" if intent == "inventory.item.move" else ("collapse-button" if intent.endswith("collapse") else "expand-button"))
        event = app.session.build_intent_event(intent, payload, source_node_key=source_node)
        before = app.session.input_revision
        try:
            result = app.session.dispatch_intent(intent, payload, source_node_key=source_node, event_id=event["event_id"])
        except Exception as error:
            if "stale" not in str(error).lower(): raise
            result = app.session.dispatch_intent(intent, payload, source_node_key=source_node)
        record = {"run_id": run_id, "stage": "intent.produced", "sequence": number, "input": {"intent": intent, **payload}, "producer": {"event_id": event["event_id"], "input_revision": before, "renderer_epoch": event["interaction"]["renderer_epoch"]}, "consumer": {"input_revision": app.session.input_revision, "state": _state(store)}, "pairing": {"event_id": event["event_id"], "status": "matched"}, "result": result.status, "pass_result": result.status == "accepted"}
        print(json.dumps(record, ensure_ascii=False), flush=True); records.append(record)
    passed = all(record["pass_result"] for record in records) and _state(store) == {"capacity": "medium", "apple_slot": "slot-05", "hammer_slot": "slot-02", "selected": "apple"}
    print(json.dumps({"run_id": run_id, "stage": "completed", "result": "passed" if passed else "failed", "pass_result": passed}, ensure_ascii=False), flush=True)
    return 0 if passed else 1

def launch(neon_root: Path | None, probe: bool = False, out: Path | None = None) -> int:
    endpoints = RuntimeEndpoints(eventd=_free_endpoint(), ui=_free_endpoint(), wgpu=_free_endpoint())
    domain_endpoint = _free_endpoint()
    store = ObservableStore({"capacity": "small", "enabled": True, "medium_visible": False, "large_visible": False})
    app = None
    try:
        if any(not asset_path(ASSET_ROOT, filename).is_file() for filename in ASSETS.values()):
            raise FileNotFoundError(f"missing bundled inventory asset under {ASSET_ROOT}")
        app = NeonApp.start(mode="windowed", origin="neon3-inventory-python", neon_root=neon_root, profile=os.environ.get("NEON_PROFILE", "auto"), endpoints=endpoints, domain_endpoint=domain_endpoint, store=store, timeout_seconds=30.0)
        _configure_app(app, store)
        app.serve(block=False)
        with app:
            rpc = app.client
            for sequence, (asset_id, filename) in enumerate(ASSETS.items(), start=1):
                rpc.call("ui-runtime", "ui.image.upload", image_upload(asset_id, asset_path(ASSET_ROOT, filename)), idempotency_key=f"inventory-upload-{sequence}")
            program = app.ui.mount_flow(INVENTORY_FLOW, idempotency_key="inventory-demo-flow-v1")
            _emit("inventory.flow.submitted", surface_id=program.surface_id, program_revision=program.program_revision.to_wire(), assets=list(ASSETS), pass_result=True)
            if probe:
                return run_probe(app, store, out or Path("inventory-demo.png"))
            app.ui.bind("item-data", store.collection("items"), columns=lambda item: {"slot": {"value": int(item["slot_key"][5:]), "display": {"id": int(item["slot_key"][5:]), "generation": 1}}}, selection=store.selection("items"), drag=DragSpec("inventory.item.move", lambda item: {"item_id": item["key"], "source_slot": item["slot_key"], "kind": f"{item['kind']}-drag"}), fallback="list")
            _emit("inventory.running", endpoint=endpoints.wgpu, status="拖拽苹果或锤子；点击扩大背包容量")
            while True:
                rpc.health("ui-runtime")
    except KeyboardInterrupt:
        _emit("inventory.completed", status="stopped")
        return 0
    except Exception as error:
        _emit("inventory.completed", status="failed", error=str(error))
        return 1
    finally:
        if app is not None: app.stop()


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch Neon3 inventory drag and nine-slice demo")
    parser.add_argument("--probe", action="store_true", help="run deterministic verification and exit")
    parser.add_argument("--out", type=Path, default=Path("inventory-demo.png"), help="capture output used by --probe")
    parser.add_argument("--neon3", type=Path, default=None, help="optional Neon3 checkout; otherwise use NEON_ROOT or online latest")
    args = parser.parse_args()
    return launch(args.neon3, probe=args.probe, out=args.out)


if __name__ == "__main__":
    raise SystemExit(main())
