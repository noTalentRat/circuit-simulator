# Working on this project

Owner: noTalentRat. He designs and decides; Claude writes nearly all the code. He doesn't program, so explain changes in terms of what the app does, not code. When he proposes a feature, weigh it against the problem it solves and offer better alternatives before building.

## Sources of truth
- **Vision doc** (Claude Doc "Circuit Simulator — Vision", https://claude.ai/artifact/DcDYLryiAMgmvYJbw2mtRJ): problem, decisions, Wiring spec v1, wiring case catalogue, build order and the status line. Update its status line at the end of a session.
- **Wiring case catalogue** = `tests/wiring/catalogue.test.ts`. Same IDs (W01…). A new reported case goes into both, as a test first.
- Wire spike prototype (reference only): https://claude.ai/artifact/KAcs8dMyC8ax4AtD2HctcK

## Rules
1. `src/core` has no DOM and no Svelte. Engine, router and model must run in tests, a web worker and a grader.
2. The document changes only through `History.commit` with builders from `commands/edits.ts`. No direct mutation from the UI.
3. Every interface string goes through `t()` with keys in `src/core/i18n`. Spanish must cover every English key (a test enforces it).
4. Wiring numbers live in `src/core/wiring/constants.ts`, named as in the spec. Distances are screen pixels, divided by zoom.
5. Test first for wiring and engine behaviour: write the failing case, then change the code. Run `npm run verify` before every push.
6. IEC first (designations S1, KM1, H1; symbols per IEC 60617). Keep symbol drawing separate so a NEMA set can be added.

## Status (9 Nov 2026)
Done: project setup, model, History, engine (pushbuttons, lamps, contactor coil + NO/NC contacts, self-holding, short and oscillation detection, fixed-step clock), wiring session + router with W01–W08, W10–W13 passing, Svelte shell that renders, simulates and wires.
Todo in the catalogue: W09 and W01's pan/auto-pan (need the editor's pointer controller), W14 (v1.1).

## Next (build order step 3, editor basics)
Parts palette and placing, moving parts (wires follow), deleting, copy/paste at cursor, autosave to IndexedDB with a Saved label, browser tests (Playwright) for W09 and W01's pan.
