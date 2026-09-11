import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function NotFound() {
  const { pathname } = useLocation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-8xl font-light text-muted-foreground/50">
            404
          </h1>
          <div className="mx-auto h-px w-12 bg-border" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-medium">Page not found</h2>
          <p className="text-muted-foreground">
            We couldn't find{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm break-all text-foreground">
              {pathname}
            </code>{" "}
            in this app.
          </p>
        </div>

        {/* Builder hint — dev preview only; stripped from the published build. */}
        {import.meta.env.DEV && (
          <Alert className="text-left">
            <Hammer className="size-4" />
            <AlertTitle>Still building?</AlertTitle>
            <AlertDescription>
              This page may not exist yet — ask Bool in the chat to create it.
            </AlertDescription>
          </Alert>
        )}

        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </Button>
      </div>
    </main>
  );
}
