import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-lab-bg flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="text-5xl">!</div>
            <h1 className="text-xl font-semibold text-white">Something went wrong</h1>
            <p className="text-lab-muted text-sm">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-lab-accent text-white rounded-lg hover:bg-lab-accent/80 transition-colors text-sm"
            >
              Reload page
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
