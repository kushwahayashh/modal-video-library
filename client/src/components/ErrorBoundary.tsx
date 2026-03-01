import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            backgroundColor: "var(--bg-primary)",
            padding: "24px",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              padding: "32px",
              maxWidth: "480px",
              width: "100%",
              textAlign: "center",
            }}
          >
            <h1
              style={{
                color: "var(--text-primary)",
                fontSize: "18px",
                fontWeight: 500,
                marginBottom: "12px",
              }}
            >
              Something went wrong
            </h1>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "14px",
                marginBottom: "24px",
                wordBreak: "break-word",
              }}
            >
              {this.state.error?.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "8px 20px",
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
