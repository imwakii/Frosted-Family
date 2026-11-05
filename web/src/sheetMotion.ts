import { useEffect, useState } from 'react'

// A sheet slides up when it opens over the page. Going from one sheet straight to another swaps the contents in place,
// so the card does not leave and come back. The old sheet is still mounted while the new one first renders.
let open = 0
let visit = 0

/** Counts each time the sheets are all closed, so a place remembered inside one visit is forgotten after it. */
export const sheetVisit = () => visit

export function useSheetMotion() {
  const [swapped] = useState(() => open > 0)
  useEffect(() => {
    open += 1
    return () => {
      open -= 1
      // Still none open once the swap has settled: the reader has gone back to the page.
      window.setTimeout(() => { if (!open) visit += 1 }, 0)
    }
  }, [])
  return swapped ? { sheet: '', fade: '' } : { sheet: 'ff-sheet', fade: 'ff-fade' }
}
