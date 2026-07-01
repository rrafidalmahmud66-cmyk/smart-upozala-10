import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, copied: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by Smart Upazila ErrorBoundary:', error, errorInfo);
    
    // Auto reload if it's a dynamic chunk loading failure or MIME type matching error
    const errorString = String(error.message || '').concat(String(error.stack || ''));
    const isChunkError = 
      /Failed to fetch dynamically imported module/i.test(errorString) ||
      /error loading dynamic import/i.test(errorString) ||
      /is not a valid JavaScript MIME type/i.test(errorString) ||
      /MIME type/i.test(errorString);
      
    if (isChunkError) {
      console.warn('Chunk loading or MIME type error detected. Attempting auto reload to grab the latest bundle assets...');
      const lastReload = sessionStorage.getItem('chunk_error_reload');
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload) > 12000) {
        sessionStorage.setItem('chunk_error_reload', now.toString());
        window.location.reload();
      }
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, copied: false });
    window.location.reload();
  };

  private handleCopy = async () => {
    if (!this.state.error) return;
    try {
      await navigator.clipboard.writeText(
        `Smart Upazila Error Log:\nMessage: ${this.state.error.message}\nStack: ${this.state.error.stack}`
      );
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch (err) {
      console.error('Failed to copy error text to clipboard', err);
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 selection:bg-rose-500/10">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
            
            {/* Visual Header */}
            <div className="flex justify-center mb-6">
              <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-full text-rose-600 dark:text-rose-400">
                <ShieldAlert className="w-12 h-12" />
              </div>
            </div>

            {/* Error Content */}
            <h1 className="text-2xl font-semibold text-center text-slate-900 dark:text-slate-50 tracking-tight font-sans">
              দুঃখিত! কিছু সমস্যা হয়েছে।
            </h1>
            <p className="text-sm font-sans text-center text-slate-500 dark:text-slate-400 mt-2">
              Something went wrong. The application encountered an unexpected error.
            </p>

            {/* Error Message Panel */}
            {this.state.error && (
              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-100 dark:border-slate-850 text-left">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-mono font-medium text-rose-500 dark:text-rose-400">
                    ERROR LOG
                  </span>
                  <button
                    onClick={this.handleCopy}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-2xs"
                    title="Copy Error to Clipboard"
                  >
                    {this.state.copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="max-h-36 overflow-y-auto text-xs font-mono text-slate-600 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">
                  {this.state.error.message || 'Unknown runtime exception.'}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 active:scale-[0.98] transition shadow-xs cursor-pointer text-sm font-sans"
              >
                <RefreshCw className="w-4 h-4 animate-spin-hover" />
                ফিরে যান (Reload Platform)
              </button>
              
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-3 px-4 bg-transparent border border-slate-200 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-400 font-medium rounded-xl active:scale-[0.98] transition cursor-pointer text-sm font-sans"
              >
                হোমপেজ (Go Home)
              </button>
            </div>

            {/* System Credit */}
            <p className="mt-8 text-center text-[11px] font-mono text-slate-400 dark:text-slate-600">
              SMART UPAZILA DEPLOYMENT AGENT
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
