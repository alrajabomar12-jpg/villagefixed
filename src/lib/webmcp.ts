// Bool WebMCP kit — makes this app usable by an AI agent.
//
// An AI agent driving the browser (ChatGPT's in-app browser, a flagged Chrome,
// an extension) can discover and call the "tools" this file registers, instead
// of scraping the page and guessing where to click. A tool is a named action
// with typed inputs and a JavaScript handler that runs right here in the page,
// as the already-signed-in user — so it can never do more than the user could,
// and this app's own database rules stay the real guard.
//
// You register tools two ways:
//   1. useWebMCP(...) in a component — the main path. Write a small handler that
//      calls the same code your buttons call, and return textResult(...) or
//      jsonResult(...). Great for real verbs: add_task, assign, checkout, etc.
//   2. Annotate a <form> with toolname / tooldescription / toolparamdescription
//      (and toolautosubmit for safe searches) — the form becomes a tool with no
//      extra code.
//
// This file is provided and wired for you (imported once in src/main.tsx). Do
// not rewrite it; just call useWebMCP and the helpers from your own components.

import { useEffect, useRef } from "react";

// ---------- types ----------

export type JsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
};

export type ToolExecute = (
  args: Record<string, unknown>
) => ToolResult | Promise<ToolResult>;

export type ToolAnnotations = {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
};

export type BoolTool = {
  name: string;
  title?: string;
  description: string;
  annotations?: ToolAnnotations;
  inputSchema?: JsonSchema;
  execute: ToolExecute;
};

// The browser's native Model Context API is not in TypeScript's lib yet, and it
// lives on either document or navigator depending on the browser. Type it loose.
type NativeRegisterOptions = { signal?: AbortSignal; exposedTo?: string[] };
type NativeApi = {
  registerTool?: (
    tool: {
      name: string;
      title?: string;
      description: string;
      annotations?: ToolAnnotations;
      inputSchema: JsonSchema;
      execute: ToolExecute;
    },
    options?: NativeRegisterOptions
  ) => unknown;
  provideContext?: (context: {
    tools: Array<{
      name: string;
      title?: string;
      description: string;
      annotations?: ToolAnnotations;
      inputSchema: JsonSchema;
      execute: ToolExecute;
    }>;
  }) => void;
};

function nativeApi(): NativeApi | null {
  if (typeof document !== "undefined") {
    const d = (document as unknown as { modelContext?: NativeApi }).modelContext;
    if (d) return d;
  }
  if (typeof navigator !== "undefined") {
    const n = (navigator as unknown as { modelContext?: NativeApi }).modelContext;
    if (n) return n;
  }
  return null;
}

export function hasNativeWebMCP(): boolean {
  const mc = nativeApi();
  return (
    !!mc &&
    (typeof mc.registerTool === "function" || typeof mc.provideContext === "function")
  );
}

function emptySchema(): JsonSchema {
  return { type: "object", properties: {} };
}

// ---------- result helpers ----------

export function textResult(text: string, structuredContent?: unknown): ToolResult {
  const r: ToolResult = { content: [{ type: "text", text }] };
  if (structuredContent !== undefined) r.structuredContent = structuredContent;
  return r;
}

export function jsonResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ---------- registry (module singleton) ----------

type NativeHandle = { controller?: AbortController; unregister?: () => void };

const tools = new Map<string, BoolTool>();
const nativeHandles = new Map<string, NativeHandle>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(function (l) {
    l();
  });
}

function addNative(tool: BoolTool): void {
  const mc = nativeApi();
  if (!mc) return;
  try {
    if (typeof mc.registerTool === "function") {
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : undefined;
      const options: NativeRegisterOptions = {};
      if (controller) options.signal = controller.signal;
      const handle: NativeHandle = { controller };
      const ret = mc.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          annotations: tool.annotations,
          inputSchema: tool.inputSchema || emptySchema(),
          execute: function (args) {
            return callTool(tool.name, args);
          },
        },
        options
      ) as { then?: unknown; unregister?: () => void } | undefined;
      if (ret && typeof ret.then === "function") {
        (ret as unknown as Promise<unknown>).catch(function () {});
      } else if (ret && typeof ret.unregister === "function") {
        handle.unregister = ret.unregister.bind(ret);
      }
      nativeHandles.set(tool.name, handle);
    } else if (typeof mc.provideContext === "function") {
      provideAll(mc);
    }
  } catch (e) {
    // Never let a partial or stricter native API break the app.
  }
}

