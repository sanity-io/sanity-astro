---
'@sanity/astro': patch
---

Fix the opt-in follow-up reload so it still runs after a React remount (for example Strict Mode): cancelling a pending follow-up restores the sessionStorage marker instead of dropping it.
