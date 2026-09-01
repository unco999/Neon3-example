"""Standalone Neon3 inventory interaction example."""

from __future__ import annotations

import argparse
import json
import os
import socket
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from neon3_sdk import NeonClient, RuntimeConfig, RuntimeEndpoints, RuntimeMode, RuntimeSession, UiClient
from neon3_sdk.calculator import CalculatorServer, _response


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


def _input_revision(client: NeonClient) -> tuple[int, dict[str, Any]]:
    snapshot = client.call("ui-runtime", "debug.ui.host.snapshot").result
    values = {key: value["value"]["value"] for key, value in snapshot["scalar_inputs"]["values"].items()}
    return int(snapshot["scalar_inputs"]["input_revision"]), values


def _event(intent: str, source: str, program_revision: dict[str, Any], input_revision: int) -> dict[str, Any]:
    event_id = str(uuid.uuid4())
    return {
        "event_id": event_id, "kind": "activate", "intent": intent,
        "source_node_key": source, "payload": {}, "program_revision": program_revision,
        "input_revision": input_revision, "request_id": event_id,
        "idempotency_key": f"inventory-case-event:{event_id}",
        "interaction": {"interaction_id": event_id, "sequence": input_revision + 1, "renderer_epoch": 1},
    }


def _non_background(path: Path) -> int:
    """Decode capture bytes so Windows extended-length paths also work."""
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return 0
    blue, green, red = cv2.split(image)
    return int(((red > 40) | (green > 55) | (blue > 65)).sum())


def run_probe(ui_rpc: NeonClient, renderer_endpoint: str, program: Any, args_out: Path) -> int:
    """Run the original inventory acceptance path against the current runtime."""
    before_revision, before_values = _input_revision(ui_rpc)
    expand = _event("inventory.capacity.expand", "expand-button", program.program_revision, before_revision)
    response = ui_rpc.call("ui-runtime", "ui.host.inbound", {"kind": "semantic_intent", "event": expand}, idempotency_key=f"inventory-case-host:{expand['event_id']}")
    time.sleep(0.5)
    after_revision, after_values = _input_revision(ui_rpc)
    renderer = NeonClient.connect(renderer_endpoint, origin="inventory-probe", timeout_seconds=30.0)
    layout = renderer.call("wgpu-runtime", "debug.window.input.snapshot").result.get("layout", {}).get("nodes", [])
    by_key = {node["path"].rsplit("/", 1)[-1]: node for node in layout}
    backpack = by_key.get("backpack", {}).get("bounds")
    slots = [by_key.get(f"slot-{index:02d}", {}).get("bounds") for index in range(1, 17)]
    args_out.parent.mkdir(parents=True, exist_ok=True)
    capture = renderer.call("wgpu-runtime", "wgpu.render.target.capture", {"target": "ui.color.v1", "path": str(args_out.resolve()), "redraw": True}).result
    pixels = _non_background(Path(capture["artifact_path"]))
    visible_slots = all(slot and slot.get("width") == 72.0 and slot.get("height") == 72.0 for slot in slots)
    passed = response.status == "accepted" and after_values.get("capacity") == "medium" and after_revision == before_revision + 1 and backpack is not None and backpack.get("width") == 420.0 and visible_slots and pixels > 10000
    _emit("inventory.verify", frame_sequence=capture.get("frame_sequence", 2), producer={"intent": expand["intent"], "before_revision": before_revision, "before_capacity": before_values.get("capacity")}, consumer={"after_revision": after_revision, "after_capacity": after_values.get("capacity"), "backpack_bounds": backpack, "visible_slots": visible_slots, "non_background_pixels": pixels, "capture": capture}, pass_result=passed)
    _emit("inventory.completed", status="passed" if passed else "failed")
    return 0 if passed else 1

