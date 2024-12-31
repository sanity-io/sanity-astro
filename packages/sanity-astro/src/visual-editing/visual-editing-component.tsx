import React from 'react'
import {
  VisualEditing as InternalVisualEditing,
  type VisualEditingOptions as InternalVisualEditingOptions,
} from '@sanity/visual-editing/react'
import {createPortal} from 'react-dom'

export type VisualEditingOptions = Pick<InternalVisualEditingOptions, 'zIndex'>

export function VisualEditingComponent(props: VisualEditingOptions) {
  return createPortal(
    <InternalVisualEditing
      zIndex={props.zIndex}
      refresh={() => {
        return new Promise((resolve) => {
          window.location.reload()
          resolve()
        })
      }}
    />,
    document.body.parentNode,
  )
}
