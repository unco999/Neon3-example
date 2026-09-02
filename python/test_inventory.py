import json
import unittest
from pathlib import Path

from domain import CAPACITY_SLOTS, COLLAPSE, EXPAND, initial_items, move_items

FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures" / "inventory-contract.json").read_text(encoding="utf-8"))

class InventoryDomainTest(unittest.TestCase):
    def test_capacity_contract(self):
        self.assertEqual(CAPACITY_SLOTS, FIXTURE["capacities"])
        self.assertEqual([EXPAND["small"], EXPAND["medium"], EXPAND["large"]], ["medium", "large", "large"])
        self.assertEqual([COLLAPSE["large"], COLLAPSE["medium"], COLLAPSE["small"]], ["medium", "small", "small"])

    def test_stable_identity_and_swap(self):
        items = initial_items()
        moved = move_items(items, "apple", "slot-01", "slot-05", "small")
        self.assertEqual({item["key"]: item["slot_key"] for item in moved}, {"apple": "slot-05", "hammer": "slot-02"})
        swapped = move_items(moved, "hammer", "slot-02", "slot-05", "small")
        self.assertEqual({item["key"]: item["slot_key"] for item in swapped}, {"apple": "slot-02", "hammer": "slot-05"})

    def test_invalid_target(self):
        with self.assertRaises(ValueError): move_items(initial_items(), "apple", "slot-01", "slot-21", "small")

if __name__ == "__main__": unittest.main()
