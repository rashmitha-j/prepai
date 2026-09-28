import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('UI error', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container-narrow" style={{ padding: 48 }}>
          <div className="alert alert-error" role="alert">
            <div>
              <strong>This page crashed.</strong>
              <p>Reload the page to continue. If it keeps happening, go back to the dashboard.</p>
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
                  Reload
                </button>
                <a className="btn btn-ghost btn-sm" href="/dashboard">
                  Dashboard
                </a>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
