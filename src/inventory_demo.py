"""Self-contained inventory demo: all image pixels are generated in memory."""

from __future__ import annotations

import argparse
import json
import socket
import threading
from dataclasses import dataclass
from typing import Any

from neon3_sdk import NeonClient, RuntimeConfig, RuntimeEndpoints, RuntimeMode, RuntimeSession, UiClient
from neon3_sdk.calculator import CalculatorServer, _response

from .flow import FLOW


def emit(event: str, **data: Any) -> None:
    print(json.dumps({"event": event, **data}, ensure_ascii=False), flush=True)


def free_endpoint() -> str:
    """Reserve no global port; each process receives an explicit loopback endpoint."""
    with socket.socket() as stream:
        stream.bind(("127.0.0.1", 0))
        return f"127.0.0.1:{stream.getsockname()[1]}"


def rgba_asset(width: int, height: int, color: tuple[int, int, int, int], border: tuple[int, int, int, int] | None = None) -> dict[str, Any]:
    """Create deterministic RGBA8 data without opening or reading a file."""
    pixels = []
    for y in range(height):
        for x in range(width):
            edge = border is not None and (x < 3 or y < 3 or x >= width - 3 or y >= height - 3)
            pixels.extend(border if edge else color)
    return {"source": {"image_id": "generated", "media_type": "application/x-neon-rgba8", "width": width, "height": height, "bytes": pixels}}


ASSETS = {
    "panel": rgba_asset(32, 32, (35, 52, 64, 255), (95, 137, 157, 255)),
    "slot": rgba_asset(32, 32, (48, 66, 78, 255), (125, 227, 209, 255)),
}


@dataclass
class InventoryState:
    capacity: str = "small"
    revision: int = 0


class InventoryDomain:
    def __init__(self) -> None:
        self.state = InventoryState()
        self.lock = threading.Lock()

    def apply(self, event: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            if event.get("intent") != "inventory.capacity.expand":
                raise ValueError("only inventory.capacity.expand is implemented in this teaching case")
            self.state.capacity = {"small": "medium", "medium": "large", "large": "large"}[self.state.capacity]
            self.state.revision += 1
            return {"capacity": self.state.capacity, "revision": self.state.revision}


class InventoryServer(CalculatorServer):
    def __init__(self, endpoint: str) -> None:
        super().__init__(endpoint, domain=InventoryDomain())

    def _dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
        request_id = request["request_id"]
        if request["method"] == "service.health":
            return _response(request_id, "accepted", result={"service": "inventory-case", "status": "healthy", "epoch": 1})
        if request["method"] == "debug.snapshot.get":
            state = self.domain.state
            return _response(request_id, "accepted", result={"service": "inventory-case", "epoch": 1, "revision": state.revision, "state": {"capacity": state.capacity, "revision": state.revision}})
        if request["method"] != "ui.host.inbound":
            return _response(request_id, "rejected", error={"code": "unsupported_method", "message": "use ui.host.inbound"})
        try:
            event = request["params"]["event"]
            result = self.domain.apply(event)
        except (KeyError, TypeError, ValueError) as error:
            return _response(request_id, "rejected", error={"code": "inventory_rejected", "message": str(error)})
        inventory_snapshot = {
            "input_revision": event["input_revision"] + 1,
            "state": {"capacity": result["capacity"], "revision": result["revision"]},
        }
        publication = {
            "scalar_frame": {
                "program_revision": event["program_revision"],
                "expected_input_revision": event["input_revision"],
                "request_id": event["event_id"],
                "idempotency_key": f"inventory-case-input:{result['revision']}",
                "changes": [
                    {"key": "capacity", "value": {"kind": "enum", "value": result["capacity"]}},
                    {"key": "enabled", "value": {"kind": "bool", "value": True}},
                ],
            },
            "grid_inputs": [],
            "presentation_update": None,
            "inventory": inventory_snapshot,
        }
        return _response(
            request_id,
            "accepted",
            revision=inventory_snapshot["input_revision"],
            result={key: value for key, value in publication.items() if key != "inventory"},
            snapshot=inventory_snapshot,
        )


def run(probe: bool = False) -> int:
    endpoints = RuntimeEndpoints(eventd=free_endpoint(), ui=free_endpoint(), wgpu=free_endpoint())
    domain_endpoint = free_endpoint()
    domain = InventoryServer(domain_endpoint)
    thread = threading.Thread(target=domain.serve, daemon=True)
    config = RuntimeConfig(
        endpoints=endpoints,
        domain_endpoint=domain_endpoint,
        mode=RuntimeMode.HEADLESS if probe else RuntimeMode.WINDOWED,
        profile="auto",
        timeout_seconds=30.0,
    )
    try:
        thread.start()
        if not domain.ready.wait(5) or domain.start_error:
            raise RuntimeError(f"domain startup failed: {domain.start_error}")
        with RuntimeSession(config):
            ui = NeonClient.connect(endpoints.ui, origin="neon3-inventory-case", kind="external_host", timeout_seconds=30.0)
            for asset_id, payload in ASSETS.items():
                payload["source"]["image_id"] = asset_id
                ui.call("ui-runtime", "ui.image.upload", payload, idempotency_key=f"inventory-case-asset-{asset_id}")
            program = UiClient(ui).submit_flow(FLOW, idempotency_key="inventory-case-flow-v1")
            emit("inventory.submit", frame_sequence=1, producer={"capacity": "small", "program_revision": program.program_revision}, result="passed")
            if not probe:
                emit("inventory.running", result="passed", message="Press Ctrl+C to stop")
                while True:
                    ui.health("ui-runtime")
            host_snapshot = ui.call("ui-runtime", "debug.ui.host.snapshot").result
            input_revision = int(host_snapshot["scalar_inputs"]["input_revision"])
            event = {"event_id": "inventory-case-expand-1", "kind": "activate", "intent": "inventory.capacity.expand", "source_node_key": "expand", "payload": {}, "program_revision": program.program_revision, "input_revision": input_revision, "request_id": "inventory-case-expand-1", "idempotency_key": "inventory-case-expand-1", "interaction": {"interaction_id": "inventory-case-expand-1", "sequence": input_revision + 1, "renderer_epoch": 1}}
            response = ui.call("ui-runtime", "ui.host.inbound", {"kind": "semantic_intent", "event": event}, idempotency_key="inventory-case-expand-1")
            domain_snapshot = NeonClient.connect(domain_endpoint, origin="neon3-inventory-case", timeout_seconds=30.0).call("inventory-case", "debug.snapshot.get").result
            result = domain_snapshot.get("state", {})
            state = result
            passed = response.status == "accepted" and state.get("capacity") == "medium" and state.get("revision") == 1
            emit("inventory.verify", frame_sequence=2, producer={"intent": event["intent"], "input_revision": event["input_revision"], "domain_endpoint": domain_endpoint}, consumer=result, result="passed" if passed else "failed")
            return 0 if passed else 1
    except KeyboardInterrupt:
        emit("inventory.completed", result="stopped")
        return 0
    except Exception as error:
        emit("inventory.completed", result="failed", error=str(error))
        return 1
    finally:
        domain.stop()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the self-contained Neon3 inventory case")
    parser.add_argument("--probe", action="store_true", help="run one deterministic action and exit")
    return run(probe=parser.parse_args().probe)


if __name__ == "__main__":
    raise SystemExit(main())
