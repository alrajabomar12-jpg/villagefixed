import { RefreshCw, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What kind of "no" this was. Drives the copy, and it's exported so a screen
 * can branch on it (e.g. don't offer Retry on a limit that lasts all day). */
export type AiErrorKind =
  /** The app's shared budget is gone until it refills. Retrying won't help. */
  | "paused"
  /** This app's share of today's budget is spent. Back tomorrow. */
  | "daily_limit"
  /** This visitor went too fast. A moment fixes it. */
  | "too_fast"
  /** The model didn't answer, or the call failed on the way. Retry is fair. */
  | "failed";

export type AiErrorInfo = {
  kind: AiErrorKind;
  /** One short line, safe to show any visitor. */
  title: string;
  /** A sentence of what to do about it. */
  message: string;
  /** True when trying the same thing again could plausibly work. */
  retryable: boolean;
  /** The gateway's machine code, for the dev-only hint. Null on a plain Error. */
  code: string | null;
};

/** A date the caller can be told to come back on, or null.
 *
 * `BoolAiError.retryAfter` is a Date the SDK normalizes from the two
 * incompatible shapes the gateway sends (an ISO instant on the credit codes, a
 * count of seconds on `rate_limited`). Older SDKs don't carry the field at all,
 * so this reads it defensively and every caller treats null as "no promise" —
 * which is the honest default, not a fallback. */
function retryDate(error: unknown): Date | null {
  const at = (error as { retryAfter?: unknown } | null)?.retryAfter;
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) return null;
  return at.getTime() > Date.now() ? at : null;
}

/** "on March 12" beats "in 6 days" — the latter is arithmetic against a clock we
 * can't see, and it goes stale the moment the tab is left open. */
function onDate(at: Date): string {
  return at.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

/**
 * Turn anything thrown by a `bool.ai` call into copy a stranger can act on.
 *
 * Reads `code`/`status` structurally rather than with `instanceof`, because a
 * dropped connection throws a plain `TypeError` from fetch and that has to land
 * somewhere sensible too. Unknown codes fall through to "failed" — a new gateway
 * error must degrade to a retryable message, never to a blank screen.
 */
export function describeAiError(error: unknown): AiErrorInfo {
  const e = (error ?? {}) as { code?: unknown; status?: unknown };
  const code = typeof e.code === "string" ? e.code : null;
  const status = typeof e.status === "number" ? e.status : null;

  if (code === "out_of_app_credits" || status === 402) {
    // Not "the AI budget": out_of_app_credits is the shared-pool code (bool.ai
    // isn't the only battery that can throw it), so this app could be out
    // because of a DIFFERENT feature entirely.
    //
    // The date comes from the gateway when it knows one. Saying WHEN turns "this
    // app is broken" into "come back Tuesday", which matters more here than
    // anywhere else: this visitor can do nothing at all to lift the block, so a
    // visitor told nothing has no reason to return. Without a date we promise
    // nothing rather than guessing.
    const at = retryDate(error);
    return {
      kind: "paused",
      title: "AI features are unavailable",
      message: at
        ? `AI features in this app are temporarily unavailable. They should be back on ${onDate(at)}. Everything else here still works.`
        : "AI features in this app are temporarily unavailable. Everything else here still works.",
      retryable: false,
      code,
    };
  }
  if (code === "rate_limited") {
    return {
      kind: "too_fast",
      title: "Too many requests",
      message: "Give it a few seconds, then try again.",
      retryable: true,
      code,
    };
  }
  if (code === "app_credit_daily_cap" || status === 429) {
    // 429 with no readable code lands here rather than in "failed": the only
    // 429s this plane sends are this and `rate_limited`, and offering Retry on a
    // limit that lasts all day is the worse of the two mistakes.
    //
    // The copy matches the 402 on purpose. The two blocks differ only in who
    // has to fix them, and that person is never the visitor reading this — to
    // them both are "the AI part is off right now, the rest works".
    const at = retryDate(error);
    return {
      kind: "daily_limit",
      title: "AI features are unavailable",
      message: at
        ? `AI features in this app are temporarily unavailable. They should be back on ${onDate(at)}. Everything else here still works.`
        : "AI features in this app are temporarily unavailable until tomorrow. Everything else here still works.",
      retryable: false,
      code,
    };
  }
  return {
    kind: "failed",
    title: "That didn't go through",
    message: "The AI request failed. Try again.",
    retryable: true,
    code,
  };
}

export type AiErrorProps = {
  /** Whatever the `catch` caught. Render nothing when it's null. */
  error: unknown;
  /** Wire this to the same handler the original action used. Shown only when
   * retrying could actually work, so a spent daily limit gets no dead button. */
  onRetry?: () => void;
  className?: string;
};

/**
 * The failure state for an AI feature. Put it where the answer would have gone,
 * and leave the control that triggered it on screen:
 *
 *     const [error, setError] = useState<unknown>(null);
 *     async function run() {
 *       setError(null);
 *       try {
 *         setAnswer(await bool.ai.generate(prompt));
 *       } catch (e) {
 *         setError(e);
 *       }
 *     }
 *     ...
 *     <Button onClick={run}>Summarize</Button>
 *     <AiError error={error} onRetry={run} />
 *     {answer && <Response>{answer}</Response>}
 *
 * Don't hide the button, don't unmount the page, and don't swallow the error into
 * a `console.error` — a visitor who gets nothing back assumes the app is broken.
 */
export default function AiError({ error, onRetry, className }: AiErrorProps) {
  if (!error) return null;
  const info = describeAiError(error);

  return (
    <Alert
      variant="destructive"
      // Announced, not just drawn: this replaces a result the user was waiting
      // for, so a screen reader has to hear it arrive. (Alert already carries
      // role="alert"; the live region is what makes a LATE arrival audible.)
      aria-live="polite"
      className={cn("text-left", className)}
    >
      <TriangleAlert className="size-4" />
      <AlertTitle>{info.title}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{info.message}</span>

        {/* Builder-only: the exact gateway code, in the editor preview. Stripped
            from the published build, so a visitor never reads billing internals. */}
        {import.meta.env.DEV && info.code && (
          <code className="font-mono text-xs opacity-70">{info.code}</code>
        )}

        {info.retryable && onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
