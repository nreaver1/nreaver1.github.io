import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 text-center">
        <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle size={24} className="text-red-400" />
        </div>
        <h2 className="font-display text-2xl text-white mb-2">Something went wrong</h2>
        <p className="text-white/40 text-sm mb-6 max-w-xs">
          {this.state.error?.message ?? 'An unexpected error occurred.'}
        </p>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="btn-secondary"
        >
          <RefreshCw size={15} /> Try Again
        </button>
      </div>
    )
  }
}
