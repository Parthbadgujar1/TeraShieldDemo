import { Component, type ErrorInfo, type ReactNode } from "react";

/** Keeps one broken panel from failing silently: shows what went wrong and how to recover. */
export default class ErrorBoundary extends Component<{ children: ReactNode; label?: string; resetKey?: unknown }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) { console.error("TeraShield UI error", error, info.componentStack); }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="notice err" role="alert" style={{ margin: 12 }}>
        <b>{this.props.label ?? "This view"} could not be displayed.</b>
        <div className="small">{this.state.error.message}</div>
        <div className="small">Data may be out of date in this browser — <button className="linklike" onClick={() => window.location.reload()}>reload the page</button> (or hard-refresh with Ctrl+F5).</div>
      </div>
    );
  }
}
