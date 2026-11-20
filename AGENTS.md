# Flow engineering instructions

Apply these rules when adding, changing, or removing features. Follow the user's
requested scope and preserve unrelated work. Prefer simple, readable solutions
over abstractions introduced for hypothetical future requirements.

## Understand the change

- Read the relevant source, tests, [design guide](docs/DESIGN.md), and
  [testing guide](docs/TESTING.md) before editing.
- Identify the source of truth and affected entry points. Fix the underlying
  cause rather than hiding a symptom with another override.
- State consequential assumptions. Do not expand scope or introduce dependencies
  without a concrete benefit.

## Architecture and feature boundaries

- Keep timer accounting and validation in `src/domain.ts`; keep task, goal, and
  statistics calculations in their existing domain modules. These modules must
  remain independent of React and Chrome APIs.
- Keep persisted mutations and browser effects behind the serialized command
  boundary in `src/background.ts`. UI components request actions rather than
  writing timer state directly.
- Keep page-specific UI in cohesive components. Extract a component when it has
  its own responsibility or repeated behavior, not merely to shorten a file.
- Use strongly typed actions and settings. Validate persisted, imported, and
  message data at the existing boundaries. New preferences need compatible
  defaults and migration coverage; never silently reset existing preferences.
- The permanent default task uses null attribution, including its daily goal.
  Its editable metadata must not replace that identity or rewrite history. Keep
  archive/delete protection at the command boundary, not only in the UI.
- When removing a feature, trace and remove its UI, actions, effects, tests,
  styling, permissions, and documentation as applicable. Preserve existing data
  deliberately; do not remove shared code still used by another feature.

## Maintainable implementation

- Reuse existing helpers and design tokens. Keep names descriptive, functions
  focused, and dependencies minimal. Avoid duplicated state and derived values
  stored separately without a demonstrated need.
- Use targeted edits and inspect the resulting diff. Avoid broad text replacements
  across CSS selectors or unrelated components. Remove superseded rules instead
  of accumulating conflicting declarations and specificity overrides.
- Put shared popup dimensions in CSS custom properties. Keep base control rules
  separate from component styles so a change to inputs cannot restyle buttons.
- Handle async errors visibly. Optimistic UI must reconcile with persisted state
  after failure, including overlapping operations. Do not silently swallow errors
  or leave a control showing an unsaved value.
- Do not hardcode secrets or environment-specific paths. Add no permissions or
  external requests beyond those needed for the authorized feature.

## Popup and accessibility requirements

- Follow the current size and appearance contract in `docs/DESIGN.md`. Do not
  change the overall layout for unrelated feature work.
- Keep the timer home at 300px by 340px across session states. Other pages retain
  the shared width but use natural heights and bounded scrolling.
- Review connected UX states together. Starting a timer must preserve its circle,
  size, and position; do not substitute a bar or move unrelated controls. Add
  regression coverage for the transition as well as each static state.
- Chrome sizes the popup from its contents. Do not derive popup panel heights
  from `vh`, `dvh`, or the popup's current viewport height: this can create a
  feedback loop that collapses pages. Use a bounded content height instead.
- Ensure open navigation fits within short popup states. Test actual hit targets,
  clipping, keyboard navigation, focus, and scrolling, not just DOM visibility.
- Preserve meaningful labels, focus indicators, control descriptions, readable
  contrast, disabled states, and reduced-motion support in both themes.
- Check empty, populated, long-text, error, confirmation, and active-session states
  relevant to the change. A fixed browser tab viewport is not proof that a native
  popup resizes correctly.

## Running E2E tests

When running E2E tests, invoke npm.cmd directly rather than wrapping the command in PowerShell.

Use:

```bash
npm.cmd run test:e2e -- --grep "test name"
```

## Verification and completion

- Add focused regression coverage for meaningful behavior changes. Reproduce bugs
  with a failing test when practical, including the conditions that exposed them.
- For sizing or navigation changes, run the content-resizing regression and inspect
  rendered screenshots at the intended dimensions in light and dark themes.
- Run the checks relevant to the change: `npm test`, `npm run test:e2e`,
  `npm run build`, `npm run format:check`, `npm run verify:extension`, and
  `git diff --check`. Run tooling tests for build, packaging, or release changes.
- Review the diff for unintended edits and update affected documentation. Report
  what was actually verified and any limitations; never claim unexecuted tests pass.
- Do not commit, push, overwrite unrelated changes, or perform destructive Git
  operations unless the user requests them.
