# DiceOnRails — Agent Instructions

## Working style
- Understand the problem before changing code. Trace the flow end to end, then make the smallest change that works.
- Match existing code style and patterns. Reuse existing helpers and libraries before writing new ones.
- Don't add abstractions, config, or boilerplate that isn't needed yet.
- Never leave secret keys or credentials in code, commits, or logs.

## Commands
- `npm run dev` — start the dev server (runs preflight, then Vite on port 3000)
- `npm test` — run the test suite (stops on first failure)
- `npm run test:ci` — same as `npm test`, verbose
- `npm run lint` — run ESLint
- `npm run build` — production build

## Rules
- Run `npm run lint` and `npm test` after any change and confirm they pass before declaring work done.
- Test files live in `tests/`, not next to source.
- Verify whether a feature already exists before building it.
- Keep the change focused on what was asked; don't refactor unrelated code while you're in there.

## Documentation
- Don't create or rewrite documentation files unless asked.
- If the user asks for docs, keep them lean and accurate.
