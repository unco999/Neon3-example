"""Deterministic executable acceptance probe for the inventory case."""

from .inventory_demo import run


def main() -> int:
    return run(probe=True)


if __name__ == "__main__":
    raise SystemExit(main())
