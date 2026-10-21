---
'@sanity/astro': minor
---

Add an experimental, opt-in `experimental_refreshStrategy` prop to `VisualEditing` and `VisualEditingComponent` that picks how the preview updates when the Studio reports a change. `'reload'`, the default, reloads the page exactly as before. `{type: 'reload', followUpDelayMs: 1200}` reloads once more that many milliseconds after a change-triggered reload, so text typed in the Studio while the page was reloading shows up in the preview. Nothing changes unless you set it.
