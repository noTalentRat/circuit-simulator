# Working on this project

Owner: noTalentRat. He designs and decides; Claude writes nearly all the code. He doesn't program, so explain changes in terms of what the app does, not code. When he proposes a feature, weigh it against the problem it solves and offer better alternatives before building.

## Sources of truth
- **Vision doc** (Claude Doc "Circuit Simulator — Vision", https://claude.ai/artifact/DcDYLryiAMgmvYJbw2mtRJ): problem, decisions, Wiring spec v1, wiring case catalogue, build order and the status line. Update its status line at the end of a session.
- **Wiring case catalogue** = `tests/wiring/catalogue.test.ts`. Same IDs (W01…). A new reported case goes into both, as a test first.
- Live app (GitHub Pages, deployed by CI from main): https://notalentrat.github.io/circuit-simulator/
- **Design principles** (tab "Design principles" in the vision doc, https://claude.ai/artifact/DcDYLryiAMgmvYJbw2mtRJ#e273f752-df0a): the map of design knowledge we draw on, the principles in use, and what to check next.
- Wire spike prototype (reference only): https://claude.ai/artifact/KAcs8dMyC8ax4AtD2HctcK

## Value and north star
What we build is not new; the experience is. A tool that feels good to build with (beautiful, nice to use, satisfying) and helps you understand, free in the browser, for students who fight CADe_SIMU. Scope: circuits, logic gates, PLC with ladder, process control; grafcet, pneumatics and plants are later. "Modern" is never a goal on its own; it comes out of careful design decisions and never costs functionality.

## Rules
1. `src/core` has no DOM and no Svelte. Engine, router and model must run in tests, a web worker and a grader.
2. The document changes only through `History.commit` with builders from `commands/edits.ts`. No direct mutation from the UI.
3. Every interface string goes through `t()` with keys in `src/core/i18n`. Spanish must cover every English key (a test enforces it).
4. Wiring numbers live in `src/core/wiring/constants.ts`, named as in the spec. Distances are screen pixels, divided by zoom.
5. Test first for wiring and engine behaviour: write the failing case, then change the code. Run `npm run verify` before every push.
6. IEC first (designations S1, KM1, H1; symbols per IEC 60617). Keep symbol drawing separate so a NEMA set can be added.
7. **Design with principles in view.** Before building any feature that changes how the app looks or behaves, read the Design principles tab, name the two or three principles that apply, explain them to the owner in plain words (what they are and how they shape this design), and check the design against them. When a principle shapes a decision for the first time, add it to that tab's "In use" list with what it changed. One lens at a time: don't try to apply everything at once.
8. **Review gate before a release** that changes the interface: a pass through Nielsen's 10 heuristics, and suggest the owner runs the 5-minute classmate test.

## Layout
- `src/core` — model, History, engine, wiring router. No DOM.
- `src/editor/editor.ts` — the sheet editor's pointer/keyboard behaviour, screen-free (selection, move, box select, wiring, reconnect, pan/zoom/auto-pan, clipboard). Tested in `tests/editor` and the catalogue.
- `src/ui` — Svelte: thin canvas (`Sheet.svelte`) over the editor, palette, inspector, autosave (`storage.ts`, IndexedDB).
- `tests/e2e` — browser tests (Playwright), run in CI. Locally: `npm run build && CHROME_PATH=/usr/bin/google-chrome npm run test:browser`.

## Status (9 Nov 2026, version 0.2.1)
Done: everything in 0.1 (model, History, engine with contactors and self-holding, router, W01–W13) plus editor basics: parts palette, moving parts (wires reroute), box select, delete, copy/paste at cursor, duplicate, reconnecting wire ends, tag editing (contacts link to their coil by tag), New / examples as undoable steps, IndexedDB autosave with a Saved label, browser tests in CI. 0.2.1: drag on empty space selects; scroll / Space + drag / middle button move the view; Ctrl + scroll or pinch zooms.
Todo in the catalogue: W14 (wiring v1.1, chain mode).

## Next
First: a design-language session is planned before the interface grows much further (see Open questions in the vision doc).
Then build order step 4, debugging: "Why is this off?" (click a load, trace from L, highlight the first open contact or break), loose-end warnings, then the first component set (thermal relay, motor, timers) for forward/reverse and star-delta.
