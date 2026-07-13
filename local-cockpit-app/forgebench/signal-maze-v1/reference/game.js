"use strict";

(() => {
  const ROWS = 9;
  const COLUMNS = 9;
  const COLORS = Object.freeze(["cyan", "magenta", "amber"]);
  const DEFAULT_SEED = 17011;
  const BASE_ENDPOINTS = Object.freeze([
    { role: 0, source: [1, 1], receiver: [3, 7] },
    { role: 1, source: [4, 1], receiver: [4, 7] },
    { role: 2, source: [7, 1], receiver: [5, 7] }
  ]);
  const BASE_OBSTACLES = Object.freeze([
    [1, 4],
    [2, 2], [2, 3], [2, 4], [2, 5], [2, 6],
    [3, 2], [3, 3], [3, 4], [3, 5], [3, 6],
    [5, 2], [5, 3], [5, 4], [5, 5], [5, 6],
    [6, 2], [6, 3], [6, 4], [6, 5], [6, 6],
    [7, 4]
  ]);

  const root = document.getElementById("gameRoot");
  const board = document.getElementById("signalMazeBoard");
  const status = document.getElementById("gameStatus");
  const interactionStatus = document.getElementById("interactionStatus");
  const seedInput = document.getElementById("seedInput");
  const newGameButton = document.getElementById("newGameBtn");
  const resetButton = document.getElementById("resetBtn");

  let game = null;
  let draft = null;
  let pointerDrawing = false;

  function coordinateKey(row, column) {
    return `${row}:${column}`;
  }

  function normalizeSeed(seed) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new RangeError("Signal Maze seed must be an integer between 0 and 4294967295.");
    }
    return seed >>> 0;
  }

  function transformCoordinate(row, column, transform) {
    switch (transform) {
      case 0: return [row, column];
      case 1: return [column, 8 - row];
      case 2: return [8 - row, 8 - column];
      case 3: return [8 - column, row];
      case 4: return [row, 8 - column];
      case 5: return [8 - column, 8 - row];
      case 6: return [8 - row, column];
      case 7: return [column, row];
      default: throw new RangeError("Unknown Signal Maze transform.");
    }
  }

  function colorForRole(role, colorOffset) {
    return COLORS[(role + colorOffset) % COLORS.length];
  }

  function fnv1a32(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  function buildGame(seed) {
    const seedU32 = normalizeSeed(seed);
    const transform = seedU32 & 7;
    const colorOffset = Math.floor(seedU32 / 8) % COLORS.length;
    const endpoints = new Map();
    const endpointCells = new Map();
    for (const entry of BASE_ENDPOINTS) {
      const color = colorForRole(entry.role, colorOffset);
      const source = transformCoordinate(entry.source[0], entry.source[1], transform);
      const receiver = transformCoordinate(entry.receiver[0], entry.receiver[1], transform);
      endpoints.set(color, { color, source, receiver });
      endpointCells.set(coordinateKey(source[0], source[1]), { kind: "source", color });
      endpointCells.set(coordinateKey(receiver[0], receiver[1]), { kind: "receiver", color });
    }
    const obstacles = new Set(
      BASE_OBSTACLES.map(([row, column]) => {
        const transformed = transformCoordinate(row, column, transform);
        return coordinateKey(transformed[0], transformed[1]);
      })
    );
    const paths = new Map(COLORS.map((color) => [color, []]));
    const initialTokens = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const key = coordinateKey(row, column);
        const endpoint = endpointCells.get(key);
        if (obstacles.has(key)) initialTokens.push("#");
        else if (endpoint) initialTokens.push(`${endpoint.kind === "source" ? "s" : "r"}:${endpoint.color}`);
        else initialTokens.push(".");
      }
    }
    const signatureInput = `signal-maze-v1|${seedU32}|${transform}|${colorOffset}|${initialTokens.join(",")}`;
    return {
      seed: seedU32,
      seedU32,
      transform,
      colorOffset,
      endpoints,
      endpointCells,
      obstacles,
      paths,
      boardSignature: fnv1a32(signatureInput)
    };
  }

  function pathOccupancy(excludedColor = null) {
    const occupied = new Map();
    for (const [color, cells] of game.paths) {
      if (color === excludedColor) continue;
      for (const cell of cells) occupied.set(coordinateKey(cell.row, cell.column), color);
    }
    return occupied;
  }

  function endpointAt(row, column) {
    return game.endpointCells.get(coordinateKey(row, column)) || null;
  }

  function pathColorAt(row, column) {
    const key = coordinateKey(row, column);
    for (const [color, cells] of game.paths) {
      if (cells.some((cell) => coordinateKey(cell.row, cell.column) === key)) return color;
    }
    return null;
  }

  function snapshot() {
    const connectedPairs = COLORS.filter((color) => game.paths.get(color).length > 0).length;
    const won = connectedPairs === COLORS.length;
    const endpoints = COLORS.map((color) => {
      const entry = game.endpoints.get(color);
      return {
        color,
        source: { row: entry.source[0], column: entry.source[1] },
        receiver: { row: entry.receiver[0], column: entry.receiver[1] }
      };
    });
    const paths = Object.fromEntries(
      COLORS.map((color) => [
        color,
        game.paths.get(color).map((cell) => ({ row: cell.row, column: cell.column }))
      ])
    );
    const cells = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const key = coordinateKey(row, column);
        const endpoint = game.endpointCells.get(key);
        const pathColor = pathColorAt(row, column);
        let kind = "empty";
        let color = null;
        if (game.obstacles.has(key)) kind = "obstacle";
        else if (endpoint) {
          kind = endpoint.kind;
          color = endpoint.color;
        } else if (pathColor) kind = "path";
        cells.push({ row, column, kind, color, path_color: pathColor });
      }
    }
    return {
      schema: "signal-maze-visible-snapshot.v1",
      contract_version: "1.0.0",
      seed: game.seed,
      seed_u32: game.seedU32,
      rows: ROWS,
      columns: COLUMNS,
      board_signature: game.boardSignature,
      state: won ? "won" : "playing",
      pairs_total: COLORS.length,
      connected_pairs: connectedPairs,
      won,
      colors: [...COLORS],
      endpoints,
      paths,
      cells
    };
  }

  function result(accepted, reason) {
    return { accepted, reason, snapshot: snapshot() };
  }

  function sameCoordinate(left, right) {
    return left.row === right.row && left.column === right.column;
  }

  function applyPath(color, rawCells) {
    if (!COLORS.includes(color)) return result(false, "unknown_color");
    if (!Array.isArray(rawCells) || rawCells.length < 2) return result(false, "path_too_short");
    const cells = [];
    for (const rawCell of rawCells) {
      if (!rawCell || typeof rawCell !== "object" || !Number.isInteger(rawCell.row) || !Number.isInteger(rawCell.column)) {
        return result(false, "invalid_cell");
      }
      if (rawCell.row < 0 || rawCell.row >= ROWS || rawCell.column < 0 || rawCell.column >= COLUMNS) {
        return result(false, "out_of_bounds");
      }
      cells.push({ row: rawCell.row, column: rawCell.column });
    }
    const unique = new Set(cells.map((cell) => coordinateKey(cell.row, cell.column)));
    if (unique.size !== cells.length) return result(false, "repeated_cell");
    for (let index = 1; index < cells.length; index += 1) {
      const distance = Math.abs(cells[index].row - cells[index - 1].row)
        + Math.abs(cells[index].column - cells[index - 1].column);
      if (distance !== 1) return result(false, "non_contiguous");
    }
    const endpoints = game.endpoints.get(color);
    const source = { row: endpoints.source[0], column: endpoints.source[1] };
    const receiver = { row: endpoints.receiver[0], column: endpoints.receiver[1] };
    const forward = sameCoordinate(cells[0], source) && sameCoordinate(cells[cells.length - 1], receiver);
    const reverse = sameCoordinate(cells[0], receiver) && sameCoordinate(cells[cells.length - 1], source);
    if (!forward && !reverse) return result(false, "endpoint_mismatch");
    const otherPaths = pathOccupancy(color);
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index];
      const key = coordinateKey(cell.row, cell.column);
      if (game.obstacles.has(key)) return result(false, "obstacle_collision");
      const endpoint = endpointAt(cell.row, cell.column);
      if (endpoint && (index > 0 && index < cells.length - 1 || endpoint.color !== color)) {
        return result(false, "endpoint_collision");
      }
      if (otherPaths.has(key)) return result(false, "path_collision");
    }
    game.paths.set(color, cells);
    draft = null;
    render();
    return result(true, "accepted");
  }

  function newGame(seed) {
    game = buildGame(seed);
    draft = null;
    pointerDrawing = false;
    seedInput.value = String(game.seed);
    render();
    return snapshot();
  }

  function reset() {
    return newGame(game.seed);
  }

  function cellLabel(row, column, kind, color, pathColor) {
    const position = `ligne ${row + 1}, colonne ${column + 1}`;
    if (kind === "obstacle") return `Obstacle, ${position}`;
    if (kind === "source") return `Source ${color}, ${position}`;
    if (kind === "receiver") return `Récepteur ${color}, ${position}`;
    if (pathColor) return `Chemin ${pathColor}, ${position}`;
    return `Case libre, ${position}`;
  }

  function render() {
    const current = snapshot();
    root.dataset.state = current.state;
    root.dataset.seed = String(current.seed);
    status.value = current.won ? "Circuit complet" : `${current.connected_pairs}/3 signaux reliés`;
    status.textContent = status.value;
    board.replaceChildren();
    for (const cell of current.cells) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "maze-cell";
      element.dataset.cell = "true";
      element.dataset.row = String(cell.row);
      element.dataset.column = String(cell.column);
      element.dataset.kind = cell.kind;
      if (cell.color) element.dataset.color = cell.color;
      if (cell.path_color) element.dataset.pathColor = cell.path_color;
      if (draft?.cells.some((entry) => entry.row === cell.row && entry.column === cell.column)) {
        element.classList.add("is-preview");
        element.dataset.previewColor = draft.color;
      }
      element.setAttribute("role", "gridcell");
      element.setAttribute("aria-label", cellLabel(cell.row, cell.column, cell.kind, cell.color, cell.path_color));
      board.appendChild(element);
    }
  }

  function focusCell(row, column) {
    board.querySelector(`[data-row="${row}"][data-column="${column}"]`)?.focus();
  }

  function cellFromElement(element) {
    const cell = element?.closest?.("[data-cell]");
    if (!cell || !board.contains(cell)) return null;
    return { row: Number(cell.dataset.row), column: Number(cell.dataset.column), element: cell };
  }

  function startDraft(cell) {
    const endpoint = endpointAt(cell.row, cell.column);
    if (!endpoint) return false;
    draft = { color: endpoint.color, cells: [{ row: cell.row, column: cell.column }] };
    interactionStatus.textContent = `Signal ${endpoint.color} sélectionné`;
    render();
    focusCell(cell.row, cell.column);
    return true;
  }

  function extendDraft(cell) {
    if (!draft) return false;
    const cells = draft.cells;
    const last = cells[cells.length - 1];
    if (last.row === cell.row && last.column === cell.column) return true;
    if (cells.length > 1) {
      const previous = cells[cells.length - 2];
      if (previous.row === cell.row && previous.column === cell.column) {
        cells.pop();
        render();
        return true;
      }
    }
    if (Math.abs(last.row - cell.row) + Math.abs(last.column - cell.column) !== 1) return false;
    if (cells.some((entry) => entry.row === cell.row && entry.column === cell.column)) return false;
    const key = coordinateKey(cell.row, cell.column);
    const endpoint = endpointAt(cell.row, cell.column);
    if (game.obstacles.has(key) || endpoint && endpoint.color !== draft.color || pathOccupancy(draft.color).has(key)) return false;
    cells.push({ row: cell.row, column: cell.column });
    render();
    return true;
  }

  function commitDraft() {
    if (!draft) return;
    const color = draft.color;
    const outcome = applyPath(color, draft.cells);
    interactionStatus.textContent = outcome.accepted ? `Signal ${color} relié` : `Chemin refusé : ${outcome.reason}`;
    if (!outcome.accepted) {
      draft = null;
      render();
    }
  }

  board.addEventListener("pointerdown", (event) => {
    const cell = cellFromElement(event.target);
    if (!cell || !startDraft(cell)) return;
    pointerDrawing = true;
    try {
      board.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events used by the public recipe have no active browser pointer.
    }
    event.preventDefault();
  });

  board.addEventListener("pointermove", (event) => {
    if (!pointerDrawing || !draft) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const cell = cellFromElement(hit);
    if (cell) extendDraft(cell);
    event.preventDefault();
  });

  board.addEventListener("pointerup", (event) => {
    if (!pointerDrawing) return;
    pointerDrawing = false;
    try {
      if (board.hasPointerCapture?.(event.pointerId)) board.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released a cancelled pointer.
    }
    commitDraft();
    event.preventDefault();
  });

  board.addEventListener("pointercancel", () => {
    pointerDrawing = false;
    draft = null;
    render();
  });

  board.addEventListener("keydown", (event) => {
    const cell = cellFromElement(event.target);
    if (!cell) return;
    if (event.key === "Escape") {
      draft = null;
      render();
      event.preventDefault();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      if (draft) commitDraft();
      else startDraft(cell);
      event.preventDefault();
      return;
    }
    const delta = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    }[event.key];
    if (!delta) return;
    const nextRow = cell.row + delta[0];
    const nextColumn = cell.column + delta[1];
    const next = board.querySelector(`[data-row="${nextRow}"][data-column="${nextColumn}"]`);
    if (next) {
      if (draft) extendDraft({ row: nextRow, column: nextColumn });
      focusCell(nextRow, nextColumn);
    }
    event.preventDefault();
  });

  newGameButton.addEventListener("click", () => {
    const parsed = Number(seedInput.value);
    try {
      newGame(parsed);
      interactionStatus.textContent = "Nouvelle grille prête";
    } catch (error) {
      interactionStatus.textContent = error.message;
    }
  });

  resetButton.addEventListener("click", () => {
    reset();
    interactionStatus.textContent = "Grille réinitialisée";
  });

  globalThis.__SIGNAL_MAZE_CANDIDATE__ = Object.freeze({
    benchmark: "signal-maze-v1",
    implementation_started: true,
    implementation_kind: "visible_reference"
  });
  globalThis.__SIGNAL_MAZE_VISIBLE_API__ = Object.freeze({ newGame, snapshot, applyPath, reset });

  newGame(DEFAULT_SEED);
})();
