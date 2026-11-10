# Notes

This branch contains the visual-editing-standalone version of sanity-astro.

It should slot into an app just as the basis sanity-astro has, in Layout.astro.

It provides full compatibility with latest Sanity Studio and Astro modules. It also implements the latest missed-typing at pauses ability.

No strategy targeting is provided - it just works.

## Upgrades version

This is the first version. Small upgrades anticipated, but functionality is all here. In particular, Vite config may simplify.

## actual version on build
3.6.0-standalone.base

This will appear on the tgz mentioned below for build, for file import into app on same filesystem, as tested here.

The testing app is based on the sanity-astro-clean blog template, which needs no modification here except importing this build for sanity-astro.

Be sure in testing to hotwire your loadQuery() to pull drafts, as shown in the item about sanity.ts, so that Visual Editing will show the edited data in the iframed web page.

## building local tgx for local install

In sanity-astro/packages/sanity-astro

pnpm build && pnpm pack

## Loading local sanity-astro

In your app folder, 
npm install  ../../../sani/sanity-astro-cody/packages/sanity-astro/sanity-astro-3.6.0-standalone.base.tgz

## modified utils/sanity.ts

For this segmented package, the middleware isn't available to track Studio perspective in the app. 

Thus, hotwire your app, likely in loadQuery, to request the `drafts` perspective. 

That way, when you try Visual Editing in Studio, you'll be viewing the edited data in the iframed web page.