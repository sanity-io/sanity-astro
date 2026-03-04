import React from 'react'
// @ts-ignore
import {config} from 'sanity:studio'
import {Studio} from 'sanity'

if (!config) {
  throw new Error(
    "[@sanity/astro]: Can't load Sanity Studio. Check that you've configured it in `sanity.config.js|ts`.",
  )
}

export function StudioComponent() {
  return (
    <div
      data-ui="AstroStudioLayout"
      style={{
        height: '100vh',
        maxHeight: '100dvh',
        overscrollBehavior: 'none',
        WebkitFontSmoothing: 'antialiased',
        overflow: 'hidden',
      }}
    >
      <Studio config={config} />
    </div>
  )
}