function removeNative(name: string): void {
  const handle = nativeHandles.get(name);
  if (handle) {
    try {
      if (handle.controller) handle.controller.abort();
      if (handle.unregister) handle.unregister();
    } catch (e) {
      // best effort
    }
    nativeHandles.delete(name);
    return;
  }
  const mc = nativeApi();
  if (mc && typeof mc.provideContext === "function") {
    const remaining = listTools().filter(function (t) {
      return t.name !== name;
    });
    try {
      mc.provideContext({
        tools: remaining.map(function (t) {
          return {
            name: t.name,
            title: t.title,
            description: t.description,
            annotations: t.annotations,
            inputSchema: t.inputSchema || emptySchema(),
            execute: function (args) {
              return callTool(t.name, args);
            },
          };
        }),
      });
    } catch (e) {
      // ignore
    }
  }
}

function provideAll(mc: NativeApi): void {
  if (typeof mc.provideContext !== "function") return;
  mc.provideContext({
    tools: listTools().map(function (t) {
      return {
        name: t.name,
        title: t.title,
        description: t.description,
        annotations: t.annotations,
        inputSchema: t.inputSchema || emptySchema(),
        execute: function (args) {
          return callTool(t.name, args);
        },
      };
    }),
  });
}

export function registerTool(tool: BoolTool): () => void {
  if (tools.has(tool.name)) removeNative(tool.name);
  const registered = tool;
  tools.set(tool.name, registered);
  addNative(registered);
  emit();
  return function () {
    // A stale React effect cleanup must not remove a newer registration that
    // happens to use the same public tool name.
    if (tools.get(tool.name) !== registered) return;
    removeNative(tool.name);
    tools.delete(tool.name);
    emit();
  };
}

export function listTools(): BoolTool[] {
  return Array.from(tools.values());
}

export function subscribeTools(listener: () => void): () => void {
  listeners.add(listener);
  return function () {
    listeners.delete(listener);
  };
}

export async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const tool = tools.get(name);
  if (!tool) return errorResult('No such tool: "' + name + '".');
  const validationError = validateArgs(tool.inputSchema || emptySchema(), args || {});
  if (validationError) {
    return errorResult('Invalid arguments for "' + name + '": ' + validationError);
  }
  try {
    return await tool.execute(args || {});
  } catch (e) {
    const msg = errorMessage(e);
    return errorResult('Tool "' + name + '" failed: ' + msg);
  }
}

function validateArgs(
  schema: JsonSchema,
  args: Record<string, unknown>
): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return "expected an object.";
  }
  const properties = schema.properties || {};
  const required = schema.required || [];
  for (let i = 0; i < required.length; i += 1) {
    const key = required[i];
    if (!Object.prototype.hasOwnProperty.call(args, key)) {
      return 'missing required field "' + key + '".';
    }
  }
  if (schema.additionalProperties === false) {
    const keys = Object.keys(args);
    for (let i = 0; i < keys.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(properties, keys[i])) {
        return 'unexpected field "' + keys[i] + '".';
      }
    }
  }
  const keys = Object.keys(args);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const rule = properties[key];
    if (!rule || typeof rule !== "object") continue;
    const value = args[key];
    const typedRule = rule as { type?: string; enum?: unknown[] };
    if (typedRule.enum && typedRule.enum.indexOf(value) === -1) {
      return 'field "' + key + '" must be one of the allowed values.';
    }
    const expected = typedRule.type;
    if (!expected) continue;
    const valid =
      (expected === "array" && Array.isArray(value)) ||
      (expected === "object" && !!value && typeof value === "object" && !Array.isArray(value)) ||
      (expected === "integer" && typeof value === "number" && Number.isInteger(value)) ||
      (expected !== "array" && expected !== "object" && expected !== "integer" && typeof value === expected);
    if (!valid) return 'field "' + key + '" must be a ' + expected + '.';
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const keys = ["message", "details", "hint", "code"];
    for (let i = 0; i < keys.length; i += 1) {
      const value = record[keys[i]];
      if (typeof value === "string" && value) return value;
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch (ignored) {
      // Fall through to String for non-serializable values.
    }
  }
  return String(error);
}