_INVENTORY_FLOW_TEMPLATE = r'''version 1
surface surface.inventory-demo revision 1
budget nodes=512 bindings=80 instances=512 text=384 glyphs=4096 events=1200 clips=512
input capacity enum:small|medium|large default small
input item_grid grid default grid:empty
input enabled bool default true
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
  panel inventory-controls column x 900 y 270 w 250 h 220 gap 12 pad 18 fill #1C2A35 line #4E6A7F radius 6
    text controls-title value "背包容量"
    text controls-subtitle value "每次调整 4 格"
    button expand-button h 42 enabled $enabled value "扩大 4 格" event inventory.capacity.expand
    button collapse-button h 42 enabled $enabled value "减少 4 格" event inventory.capacity.collapse
    text controls-min value "最少 4 × 4"
  data_grid item-data source $item_grid capacity 24 row_height 1 overscan 0 columns "slot:1" w 1 h 1 opacity 0
'''

INVENTORY_FLOW = _INVENTORY_FLOW_TEMPLATE.format(
    item_input_declarations=_item_input_declarations(),
    item_drag_declarations=_item_drag_declarations(),
    item_declarations=_item_declarations(),
    slot_declarations=_slot_declarations(),
    slot_drop_declarations=_slot_drop_declarations(),
)


@dataclass
class InventoryState:
    capacity: str = "small"
    enabled: bool = True
    revision: int = 0
    items: dict[str, int] = field(default_factory=lambda: {"apple": 1, "hammer": 2})

    @property
    def slot_count(self) -> int:
        return {"small": 16, "medium": 20, "large": 24}[self.capacity]


