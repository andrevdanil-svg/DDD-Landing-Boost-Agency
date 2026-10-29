import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

import { NewsWriterError, type NewsModelKind, type NewsWriterModel } from "./rewrite";

// Claude through a Claude subscription (Pro/Max) — `claude -p`, never an API key. The call is a pure
// text task: no tools, no MCP servers, no settings files, no session kept, the answer held to a JSON
// schema. Two ways to log in:
// - a server: `claude setup-token` once on any machine, the token in CLAUDE_CODE_OAUTH_TOKEN; the child
//   then gets the token and nothing else of the process environment (no database URL, no keys) and an
//   empty HOME of its own;
// - a developer machine: no token — the child uses the `claude` login already on the machine.

type Spawn = (command: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

const maxStdout = 2 * 1024 * 1024;

// The CLI: starting with 2.1.300+, the `@anthropic-ai/claude-code` package ships a native
// `bin/claude.exe` placed by its postinstall script, with `cli.js` dropped. We try the binary
// first, then the legacy `cli.js` (older installs), then `claude` on PATH.
export function claudeCommand(): Readonly<{ args: readonly string[]; command: string }> {
  const require = createRequire(import.meta.url);
  for (const candidate of ["@anthropic-ai/claude-code/bin/claude.exe", "@anthropic-ai/claude-code/cli.js"]) {
    try {
      const resolved = require.resolve(candidate);
      // The native binary runs itself; the JS cli needs this Node.
      return candidate.endsWith(".exe")
        ? { args: [], command: resolved }
        : { args: [resolved], command: process.execPath };
    } catch {
      // ignored
    }
  }
  return { args: [], command: "claude" };
}

let home: string | undefined;

function claudeHome(): string {
  home ??= mkdtempSync(path.join(os.tmpdir(), "news-writer-"));
  return home;
}

// What went wrong, from the answer's own words — never repeated in a log.
export function classifyClaudeFailure(message: string): NewsWriterError["code"] {
  if (/not logged in|\/login|invalid.*(?:token|api key|x-api-key)|authenticat|unauthori[sz]ed|\b401\b|oauth/iu.test(message)) return "ai_auth";
  if (/usage limit|rate limit|limit reached|quota|\b429\b|too many requests/iu.test(message)) return "ai_limit";
  if (/overloaded|\b529\b|\b503\b|\b502\b|service unavailable|connection|network|ECONN|ETIMEDOUT|ENOTFOUND/iu.test(message)) return "ai_unavailable";
  return "ai_failed";
}

// What one call cost, from the CLI's own answer (no prompt or answer text in it): the subscription limit
// is spent by these tokens, so a pipeline step is measured by them, not guessed.
export type ClaudeCallUsage = Readonly<{
  cacheRead?: number;
  cacheWrite?: number;
  costUsd?: number;
  input?: number;
  kind: NewsModelKind;
  model: string;
  ms: number;
  output?: number;
  searches?: number;
  subtype?: string;
  turns?: number;
  // Per model, as the CLI counts it: a web search runs as a request of its own, so its cost shows here.
  byModel?: Readonly<Record<string, Readonly<{ costUsd?: number; input?: number; output?: number; searches?: number }>>>;
}>;

function callUsage(kind: NewsModelKind, model: string, started: number, result: Record<string, unknown>): ClaudeCallUsage {
  const usage = (result.usage ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => (typeof value === "number" ? value : undefined);
  const searches = number((usage.server_tool_use as Record<string, unknown> | undefined)?.web_search_requests);
  const entries = {
    cacheRead: number(usage.cache_read_input_tokens), cacheWrite: number(usage.cache_creation_input_tokens),
    costUsd: number(result.total_cost_usd), input: number(usage.input_tokens), output: number(usage.output_tokens),
    searches, subtype: typeof result.subtype === "string" ? result.subtype : undefined, turns: number(result.num_turns),
  };
  const modelUsage = result.modelUsage && typeof result.modelUsage === "object" ? result.modelUsage as Record<string, Record<string, unknown>> : {};
  const defined = <T extends object>(value: T) => Object.freeze(Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)));
  const byModel = Object.fromEntries(Object.entries(modelUsage).map(([name, usage]) => [name, defined({
    costUsd: number(usage.costUSD), input: number(usage.inputTokens), output: number(usage.outputTokens), searches: number(usage.webSearchRequests),
  })]));
  return Object.freeze({
    kind, model, ms: Date.now() - started,
    ...Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined)),
    ...(Object.keys(byModel).length ? { byModel: Object.freeze(byModel) } : {}),
  });
}

