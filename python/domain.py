"""Pure inventory rules shared by the Python application and its tests."""
from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

CAPACITY_SLOTS = {"small": 16, "medium": 20, "large": 24}
EXPAND = {"small": "medium", "medium": "large", "large": "large"}
COLLAPSE = {"small": "small", "medium": "small", "large": "medium"}

@dataclass(frozen=True)
class InventoryItem:
    key: str
    kind: str
    name: str
    slot_key: str | None
    rarity: str
    description: str

    def to_wire(self) -> dict[str, Any]:
        return {"key": self.key, "kind": self.kind, "name": self.name, "slot_key": self.slot_key, "rarity": self.rarity, "description": self.description}

def initial_items() -> list[dict[str, Any]]:
    return [
        {"key": "apple", "kind": "consumable", "name": "Apple", "slot_key": "slot-01", "rarity": "common", "description": "Restores 25 health"},
        {"key": "hammer", "kind": "tool", "name": "Repair Hammer", "slot_key": "slot-02", "rarity": "rare", "description": "Repairs equipment durability"},
    ]

def slot_number(slot: str) -> int:
    if not isinstance(slot, str) or not slot.startswith("slot-"):
        raise ValueError(f"invalid slot key: {slot!r}")
    try:
        number = int(slot[5:])
    except ValueError as error:
        raise ValueError(f"invalid slot key: {slot!r}") from error
    if f"slot-{number:02d}" != slot:
        raise ValueError(f"invalid slot key: {slot!r}")
    return number

def move_items(items: list[dict[str, Any]], item_id: str, source_slot: str, target_slot: str, capacity: str) -> list[dict[str, Any]]:
    limit = CAPACITY_SLOTS[capacity]
    source = slot_number(source_slot); target = slot_number(target_slot)
    if not 1 <= target <= limit: raise ValueError("drop target is outside the active capacity")
    by_key = {item["key"]: item for item in items}
    item = by_key.get(item_id)
    if item is None or item.get("slot_key") != source_slot: raise ValueError("drag source does not own the declared item")
    occupied = next((other for other in items if other["slot_key"] == target_slot and other["key"] != item_id), None)
    result = [dict(entry) for entry in items]
    if occupied is not None: next(entry for entry in result if entry["key"] == occupied["key"])["slot_key"] = source_slot
    next(entry for entry in result if entry["key"] == item_id)["slot_key"] = target_slot
    return result
