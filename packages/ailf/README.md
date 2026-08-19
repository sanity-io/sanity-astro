# @repo/ailf

AI Literacy Framework (AILF) evaluation configuration for this repository. AILF measures how well AI coding agents can use a Sanity domain from its published docs. For `@sanity/astro` specifically, it measures whether an agent asked to build an Astro + Sanity site discovers the integration, configures it correctly, and composes it with the rest of the Astro toolchain.

Evaluations run via `.github/workflows/ailf-eval.yml` on PRs touching this package, on a weekly schedule, and via manual dispatch.

## What is being graded

Each `.task.ts` file under [`.ailf/tasks/`](.ailf/tasks/) describes a scenario a developer might ask for. Every task pairs with a `.reference.ts` file - an answer key showing the idiomatic solution. When AILF runs remotely, it prompts several LLMs with the task and grades their output via two rubrics:

- **`task-completion`** - does the output achieve the goal (correct config, working pages, complete schema)?
- **`code-correctness`** - does the output reach for `@sanity/astro` idioms (the `sanity()` integration, the `sanity:client` virtual module, `studioBasePath`) rather than hand-rolling equivalents with `@sanity/client`?

## Task inventory

| Task                                                                                         | Probes                                                                  | Style         |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| [`create-astro-site-with-sanity`](.ailf/tasks/create-astro-site-with-sanity.task.ts)         | Clean Astro + Sanity setup: integration config, virtual module, types   | `starter`     |
| [`add-sanity-to-existing-astro-site`](.ailf/tasks/add-sanity-to-existing-astro-site.task.ts) | Adding Sanity to an existing Astro site without breaking it             | `discovery`   |
| [`astro-blog-with-embedded-studio`](.ailf/tasks/astro-blog-with-embedded-studio.task.ts)     | Blog + embedded Studio: `studioBasePath`, schema, Portable Text, images | `composition` |

The starter task names `@sanity/astro` in the prompt as a warm-up. The other tasks describe an outcome without naming the API - discovery from the docs is the point.

## Running locally

Validate task files (no API key needed):

```bash
pnpm --filter @repo/ailf run ailf:validate
```

Run a smoke evaluation against the AILF API (uses `AILF_CLASSIFICATION=adhoc` so it stays out of trusted dashboards):

```bash
# Set AILF_API_KEY in your environment. Sanity employees can fetch it from 1Password
# (item "AI Literacy Framework - Shared API Tokens" in the Shared vault).
export AILF_API_KEY=...
pnpm --filter @repo/ailf run ailf:smoke
```

`ailf:smoke` runs with `--debug` for a fast subset. For a full run, invoke the CLI directly: `pnpm --filter @repo/ailf exec ailf run --remote`.

## Adding a task

1. Pick a scenario a developer would plausibly hit while building an Astro site with Sanity.
2. Write `<id>.task.ts` under `.ailf/tasks/` with the outcome framing in the prompt. Prefer not naming the API in the prompt - the model should discover it. Study an existing task file for the shape.
3. Write `<id>.reference.ts` as a single-file answer key. Use `// === Part N: <filename> ===` sections; put `.astro` markup in comments. Imports (`@sanity/astro`, `astro/config`, ...) are intentionally unresolved - the file is an answer key, not compiled code.
4. Include both `task-completion` and `code-correctness` rubrics when the "did they reach for the integration" question matters.
5. `pnpm --filter @repo/ailf run ailf:validate` to confirm the files parse.
6. Commit and open a PR - the workflow runs the full eval on push.

## Scores and the trusted dashboard

Every remote run writes a report to Sanity (`ailf-prod-private` dataset, `ailf.report` type). Reports from this repo have:

- `classification: 'adhoc'` - CI runs, set by `AILF_CLASSIFICATION` in the workflow. These do not aggregate into trusted dashboards.
- `area: 'astro'` - separates these scores from sanity core's `studio` area.
- `repo: 'sanity-io/sanity-astro'` - correct attribution.

If you run `ailf run --remote` locally without `AILF_CLASSIFICATION=adhoc`, the run may land in the trusted view. Use the `ailf:smoke` script, which sets the env var, or set it manually.
