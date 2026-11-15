---
'@sanity/astro': patch
---

In `astro dev`, only dedupe, alias and pre-bundle React, `styled-components` and `sanity` when the project itself installs them. Packages that only `NODE_PATH` reached, which pnpm's bin shims point at the hidden `node_modules/.pnpm/node_modules` directory, were treated as installed. A project without React of its own could then get the overlays of `<VisualEditing />` built against two copies of React and fail with "Invalid hook call"
