# Circuit Simulator

A browser workbench for learning electrical control circuits: draw a schematic with IEC symbols, wire it, and press the buttons to watch it work. Built as a reliable, friendly alternative to the tools used in FP classes today.

**Status: 0.2 — a working editor.** Add parts, wire them, move them (wires follow), copy and paste, and simulate pushbuttons, contactors with self-holding and lamps. Work is saved in the browser automatically. Debugging tools ("why is this off?") come next.

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
- **Add a part:** click it in the Parts list; it lands in the middle of the view, selected. Drag parts to move them; their wires follow.
- **Select:** click a part or wire; <kbd>Shift</kbd>-click adds; <kbd>Shift</kbd>-drag on empty space selects an area. <kbd>Delete</kbd> removes, <kbd>Ctrl C</kbd> / <kbd>Ctrl V</kbd> pastes at the cursor, <kbd>Ctrl D</kbd> duplicates.
- **Move a wire's end:** select the wire, then drag its end to another terminal.
- **Link a contact to its coil:** give them the same tag (KM1) in the inspector.
- <kbd>Ctrl Z</kbd> / <kbd>Ctrl Shift Z</kbd> undo and redo. Scroll to zoom, drag empty space to pan.

## Checks

```bash
npm test           # every engine rule and wiring case, in about a second
npm run verify     # typecheck + tests + build
npm run test:browser  # the built app in a real browser (CI runs this too)
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
| `src/editor` | The sheet editor's behaviour (select, move, wire, pan, copy/paste), with no screen in it, so it is tested directly. |
| `src/ui` | The Svelte interface: canvas, palette, inspector, autosave. |
| `tests` | Engine, edit and editor tests, the wiring case catalogue, and browser tests (`tests/e2e`). |