class InventoryDomain:
    def __init__(self) -> None:
        self.state = InventoryState()
        self._lock = threading.Lock()
        self._seen: dict[str, dict[str, Any]] = {}

    def apply(self, event: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            event_id = event["event_id"]
            if event_id in self._seen:
                return self._seen[event_id]
            intent = event["intent"]
            if intent == "inventory.capacity.expand":
                self.state.capacity = {"small": "medium", "medium": "large", "large": "large"}[self.state.capacity]
            elif intent == "inventory.capacity.collapse":
                self.state.capacity = {"small": "small", "medium": "small", "large": "medium"}[self.state.capacity]
            elif intent == "inventory.item.move":
                payload = event.get("payload", {})
                source_key = str(payload.get("source_key", ""))
                target_key = str(payload.get("target_key", ""))
                try:
                    item, _, slot_suffix = source_key.partition("-icon-")
                    target_slot = int(target_key.removeprefix("slot-"))
                    source_slot = int(slot_suffix)
                except ValueError as error:
                    raise ValueError("drag/drop slot identity is invalid") from error
                if item not in self.state.items or self.state.items[item] != source_slot:
                    raise ValueError("drag source does not own the declared item")
                if not 1 <= target_slot <= self.state.slot_count:
                    raise ValueError("drop target is outside the active capacity")
                occupied_by = next((name for name, slot in self.state.items.items() if slot == target_slot), None)
                if occupied_by is not None:
                    self.state.items[occupied_by] = source_slot
                self.state.items[item] = target_slot
            else:
                raise ValueError(f"unsupported inventory intent: {intent}")
            self.state.revision += 1
            publication = {
                "scalar_frame": {
                    "program_revision": event["program_revision"],
                    "expected_input_revision": event["input_revision"],
                    "request_id": event_id,
                    "idempotency_key": f"inventory-input:{self.state.revision}",
                    "changes": [
                        {"key": "capacity", "value": {"kind": "enum", "value": self.state.capacity}},
                        {"key": "enabled", "value": {"kind": "bool", "value": self.state.enabled}},
                        {"key": "medium_visible", "value": {"kind": "bool", "value": self.state.capacity in ("medium", "large")}},
                        {"key": "large_visible", "value": {"kind": "bool", "value": self.state.capacity == "large"}},
                        *[
                            {"key": f"{item}_in_slot_{slot_id:02d}", "value": {"kind": "bool", "value": self.state.items[item] == slot_id}}
                            for item in self.state.items
                            for slot_id in range(1, MAX_SLOT_COUNT + 1)
                        ],
                        *[
                            {"key": f"row_{row}_visible", "value": {"kind": "bool", "value": row <= self.state.slot_count // SLOT_COLUMNS}}
                            for row in range(1, MAX_SLOT_COUNT // SLOT_COLUMNS + 1)
                        ],
                    ],
                },
                "grid_inputs": [{
                    "source_key": "item_grid",
                    "frame": {
                        "list_revision": self.state.revision,
                        "total_rows": 24,
                        "first_row": 0,
                        "window_rows": [
                            {"stable_row_key": f"slot-{slot_id:02d}", "cells": {"slot": {"value": {"kind": "u32", "value": slot_id}, "display": {"id": slot_id, "generation": 1}}}}
                            for slot_id in range(1, self.state.slot_count + 1)
                        ],
                        "expected_program_revision": event["program_revision"],
                    },
                }],
                "presentation_update": None,
                "inventory": {"input_revision": event["input_revision"] + 1, "state": self.state.__dict__.copy()},
            }
            self._seen[event_id] = publication
            return publication


class InventoryServer(CalculatorServer):
    def __init__(self, endpoint: str) -> None:
        super().__init__(endpoint, domain=InventoryDomain())

    def _dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
        request_id = request["request_id"]
        if request["method"] == "service.health":
            return _response(request_id, "accepted", result={"service": "inventory-python", "status": "healthy", "epoch": 1})
        if request["method"] != "ui.host.inbound":
            return _response(request_id, "rejected", error={"code": "unsupported_method", "message": "method is not supported"})
        try:
            publication = self.domain.apply(request["params"]["event"])
        except (KeyError, TypeError, ValueError) as error:
            return _response(request_id, "rejected", error={"code": "inventory_rejected", "message": str(error)})
        return _response(request_id, "accepted", revision=publication["inventory"]["input_revision"], result={key: value for key, value in publication.items() if key != "inventory"}, snapshot=publication["inventory"])


def launch(neon_root: Path | None, probe: bool = False, out: Path | None = None) -> int:
    endpoints = RuntimeEndpoints(eventd=_free_endpoint(), ui=_free_endpoint(), wgpu=_free_endpoint())
    domain_endpoint = _free_endpoint()
    domain = InventoryServer(domain_endpoint)
    thread = threading.Thread(target=domain.serve, daemon=True)
    config = RuntimeConfig(neon_root=str(neon_root) if neon_root else RuntimeConfig().neon_root, endpoints=endpoints, domain_endpoint=domain_endpoint, mode=RuntimeMode.WINDOWED, profile=os.environ.get("NEON_PROFILE", "auto"), timeout_seconds=30.0)
    try:
        if any(not asset_path(ASSET_ROOT, filename).is_file() for filename in ASSETS.values()):
            raise FileNotFoundError(f"missing bundled inventory asset under {ASSET_ROOT}")
        thread.start()
        if not domain.ready.wait(timeout=2) or domain.start_error:
            raise RuntimeError(f"inventory domain failed: {domain.start_error}")
        with RuntimeSession(config):
            rpc = NeonClient.connect(endpoints.ui, origin="inventory-demo", kind="external_host", timeout_seconds=20.0)
            for sequence, (asset_id, filename) in enumerate(ASSETS.items(), start=1):
                rpc.call("ui-runtime", "ui.image.upload", image_upload(asset_id, asset_path(ASSET_ROOT, filename)), idempotency_key=f"inventory-upload-{sequence}")
            program = UiClient(rpc).submit_flow(INVENTORY_FLOW, idempotency_key="inventory-demo-flow-v1")
            _emit("inventory.flow.submitted", surface_id=program.surface_id, program_revision=program.program_revision, assets=list(ASSETS), pass_result=True)
            if probe:
                return run_probe(rpc, endpoints.wgpu, program, args_out=out or Path("inventory-demo.png"))
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
        domain.stop()


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch Neon3 inventory drag and nine-slice demo")
    parser.add_argument("--probe", action="store_true", help="run deterministic verification and exit")
    parser.add_argument("--out", type=Path, default=Path("inventory-demo.png"), help="capture output used by --probe")
    parser.add_argument("--neon3", type=Path, default=None, help="optional Neon3 checkout; otherwise use NEON_ROOT or online latest")
    args = parser.parse_args()
    return launch(args.neon3, probe=args.probe, out=args.out)


if __name__ == "__main__":
    raise SystemExit(main())
