import { Component, ReactNode } from "react";

interface Props { children: ReactNode; name?: string; }
interface State { error: Error | null; }

export default class PanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(e: Error): State { return { error: e }; }
  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-800/40 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-red-400">{this.props.name || "Panel"} Error</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono max-w-sm">{this.state.error.message}</p>
          </div>
          <button
            onClick={this.reset}
            className="px-4 py-1.5 text-xs bg-muted/60 hover:bg-muted border border-border rounded text-foreground"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
