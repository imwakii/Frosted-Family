import 'react'

// React's types leave out MathML, which React itself renders fine.
type MathProps = { children?: React.ReactNode; className?: string; display?: string; mathvariant?: string; 'aria-label'?: string }

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      math: MathProps; mrow: MathProps; mi: MathProps; mo: MathProps; mn: MathProps; mfrac: MathProps
    }
  }
}
