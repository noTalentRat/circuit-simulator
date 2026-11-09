# Circuit Simulator

A browser workbench for learning electrical control circuits: draw a schematic with IEC symbols, wire it, and press the buttons to watch it work. Built as a reliable, friendly alternative to the tools used in FP classes today.

**Status: 0.1 — the foundations.** The data model, undo, simulation engine (with contactors and self-holding) and the wiring router are in place and tested. The editor itself (adding and moving parts, autosave, export) comes next.

Vision, decisions and the wiring spec live in the project's vision doc. The wiring case catalogue there (W01–W14) is mirrored one-to-one in [`tests/wiring/catalogue.test.ts`](tests/wiring/catalogue.test.ts).

## Try it

**Live:** https://notalentrat.github.io/circuit-simulator/ (updates on every push to `main`)

Or run it locally:

```bash
npm install
npm run dev        # open the printed localhost link
```

- **Press a pushbutton:** hold its head (the bracket on the left).
- **Wire:** drag from a terminal to another one, or click a terminal and then click where the wire should go (click empty space to place a corner).
- While wiring: <kbd>Space</kbd> flips the corner, <kbd>Alt</kbd> turns snapping off, <kbd>Backspace</kbd> removes the last corner, <kbd>Esc</kbd> cancels.
- <kbd>Ctrl Z</kbd> / <kbd>Ctrl Shift Z</kbd> undo and redo. Scroll to zoom, drag empty space to pan.

## Checks

```bash
npm test           # every engine rule and wiring case, in about a second
npm run verify     # typecheck + tests + build: what CI runs on every push
```

## How it's organised

| Folder | What lives there |
| --- | --- |
| `src/core/model` | The circuit as data: parts, terminals, wires. Connections are stored, never inferred from pixels. |
| `src/core/commands` | `History`: every edit is a reversible command, so undo can't drift from the sheet. |
| `src/core/engine` | The simulator: nets, contacts, coils, settling, fixed-step clock. No DOM, so it can run in a worker or grade exercises. |
| `src/core/wiring` | Wire runs (`WiringSession`) and the router, following Wiring spec v1. |
| `src/core/library` | One definition per part: symbol box, terminals, behaviour. |
| `src/core/i18n` | Every interface string, in English and Spanish. |
| `src/ui` | The Svelte interface: the sheet (canvas) and app state. |
| `tests` | Engine tests and the wiring case catalogue. |
