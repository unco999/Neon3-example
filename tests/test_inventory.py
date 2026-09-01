from __future__ import annotations

import unittest

from src.inventory_demo import InventoryDomain, rgba_asset


class InventoryTests(unittest.TestCase):
    def test_generated_assets_are_deterministic_rgba(self) -> None:
        asset = rgba_asset(2, 2, (1, 2, 3, 4))
        self.assertEqual(asset["source"]["width"], 2)
        self.assertEqual(len(asset["source"]["bytes"]), 16)

    def test_capacity_event_is_revisioned(self) -> None:
        domain = InventoryDomain()
        result = domain.apply({"intent": "inventory.capacity.expand"})
        self.assertEqual(result, {"capacity": "medium", "revision": 1})


if __name__ == "__main__":
    unittest.main()
