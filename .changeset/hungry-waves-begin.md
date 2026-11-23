---
'@sanity/astro': minor
---

Summary to come, with the rest of documentation on this draft PR.

In its own draft for now, we replace sanity-astro visual editing handling with a new implementation, which gives a much more professional dependability to Astro based Sanity Studio editing. 
- This gives compatibility with visual-editing-standalone and removal of all prior blocks against using the latest Sanity Studio upgrades. 
- -It provides a new mechanism to clean up a long problem with missed visual editing updates for single or few characters typed after a human pause, such as the case of a moment to consider at the end of a phrase, before adding a comma or period. 
- The tunability of th feature is helps additionally for deployments where poor internet is likely to be available for Studio. A number of more minor issues see improvments.
