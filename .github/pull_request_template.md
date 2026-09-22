## What changes, and why

<!-- One or two sentences. If it closes an issue, reference it: Closes #123 -->

## How you verified it

<!-- What you ran or clicked to know it works. -->

## Checklist

- [ ] I read `AGENTS.md` and nothing here reopens a decision from the "Stopping points" section
- [ ] `pnpm exec next typegen && pnpm typecheck`, `pnpm test` and `pnpm lint` pass
- [ ] A business rule that was touched has a test, and the test runs without a database
- [ ] No collection data, card image bytes or personal name in the diff
- [ ] The comment that explained the changed decision was updated along with it
- [ ] The diff does not translate code comments or domain identifiers into English
