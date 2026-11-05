import { Component, type ReactNode } from 'react'
import { GoblinNote } from './ui'

// A page that throws shows this instead of a blank screen. Around the whole app it also leaves the link that broke,
// so reloading can't land on the same crash.

export default class ErrorBoundary extends Component<{ root?: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  reload = () => {
    if (this.props.root) history.replaceState(null, '', '#/war')
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex flex-col items-center gap-3 px-4 pt-16">
        <GoblinNote goblin="panic">A goblin got into the wiring</GoblinNote>
        <button type="button" onClick={this.reload} className="min-h-11 cursor-pointer rounded-full border border-line bg-white px-4 text-sm font-bold text-ink-2 hover:bg-hover">Reload</button>
      </div>
    )
  }
}
