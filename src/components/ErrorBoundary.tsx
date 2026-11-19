import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('LingForge interface error', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-error">
          <p className="overline">LINGFORGE</p>
          <h1>The workspace could not be displayed.</h1>
          <p>Reload the interface to try again.</p>
          <button
            className="outline-button"
            onClick={() => window.location.reload()}
          >
            Reload workspace
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
