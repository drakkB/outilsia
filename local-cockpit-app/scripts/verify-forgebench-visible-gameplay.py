#!/usr/bin/env python3
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "forgebench" / "signal-maze-v1" / "visible-contract.json"
REFERENCE_HTML = ROOT / "forgebench" / "signal-maze-v1" / "reference" / "index.html"
OUT = ROOT / ".artifacts" / "forgebench-visible-gameplay"
OUT.mkdir(parents=True, exist_ok=True)

CONTRACT = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
COLORS = CONTRACT["board"]["colors"]
ROWS = CONTRACT["board"]["rows"]
COLUMNS = CONTRACT["board"]["columns"]


def transform(row: int, column: int, index: int) -> tuple[int, int]:
    transforms = (
        (row, column),
        (column, 8 - row),
        (8 - row, 8 - column),
        (8 - column, row),
        (row, 8 - column),
        (8 - column, 8 - row),
        (8 - row, column),
        (column, row),
    )
    return transforms[index]


def color_for_role(role: int, seed: int) -> str:
    return COLORS[(role + (seed // 8) % len(COLORS)) % len(COLORS)]


def visible_paths(seed: int) -> list[tuple[str, list[dict[str, int]]]]:
    transform_index = seed & 7
    paths = []
    for entry in CONTRACT["base_layout"]["visible_solution_paths"]:
        cells = []
        for row, column in entry["cells"]:
            result_row, result_column = transform(row, column, transform_index)
            cells.append({"row": result_row, "column": result_column})
        paths.append((color_for_role(entry["role"], seed), cells))
    return paths


def fnv1a32(value: str) -> str:
    result = 0x811C9DC5
    for byte in value.encode("ascii"):
        result ^= byte
        result = (result * 0x01000193) & 0xFFFFFFFF
    return f"{result:08x}"


def expected_initial(seed: int) -> tuple[str, dict[tuple[int, int], tuple[str, str | None]]]:
    transform_index = seed & 7
    color_offset = (seed // 8) % len(COLORS)
    cells: dict[tuple[int, int], tuple[str, str | None]] = {}
    for row, column in CONTRACT["base_layout"]["obstacles"]:
        cells[transform(row, column, transform_index)] = ("obstacle", None)
    for endpoint in CONTRACT["base_layout"]["endpoints"]:
        color = color_for_role(endpoint["role"], seed)
        cells[transform(*endpoint["source"], transform_index)] = ("source", color)
        cells[transform(*endpoint["receiver"], transform_index)] = ("receiver", color)
    tokens = []
    for row in range(ROWS):
        for column in range(COLUMNS):
            kind, color = cells.get((row, column), ("empty", None))
            if kind == "obstacle":
                tokens.append("#")
            elif kind == "source":
                tokens.append(f"s:{color}")
            elif kind == "receiver":
                tokens.append(f"r:{color}")
            else:
                tokens.append(".")
    payload = f"signal-maze-v1|{seed}|{transform_index}|{color_offset}|{','.join(tokens)}"
    return fnv1a32(payload), cells


def validate_snapshot(snapshot: dict, seed: int, initial: bool) -> None:
    exact_fields = set(CONTRACT["snapshot"]["exact_fields"])
    if set(snapshot) != exact_fields:
        raise AssertionError(f"snapshot fields mismatch: {set(snapshot) ^ exact_fields}")
    if snapshot["schema"] != CONTRACT["snapshot"]["schema"]:
        raise AssertionError("snapshot schema mismatch")
    if snapshot["contract_version"] != CONTRACT["contract_version"]:
        raise AssertionError("snapshot contract version mismatch")
    if snapshot["seed"] != seed or snapshot["seed_u32"] != seed:
        raise AssertionError("snapshot seed mismatch")
    if snapshot["rows"] != ROWS or snapshot["columns"] != COLUMNS:
        raise AssertionError("snapshot dimensions mismatch")
    if snapshot["pairs_total"] != 3 or snapshot["colors"] != COLORS:
        raise AssertionError("snapshot pairs/colors mismatch")
    if set(snapshot["paths"]) != set(COLORS) or len(snapshot["endpoints"]) != 3:
        raise AssertionError("snapshot path/endpoint topology mismatch")
    if len(snapshot["cells"]) != ROWS * COLUMNS:
        raise AssertionError("snapshot must contain exactly 81 cells")
    signature, expected_cells = expected_initial(seed)
    if snapshot["board_signature"] != signature:
        raise AssertionError(f"board signature mismatch: {snapshot['board_signature']} != {signature}")
    for index, cell in enumerate(snapshot["cells"]):
        expected_row, expected_column = divmod(index, COLUMNS)
        if set(cell) != {"row", "column", "kind", "color", "path_color"}:
            raise AssertionError("cell fields mismatch")
        if (cell["row"], cell["column"]) != (expected_row, expected_column):
            raise AssertionError("cells are not row-major")
        if initial:
            expected_kind, expected_color = expected_cells.get(
                (expected_row, expected_column), ("empty", None)
            )
            if (cell["kind"], cell["color"], cell["path_color"]) != (
                expected_kind,
                expected_color,
                None,
            ):
                raise AssertionError(f"initial cell mismatch at {expected_row}:{expected_column}")


def center(page, cell: dict[str, int]) -> tuple[float, float]:
    locator = page.locator(
        f'[data-row="{cell["row"]}"][data-column="{cell["column"]}"]'
    )
    box = locator.bounding_box()
    if not box:
        raise AssertionError(f"cell not visible: {cell}")
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def exercise_mouse(page, seed: int) -> None:
    color, cells = visible_paths(seed)[0]
    page.evaluate("seed => window.__SIGNAL_MAZE_VISIBLE_API__.newGame(seed)", seed)
    start_x, start_y = center(page, cells[0])
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    for cell in cells[1:]:
        x, y = center(page, cell)
        page.mouse.move(x, y, steps=2)
    page.mouse.up()
    current = page.evaluate("() => window.__SIGNAL_MAZE_VISIBLE_API__.snapshot()")
    if current["connected_pairs"] != 1 or not current["paths"][color]:
        raise AssertionError("mouse path did not connect one signal")


def exercise_keyboard(page, seed: int) -> None:
    color, cells = visible_paths(seed)[1]
    page.evaluate("seed => window.__SIGNAL_MAZE_VISIBLE_API__.newGame(seed)", seed)
    page.locator(
        f'[data-row="{cells[0]["row"]}"][data-column="{cells[0]["column"]}"]'
    ).focus()
    page.keyboard.press("Enter")
    for previous, current in zip(cells, cells[1:]):
        delta = (current["row"] - previous["row"], current["column"] - previous["column"])
        key = {
            (-1, 0): "ArrowUp",
            (1, 0): "ArrowDown",
            (0, -1): "ArrowLeft",
            (0, 1): "ArrowRight",
        }[delta]
        page.keyboard.press(key)
    page.keyboard.press("Enter")
    current = page.evaluate("() => window.__SIGNAL_MAZE_VISIBLE_API__.snapshot()")
    if current["connected_pairs"] != 1 or not current["paths"][color]:
        raise AssertionError("keyboard path did not connect one signal")


def exercise_touch_contract(page, seed: int) -> None:
    color, cells = visible_paths(seed)[2]
    page.evaluate("seed => window.__SIGNAL_MAZE_VISIBLE_API__.newGame(seed)", seed)
    result = page.evaluate(
        """
        ({ color, cells }) => {
          const board = document.querySelector('#signalMazeBoard');
          const target = (cell) => document.querySelector(
            `[data-row="${cell.row}"][data-column="${cell.column}"]`
          );
          const point = (cell) => {
            const box = target(cell).getBoundingClientRect();
            return { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
          };
          const first = point(cells[0]);
          target(cells[0]).dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch',
            isPrimary: true, buttons: 1, ...first
          }));
          for (const cell of cells.slice(1)) {
            board.dispatchEvent(new PointerEvent('pointermove', {
              bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch',
              isPrimary: true, buttons: 1, ...point(cell)
            }));
          }
          const last = point(cells[cells.length - 1]);
          board.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true, cancelable: true, pointerId: 77, pointerType: 'touch',
            isPrimary: true, buttons: 0, ...last
          }));
          const snapshot = window.__SIGNAL_MAZE_VISIBLE_API__.snapshot();
          return { connected: snapshot.connected_pairs, path: snapshot.paths[color] };
        }
        """,
        {"color": color, "cells": cells},
    )
    if result["connected"] != 1 or not result["path"]:
        raise AssertionError("touch pointer path did not connect one signal")


def verify_viewport(browser, width: int, height: int, label: str, touch: bool) -> Path:
    context = browser.new_context(
        viewport={"width": width, "height": height},
        has_touch=touch,
        is_mobile=touch,
    )
    page = context.new_page()
    errors: list[str] = []
    external_requests: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on(
        "request",
        lambda request: external_requests.append(request.url)
        if request.url.startswith(("http://", "https://"))
        else None,
    )
    page.goto(REFERENCE_HTML.as_uri(), wait_until="load")
    page.wait_for_function("() => Boolean(window.__SIGNAL_MAZE_VISIBLE_API__)")

    api_methods = page.evaluate(
        "() => Object.keys(window.__SIGNAL_MAZE_VISIBLE_API__).sort()"
    )
    if api_methods != ["applyPath", "newGame", "reset", "snapshot"]:
        raise AssertionError(f"{label}: public API mismatch {api_methods}")
    if page.locator("#signalMazeBoard [data-cell]").count() != 81:
        raise AssertionError(f"{label}: DOM does not contain 81 cells")

    signatures = set()
    for seed in CONTRACT["visible_recipe"]["default_seeds"]:
        first = page.evaluate(
            "seed => window.__SIGNAL_MAZE_VISIBLE_API__.newGame(seed)", seed
        )
        second = page.evaluate(
            "seed => window.__SIGNAL_MAZE_VISIBLE_API__.newGame(seed)", seed
        )
        if first != second:
            raise AssertionError(f"{label}: same seed produced different snapshots")
        validate_snapshot(first, seed, initial=True)
        signatures.add(first["board_signature"])

        before = page.evaluate("() => window.__SIGNAL_MAZE_VISIBLE_API__.snapshot()")
        rejected = page.evaluate(
            "() => window.__SIGNAL_MAZE_VISIBLE_API__.applyPath('unknown', [])"
        )
        after = page.evaluate("() => window.__SIGNAL_MAZE_VISIBLE_API__.snapshot()")
        if rejected["accepted"] is not False or rejected["reason"] != "unknown_color" or before != after:
            raise AssertionError(f"{label}: rejected path mutated the state")

        for color, cells in visible_paths(seed):
            outcome = page.evaluate(
                "({ color, cells }) => window.__SIGNAL_MAZE_VISIBLE_API__.applyPath(color, cells)",
                {"color": color, "cells": cells},
            )
            if outcome["accepted"] is not True or outcome["reason"] != "accepted":
                raise AssertionError(f"{label}: visible path rejected for {color}: {outcome['reason']}")
        solved = page.evaluate("() => window.__SIGNAL_MAZE_VISIBLE_API__.snapshot()")
        if solved["won"] is not True or solved["connected_pairs"] != 3:
            raise AssertionError(f"{label}: visible recipe did not win")
        if page.locator("#gameRoot").get_attribute("data-state") != "won":
            raise AssertionError(f"{label}: DOM did not expose won state")
        reset = page.evaluate("() => window.__SIGNAL_MAZE_VISIBLE_API__.reset()")
        if reset != first:
            raise AssertionError(f"{label}: reset did not restore the initial snapshot")

    if len(signatures) != len(CONTRACT["visible_recipe"]["default_seeds"]):
        raise AssertionError(f"{label}: declared seeds did not produce distinct signatures")

    detached = page.evaluate(
        """
        () => {
          const copy = window.__SIGNAL_MAZE_VISIBLE_API__.snapshot();
          copy.cells[0].kind = 'tampered';
          copy.paths.cyan.push({ row: 99, column: 99 });
          const fresh = window.__SIGNAL_MAZE_VISIBLE_API__.snapshot();
          return { kind: fresh.cells[0].kind, hasInjectedPath: fresh.paths.cyan.some(c => c.row === 99) };
        }
        """
    )
    if detached["kind"] == "tampered" or detached["hasInjectedPath"]:
        raise AssertionError(f"{label}: snapshot is not detached")

    seed = CONTRACT["visible_recipe"]["default_seeds"][0]
    if label == "desktop":
        exercise_mouse(page, seed)
        exercise_keyboard(page, seed)
    if touch:
        exercise_touch_contract(page, seed)

    page.locator("#seedInput").fill("17029")
    page.locator("#newGameBtn").click()
    if page.locator("#gameRoot").get_attribute("data-seed") != "17029":
        raise AssertionError(f"{label}: New Game button ignored the seed")
    page.locator("#resetBtn").click()
    if page.evaluate("() => window.__SIGNAL_MAZE_VISIBLE_API__.snapshot().connected_pairs") != 0:
        raise AssertionError(f"{label}: Reset button did not clear paths")

    overflow = page.evaluate(
        """() => ({
          viewport: innerWidth,
          body: document.body.scrollWidth,
          document: document.documentElement.scrollWidth,
          board: (() => {
            const box = document.querySelector('#signalMazeBoard').getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
          })()
        })"""
    )
    if max(overflow["body"], overflow["document"]) > overflow["viewport"] + 2:
        raise AssertionError(f"{label}: horizontal overflow {overflow}")
    board_box = overflow["board"]
    if board_box["left"] < -1 or board_box["right"] > width + 1 or board_box["top"] < -1:
        raise AssertionError(f"{label}: board is clipped {board_box}")
    if "landscape" in label and board_box["bottom"] > height + 1:
        raise AssertionError(f"{label}: board is vertically clipped {board_box}")
    if external_requests:
        raise AssertionError(f"{label}: external requests observed {external_requests}")
    if errors:
        raise AssertionError(f"{label}: JavaScript errors {errors}")

    screenshot = OUT / f"signal-maze-reference-{label}.png"
    page.screenshot(path=str(screenshot), full_page=True)
    context.close()
    return screenshot


def main() -> None:
    if CONTRACT["schema"] != "outilsia.forgebench_visible_gameplay_contract.v1":
        raise AssertionError("visible gameplay contract schema mismatch")
    if CONTRACT["security"]["candidate_execution_enabled_by_this_contract"] is not False:
        raise AssertionError("visible contract must not enable candidate execution")
    if CONTRACT["claims"]["ollama_candidate_gameplay_may_be_verified_per_signed_run"] is not True:
        raise AssertionError("visible contract does not expose the signed-run capability")
    if CONTRACT["claims"]["public_recipe_is_scientific_score"] is not False:
        raise AssertionError("visible contract overclaims scientific scoring")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        screenshots = [
            verify_viewport(browser, 1440, 900, "desktop", False),
            verify_viewport(browser, 390, 844, "android-portrait", True),
            verify_viewport(browser, 844, 390, "android-landscape", True),
        ]
        browser.close()
    print(
        "forgebench_visible_gameplay_ok "
        f"contract={CONTRACT['contract_version']} seeds=3 viewports=3 inputs=keyboard,mouse,touch "
        "reference=true candidate-executed=false candidate-gameplay=false "
        f"screenshots={','.join(str(path) for path in screenshots)}"
    )


if __name__ == "__main__":
    main()
