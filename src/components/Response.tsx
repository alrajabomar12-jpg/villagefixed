import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remend from "remend";
import { cn } from "@/lib/utils";

// Module scope, not inline: a fresh array/object on every render makes
// react-markdown redo work it could otherwise skip.
const remarkPlugins = [remarkGfm];

/** A wide table scrolls itself instead of stretching the page sideways on a
 * phone — the one thing a class on the container can't do. */
const components: Components = {
  table: ({ node: _node, ...props }) => (
    <div className="my-3 w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
};

export type ResponseProps = {
  /** The markdown text. Safe to pass a partial string while it streams. */
  children: string;
  className?: string;
};

/**
 * Renders markdown text (anything from `bool.ai`) as formatted HTML.
 *
 * Model output is markdown, so rendering it as plain text shows the user
 * literal `**asterisks**` and `*` bullets. Wrap it instead:
 *
 *     <Response>{answer}</Response>
 *
 * Streaming is fine too — pass the partial string on every chunk and `remend`
 * closes whatever hasn't finished arriving yet, so no raw `**` ever flashes
 * on screen:
 *
 *     for await (const chunk of bool.ai.stream(prompt)) setText(t => t + chunk);
 *
 * All styling is plain Tailwind below — restyle it to match the app.
 */
const Response = memo(function Response({
  children,
  className,
}: ResponseProps) {
  return (
    <div
      className={cn(
        "w-full leading-relaxed",
        // No stray gap at the very top or bottom of a message bubble.
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        // react-markdown emits plain tags with no classes at all, so every line
        // below is doing real work — without them headings render at body size
        // and paragraphs run into each other.
        "[&_p]:my-3",
        "[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold",
        "[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold",
        "[&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold",
        "[&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-semibold",
        "[&_h5]:mt-4 [&_h5]:mb-2 [&_h5]:font-semibold",
        "[&_h6]:mt-4 [&_h6]:mb-2 [&_h6]:font-semibold",
        "[&_strong]:font-semibold [&_em]:italic",
        // list-outside so a wrapped line stays aligned under its own text rather
        // than sliding back under the marker; pl-* so the marker isn't clipped.
        "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:list-outside [&_ul]:pl-5",
        "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:list-outside [&_ol]:pl-5",
        "[&_li]:my-1 [&_li>p]:my-0",
        "[&_li_ul]:my-1 [&_li_ol]:my-1",
        // remark-gfm task lists: the checkbox needs to sit inline, and the item
        // has no bullet of its own.
        "[&_li:has(input[type=checkbox])]:list-none [&_input[type=checkbox]]:mr-2",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground",
        "[&_hr]:my-6 [&_hr]:border-border",
        "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2",
        // Inline code only — the :not(pre) keeps this off fenced blocks, which
        // get their own treatment on the next line.
        "[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.9em]",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-sm",
        // A wide image is the other easy way to break the layout on a phone.
        "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg",
        className
      )}
    >
      {/* remend closes markdown that is still arriving; raw HTML in model output
          stays inert because rehype-raw is deliberately not installed. */}
      <Markdown remarkPlugins={remarkPlugins} components={components}>
        {remend(children)}
      </Markdown>
    </div>
  );
});

export default Response;
