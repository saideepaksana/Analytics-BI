import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error, errorInfo) {
    console.error("MFE render error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card mfe-fallback">
          <h3>Service temporarily unavailable</h3>
          <p className="muted">{this.state.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
