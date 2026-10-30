# Queue design verification

The user selected option 2, inspired by Spotify queue controls, before implementation. The running application now uses matte dark surfaces, one lime primary action, top navigation, an editable two-show queue, and a side-by-side invitation preview on desktop. Mobile stacks these surfaces and retains a fixed review action.

The reference is an interaction pattern, not a copied Spotify interface or affiliation. Artwork is original geometric CSS and explicitly labels fictional sample shows. Artist names remain complete, and dates use each event’s timezone.

Campaign preferences, workspace import, provider evidence and recipient details use native disclosure controls. The selected buyer drives both the queue and invitation. Feasible alternatives, removal and keyboard-accessible reordering are real actions. Operator edits clear provider evidence, label the result operator curated, invalidate approval and preserve the reporting cohort. Review reveals copy editing, human approval and export, with focus moved to the visible review stage; exporting never sends a message.

Final production screenshots are `artifacts/SecondShow-current-desktop.png` (1440 × 1000) and `artifacts/SecondShow-current-mobile.png` (390 × 844). Their source is the real application, using the Japanese Breakfast sample cohort. Both were inspected visually. A browser check at 320, 390, 768, 1024 and 1440 pixels found no horizontal overflow, no browser errors, and a visible review action. Evidence is saved in `artifacts/SecondShow-screenshots.verification.json`.

The sample journey and live-provider mocks passed browser tests. Separate live-provider tests are documented in [NEBIUS.md](NEBIUS.md) and [VALIDATION.md](VALIDATION.md); their single-candidate result does not establish comparative ranking quality.