// ---------- React hooks ----------

// Register one tool for the lifetime of the calling component. The handler you
// pass can be a fresh closure every render (it always sees your latest state);
// the tool itself is only re-registered when its name, description, or schema
// changes, so this is cheap to call unconditionally at the top of a component.
export function useWebMCP(tool: BoolTool): void {
  const ref = useRef(tool);
  ref.current = tool;
  const schemaKey = JSON.stringify(tool.inputSchema || {});
  const annotationsKey = JSON.stringify(tool.annotations || {});
  useEffect(
    function () {
      const unregister = registerTool({
        name: ref.current.name,
        title: ref.current.title,
        description: ref.current.description,
        annotations: ref.current.annotations,
        inputSchema: ref.current.inputSchema || emptySchema(),
        execute: function (args) {
          return ref.current.execute(args);
        },
      });
      return unregister;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool.name, tool.title, tool.description, annotationsKey, schemaKey]
  );
}

// Register a whole array of tools at once (for a screen that exposes several).
// The array may be rebuilt every render; tools re-register only when the set of
// names/descriptions/schemas changes.
export function useWebMCPTools(list: BoolTool[]): void {
  const ref = useRef(list);
  ref.current = list;
  const key = list
    .map(function (t) {
      return (
        t.name +
        ":" +
        (t.title || "") +
        ":" +
        t.description +
        ":" +
        JSON.stringify(t.annotations || {}) +
        ":" +
        JSON.stringify(t.inputSchema || {})
      );
    })
    .join("|");
  useEffect(
    function () {
      const removers = ref.current.map(function (t, i) {
        return registerTool({
          name: t.name,
          title: t.title,
          description: t.description,
          annotations: t.annotations,
          inputSchema: t.inputSchema || emptySchema(),
          execute: function (args) {
            const current = ref.current[i];
            return (current || t).execute(args);
          },
        });
      });
      return function () {
        removers.forEach(function (r) {
          r();
        });
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
}

// ---------- declarative <form toolname=...> support ----------
//
// A page can turn a form into a tool with plain attributes:
//   <form toolname="search" tooldescription="Search products" toolautosubmit>
//     <input name="q" toolparamdescription="What to search for" />
//   </form>
// The browser may support this natively one day; until then we read the same
// attributes and register an imperative tool that fills the controls and (when
// toolautosubmit is present) submits the form. Setting a React-controlled
// input's value needs the native setter plus an input event, which is what
// setControlValue does — otherwise React overwrites the value on next render.

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function setControlValue(el: FormControl, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) {
    desc.set.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function formControls(form: HTMLFormElement): FormControl[] {
  const out: FormControl[] = [];
  const els = form.querySelectorAll("input[name], textarea[name], select[name]");
  els.forEach(function (el) {
    const type = (el as HTMLInputElement).type;
    if (type === "submit" || type === "button" || type === "reset") return;
    out.push(el as FormControl);
  });
  return out;
}

function schemaForForm(form: HTMLFormElement): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  formControls(form).forEach(function (el) {
    const name = el.getAttribute("name");
    if (!name) return;
    const desc = el.getAttribute("toolparamdescription") || undefined;
    const prop: Record<string, unknown> = { type: "string" };
    if (desc) prop.description = desc;
    if (el instanceof HTMLSelectElement) {
      const opts: string[] = [];
      Array.prototype.forEach.call(el.options, function (o: HTMLOptionElement) {
        opts.push(o.value);
      });
      if (opts.length) prop.enum = opts;
    }
    properties[name] = prop;
    if (el.hasAttribute("required")) required.push(name);
  });
  const schema: JsonSchema = { type: "object", properties };
  if (required.length) schema.required = required;
  return schema;
}

function toolForForm(form: HTMLFormElement): BoolTool | null {
  const name = form.getAttribute("toolname");
  if (!name) return null;
  const description =
    form.getAttribute("tooldescription") || "Submit the " + name + " form";
  const autoSubmit = form.hasAttribute("toolautosubmit");
  return {
    name,
    description,
    inputSchema: schemaForForm(form),
    execute: function (args) {
      const filled: string[] = [];
      formControls(form).forEach(function (el) {
        const key = el.getAttribute("name");
        if (key && Object.prototype.hasOwnProperty.call(args, key)) {
          setControlValue(el, String(args[key]));
          filled.push(key);
        }
      });
      if (autoSubmit) {
        if (typeof form.requestSubmit === "function") form.requestSubmit();
        else form.submit();
        return textResult('Submitted "' + name + '" with ' + filled.join(", ") + ".");
      }
      return textResult(
        'Filled "' +
          name +
          '" (' +
          filled.join(", ") +
          "). Waiting for the user to confirm and submit."
      );
    },
  };
}

const formTools = new Map<HTMLFormElement, () => void>();

function syncFormTools(): void {
  if (typeof document === "undefined") return;
  const forms = document.querySelectorAll("form[toolname]");
  const seen = new Set<HTMLFormElement>();
  forms.forEach(function (node) {
    const form = node as HTMLFormElement;
    seen.add(form);
    if (formTools.has(form)) return;
    const tool = toolForForm(form);
    if (tool) formTools.set(form, registerTool(tool));
  });
  formTools.forEach(function (unregister, form) {
    if (!seen.has(form)) {
      unregister();
      formTools.delete(form);
    }
  });
}

// ---------- in-editor bridge (only when running inside Bool's preview) ----------
//
// When this app runs inside Bool's editor preview it sits in a cross-origin
// iframe. Native browser WebMCP may not be present there, so we also mirror the
// tool list to the parent editor over postMessage and accept "call" requests
// from it. This is what powers the editor's in-page agent console. In a deployed
// top-level app window.parent === window, so none of this runs.

const BRIDGE_SOURCE = "bool-webmcp";

function embeddingOrigin(): string | null {
  if (typeof document === "undefined" || !document.referrer) return null;
  try {
    const origin = new URL(document.referrer).origin;
    return origin === "null" ? null : origin;
  } catch (e) {
    return null;
  }
}

function toolDescriptors() {
  return listTools().map(function (t) {
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      annotations: t.annotations,
      inputSchema: t.inputSchema || emptySchema(),
    };
  });
}

function startEditorBridge(): void {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;
  // Bind the bridge to the page that actually embedded this preview. Without
  // this check, an unrelated site could iframe a public app and invoke its
  // write tools by sending a message with the same source label.
  const targetOrigin = embeddingOrigin();
  if (!targetOrigin) return;
  const post = function (message: Record<string, unknown>) {
    try {
      window.parent.postMessage(
        Object.assign({ source: BRIDGE_SOURCE }, message),
        targetOrigin
      );
    } catch (e) {
      // best effort
    }
  };
  const announce = function () {
    post({ type: "tools", tools: toolDescriptors() });
  };
  subscribeTools(announce);
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    if (event.origin !== targetOrigin) return;
    const data = event.data;
    if (!data || data.source !== BRIDGE_SOURCE) return;
    if (data.type === "list") {
      announce();
    } else if (data.type === "call" && typeof data.name === "string") {
      const id = data.id;
      callTool(data.name, (data.args as Record<string, unknown>) || {}).then(
        function (result) {
          post({ type: "result", id, result });
        }
      );
    }
  });
  announce();
}

// ---------- init (called once from src/main.tsx) ----------

let started = false;

export function initBoolWebMCP(): void {
  if (started) return;
  if (typeof window === "undefined") return;
  started = true;
  const run = function () {
    syncFormTools();
    if (typeof MutationObserver !== "undefined") {
      const observer = new MutationObserver(function () {
        syncFormTools();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
    startEditorBridge();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
}
