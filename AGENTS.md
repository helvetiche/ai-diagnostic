# Working rules for this repo

## Do not run checks on your own

After a change, do not run any of these unless the user asks for it:

- `npm run check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run doctor`
- `npm run format`
- any other lint, test, typecheck, build, or diagnostic step

Make the requested change, report what changed, and stop. The user runs
verification when they want it.

Design direction lives in `docs/DESIGN.md`. Build order lives in
`docs/BUILD.md`.
