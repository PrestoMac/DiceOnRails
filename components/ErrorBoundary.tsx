import React, { Component, ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

/** React error boundary that catches render errors and displays a fallback UI with a reload button. */
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex h-screen w-full items-center justify-center bg-stone-950 p-8">
          <div className="max-w-md text-center">
            <i className="fas fa-skull text-6xl text-amber-700 mb-6 opacity-50"></i>
            <h2 className="fantasy-font text-3xl text-amber-600 mb-4">Something Went Wrong</h2>
            <p className="text-stone-400 mb-6 font-mono text-sm">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="bg-amber-700 hover:bg-amber-600 text-white px-8 py-3 rounded-lg font-bold uppercase tracking-wider transition-all">
              Reload Adventure
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
