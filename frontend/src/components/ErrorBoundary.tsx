import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import i18n from "@/i18n";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-background rounded-lg border border-border shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 mb-4">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-xl font-bold mb-2">{i18n.t('errors.somethingWentWrong')}</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            {i18n.t('errors.unexpectedError')}
          </p>
          <div className="flex gap-4">
            <Button onClick={this.handleReset} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              {i18n.t('errors.reloadPage')}
            </Button>
            <Button onClick={() => window.history.back()} variant="outline">
              {i18n.t('errors.goBack')}
            </Button>
          </div>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <div className="mt-8 p-4 bg-muted rounded-md text-left w-full overflow-auto text-sm max-w-2xl font-mono text-muted-foreground">
              {this.state.error.toString()}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
