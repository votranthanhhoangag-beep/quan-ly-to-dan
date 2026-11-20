import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary đã bắt lỗi runtime:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (e) {
        console.error('Lỗi khi gọi onReset của ErrorBoundary:', e);
      }
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            padding: '20px',
            margin: '16px 0',
            borderRadius: '10px',
            backgroundColor: '#fef2f2',
            border: '2px solid #f87171',
            color: '#991b1b',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
              {this.props.fallbackTitle || 'Đã xảy ra lỗi khi hiển thị khu vực này'}
            </h3>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#7f1d1d', lineHeight: '1.5' }}>
            Hệ thống đã tự động khoanh vùng lỗi để tránh làm trắng toàn bộ trang web. Bạn có thể bấm nút bên dưới để thử tải lại khu vực này.
          </p>
          {this.state.error?.message && (
            <div
              style={{
                padding: '8px 12px',
                marginBottom: '14px',
                borderRadius: '6px',
                backgroundColor: '#fee2e2',
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#b91c1c',
                wordBreak: 'break-word'
              }}
            >
              {this.state.error.message}
            </div>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '9px 18px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🔄 Thử Lại / Khôi Phục Giao Diện
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
