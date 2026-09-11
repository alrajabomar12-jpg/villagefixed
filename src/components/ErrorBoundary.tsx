import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error:", error, info.componentStack);
    // React 19 routes boundary-caught errors to the console only — no window
    // "error" event — so without this the editor preview would never hear
    // about the crash (its runtime-error bridge listens on window events).
    // Report in the bridge's own envelope. Inert outside the editor preview:
    // a published app loads top-level, where parent === window.
    if (window.parent !== window) {
      try {
        window.parent.postMessage(
          {
            source: "bool-runtime-error",
            message: String(error.message || error),
            stack: error.stack ?? null,
          },
          "*"
        );
      } catch {
        // Reporting is best-effort; never let it mask the original error.
      }
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-2xl font-medium">Something went wrong</h1>
            <p className="text-muted-foreground">
              This page ran into a problem. Reloading usually fixes it.
            </p>
          </div>

          {/* Builder hint — dev preview only; stripped from the published build. */}
          {import.meta.env.DEV && (
            <Alert variant="destructive" className="text-left">
              <AlertTitle>What broke</AlertTitle>
              <AlertDescription>
                <code className="font-mono text-xs break-words">
                  {error.message}
                </code>
              </AlertDescription>
            </Alert>
          )}

          <Button onClick={() => window.location.reload()}>
            <RefreshCw className="size-4" />
            Reload
          </Button>
        </div>
      </main>
    );
  }
}
