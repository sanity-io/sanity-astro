# Zenith Observatory — reference implementation

A fictional public observatory's marketing site, built as the **reference implementation of
advanced Sanity features on current Astro**. Together with its companion studio
([`apps/observatory-studio`](../observatory-studio)), it exists to answer one question precisely:

> What does a best-practices Sanity + Astro site require today, and how much of it should
> `@sanity/astro` absorb?

Everything here is deliberately hand-rolled: the app does **not** depend on `@sanity/astro`. Each
subsystem below is the "before" picture for future integration work, and the
[boilerplate inventory](#boilerplate-inventory) maps every piece to what the integration already
covers versus what it lacks.

## Quick start

```sh
pnpm install
pnpm dev:observatory   # site on :4325, studio on :3333