export function createClaudeCliModel(options: Readonly<{
  binary?: string;
  // Turns an agentic call (one with tools) may take before the CLI stops it.
  maxTurns?: Readonly<Partial<Record<NewsModelKind, number>>>;
  models?: Readonly<Partial<Record<NewsModelKind, string>> & { write: string }>;
  // Called once per finished call with what it cost.
  onUsage?: (usage: ClaudeCallUsage) => void;
  spawn?: Spawn;
  // MAX_THINKING_TOKENS for a kind of call. 0 turns extended thinking off: an illustration took Opus
  // 15 000 output tokens and ~4 minutes with it, 1 800 tokens and 26 s without (VPS, 2026-10-28).
  thinkingTokens?: Readonly<Partial<Record<NewsModelKind, number>>>;
  // Built-in tools a kind of call may use (only server-side ones: WebSearch runs at Anthropic, nothing
  // is fetched from this machine). Everything else runs with no tools at all.
  tools?: Readonly<Partial<Record<NewsModelKind, readonly string[]>>>;
  timeoutMs?: number;
  // Without a token the machine's own `claude` login is used.
  token?: string;
}>): NewsWriterModel {
  const run = options.spawn ?? (spawn as unknown as Spawn);
  const launcher = options.binary ? { args: [], command: options.binary } : claudeCommand();
  const models = options.models ?? { write: "opus" };
  const timeoutMs = options.timeoutMs ?? 4 * 60_000;

  return Object.freeze({
    complete(input) {
      return new Promise<unknown>((resolve, reject) => {
        let settled = false;
        let stdout = "";
        const started = Date.now();
        const modelName = models[input.kind] ?? models.write;
        let child: ChildProcessWithoutNullStreams | undefined;
        function kill() {
          if (child && child.exitCode === null) child.kill("SIGKILL");
        }
        function abort() {
          kill();
          finish(new NewsWriterError("ai_timeout"));
        }
        const timer = setTimeout(abort, timeoutMs);
        function finish(error: NewsWriterError | null, value?: unknown) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          input.signal?.removeEventListener("abort", abort);
          if (error) reject(error);
          else resolve(value);
        }
        if (input.signal?.aborted) {
          abort();
          return;
        }
        input.signal?.addEventListener("abort", abort, { once: true });
        try {
          child = run(launcher.command, [
            ...launcher.args,
            "-p",
            "--model", modelName,
            "--tools", (options.tools?.[input.kind] ?? []).join(","),
            ...((options.tools?.[input.kind] ?? []).length ? ["--allowedTools", (options.tools?.[input.kind] ?? []).join(",")] : []),
            ...(options.maxTurns?.[input.kind] ? ["--max-turns", String(options.maxTurns[input.kind])] : []),
            "--strict-mcp-config",
            "--setting-sources", "",
            "--no-session-persistence",
            "--output-format", "json",
            "--system-prompt", input.system,
            "--json-schema", JSON.stringify(input.schema),
          ], {
            env: ({
              ...(options.token
                ? { CLAUDE_CODE_OAUTH_TOKEN: options.token, HOME: claudeHome() }
                : { HOME: process.env.HOME ?? os.homedir() }),
              CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
              DISABLE_AUTOUPDATER: "1",
              LANG: "C.UTF-8",
              PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
              ...(options.thinkingTokens?.[input.kind] !== undefined ? { MAX_THINKING_TOKENS: String(options.thinkingTokens[input.kind]) } : {}),
            }) as unknown as NodeJS.ProcessEnv,
            stdio: "pipe",
          });
        } catch {
          finish(new NewsWriterError("ai_unavailable"));
          return;
        }
        const cli = child;
        cli.on("error", () => finish(new NewsWriterError("ai_unavailable")));
        cli.stdout.setEncoding("utf8");
        cli.stdout.on("data", (chunk: string) => {
          stdout += chunk;
          if (stdout.length > maxStdout) {
            kill();
            finish(new NewsWriterError("ai_invalid"));
          }
        });
        // The CLI's own diagnostics are read for nothing: they may echo what it was given.
        cli.stderr.resume();
        cli.stdin.on("error", () => undefined);
        cli.on("close", () => {
          if (settled) return;
          let result: Record<string, unknown>;
          try {
            result = JSON.parse(stdout) as Record<string, unknown>;
          } catch {
            finish(new NewsWriterError(stdout.trim() ? "ai_invalid" : "ai_failed"));
            return;
          }
          try {
            options.onUsage?.(callUsage(input.kind, modelName, started, result));
          } catch {
            // a report must not fail the call
          }
          if (result.is_error === true) {
            finish(new NewsWriterError(classifyClaudeFailure(String(result.result ?? result.subtype ?? ""))));
            return;
          }
          if (result.structured_output && typeof result.structured_output === "object") {
            finish(null, result.structured_output);
            return;
          }
          try {
            finish(null, JSON.parse(String(result.result ?? "")));
          } catch {
            finish(new NewsWriterError("ai_invalid"));
          }
        });
        cli.stdin.end(input.prompt);
      });
    },
  });
}
