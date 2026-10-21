# Zenith Observatory — studio

Sanity Studio v6 for the [`observatory`](../observatory) reference app: Structure, Presentation
(Visual Editing against `http://localhost:4325`), Vision, and the content variants beta (behind
`SANITY_STUDIO_VARIANTS_ENABLED`).

- `pnpm dev` — studio on `http://localhost:3333`
- `pnpm seed` — idempotent content seed (deterministic SVG artwork, base documents, audience
  variants where the project supports them); requires `SANITY_AUTH_TOKEN` in `.env`
- `pnpm typegen` — extracts the schema and regenerates
  `../observatory/src/sanity/sanity.types.ts`

See the [site README](../observatory/README.md) for the full architecture tour.
