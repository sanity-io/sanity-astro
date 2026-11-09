---
'@sanity/astro': patch
---

author: @narration-sd

The default preview refresh works again with `experimental_refreshStrategy` set to `'reload'` or `{type: 'reload', followUpDelayMs}`. A Studio mutation or a manual refresh reloads on the next turn, so Presentation can finish its refresh message before the page goes away, and the follow-up reload only runs for a mutation that landed during that reload. An Astro attribute string such as `{type: 'reload', followUpDelayMs: 1200}` is accepted. In `astro dev` on Windows, the Studio module-dedupe aliases resolve package roots that use Windows paths.
