import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { spawnSync } from "node:child_process";

import { claudeCommand, classifyClaudeFailure, createClaudeCliModel } from "./claude";

// A stand-in for the Claude CLI: it records what it was given and answers as the scenario in its
// prompt asks.
const fakeClaude = `#!/usr/bin/env node
const fs = require("node:fs");
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  fs.writeFileSync(process.env.HOME + "/call.json", JSON.stringify({ args: process.argv.slice(2), env: process.env, input }));
  const reply = (value) => process.stdout.write(JSON.stringify(value));
  if (input.includes("scenario:ok")) reply({ is_error: false, structured_output: { title: "Готово" }, type: "result" });
  else if (input.includes("scenario:text")) reply({ is_error: false, result: "{\\"title\\":\\"Текстом\\"}", type: "result" });
  else if (input.includes("scenario:login")) reply({ is_error: true, result: "Not logged in · Please run /login", type: "result" });
  else if (input.includes("scenario:limit")) reply({ is_error: true, result: "Claude usage limit reached", type: "result" });
  else if (input.includes("scenario:garbage")) process.stdout.write("not json");
  else if (input.includes("scenario:slow")) setTimeout(() => reply({ is_error: false, structured_output: {} }), 10000);
});
`;

describe("Claude CLI writer model", () => {
  let directory: string;
  let binary: string;
  const secretEnvironment = { DATABASE_URL: "postgresql://worker:secret@db/app", TELEGRAM_BOT_WRAPPING_KEY: "k1:secret" };

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "claude-cli-test-"));
    binary = path.join(directory, "claude");
    await writeFile(binary, fakeClaude);
    await chmod(binary, 0o755);
    Object.assign(process.env, secretEnvironment);
  });

  afterAll(async () => {
    for (const key of Object.keys(secretEnvironment)) delete process.env[key];
    await rm(directory, { force: true, recursive: true });
  });

  const model = (timeoutMs?: number) => createClaudeCliModel({ binary, ...(timeoutMs ? { timeoutMs } : {}), token: "sk-ant-oat01-test-token-value" });

  async function lastCall(): Promise<{ args: string[]; env: Record<string, string>; input: string }> {
    const homes = (await import("node:fs")).readdirSync(os.tmpdir()).filter((name) => name.startsWith("news-writer-"));
    const calls = await Promise.all(homes.map(async (home) => {
      try {
        const file = path.join(os.tmpdir(), home, "call.json");
        return { at: (await import("node:fs")).statSync(file).mtimeMs, call: JSON.parse(await readFile(file, "utf8")) };
      } catch {
        return null;
      }
    }));
    return calls.filter((entry) => entry !== null).sort((left, right) => right!.at - left!.at)[0]!.call;
  }

  it("runs a pure text task: no tools, no MCP, no settings, the schema, and only the token from the process environment", async () => {
    const schema = { properties: { title: { type: "string" } }, type: "object" };
    await expect(model().complete({ kind: "write", prompt: "scenario:ok", schema, system: "Ты редактор." })).resolves.toEqual({ title: "Готово" });
    const call = await lastCall();
    expect(call.args).toEqual([
      "-p", "--model", "opus", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence",
      "--output-format", "json", "--system-prompt", "Ты редактор.", "--json-schema", JSON.stringify(schema),
    ]);
    expect(call.input).toBe("scenario:ok");
    expect(call.env.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-test-token-value");
    expect(call.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe("1");
    expect(call.env.DATABASE_URL).toBeUndefined();
    expect(call.env.TELEGRAM_BOT_WRAPPING_KEY).toBeUndefined();
    expect(call.env.HOME).toMatch(/news-writer-/u);
  });

  it("without a token, runs with the machine's own login: its HOME, no token, nothing else of the environment", async () => {
    const realHome = process.env.HOME;
    const ownHome = await mkdtemp(path.join(os.tmpdir(), "claude-own-home-"));
    process.env.HOME = ownHome;
    try {
      await expect(createClaudeCliModel({ binary }).complete({ kind: "write", prompt: "scenario:ok", schema: { type: "object" }, system: "s" }))
        .resolves.toEqual({ title: "Готово" });
      const call = JSON.parse(await readFile(path.join(ownHome, "call.json"), "utf8")) as { env: Record<string, string> };
      expect(call.env.HOME).toBe(ownHome);
      expect(call.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
      expect(call.env.DATABASE_URL).toBeUndefined();
    } finally {
      process.env.HOME = realHome;
      await rm(ownHome, { force: true, recursive: true });
    }
  });

  it("reads an answer given as text and names each failure by its kind", async () => {
    const schema = { type: "object" };
    await expect(model().complete({ kind: "write", prompt: "scenario:text", schema, system: "s" })).resolves.toEqual({ title: "Текстом" });
    await expect(model().complete({ kind: "write", prompt: "scenario:login", schema, system: "s" })).rejects.toMatchObject({ code: "ai_auth" });
    await expect(model().complete({ kind: "write", prompt: "scenario:limit", schema, system: "s" })).rejects.toMatchObject({ code: "ai_limit" });
    await expect(model().complete({ kind: "write", prompt: "scenario:garbage", schema, system: "s" })).rejects.toMatchObject({ code: "ai_invalid" });
    await expect(createClaudeCliModel({ binary: path.join(directory, "missing"), token: "sk-ant-oat01-test-token-value" })
      .complete({ kind: "write", prompt: "scenario:ok", schema, system: "s" })).rejects.toMatchObject({ code: "ai_unavailable" });
  });

  it("gives up after its time and when the worker stops", async () => {
    const schema = { type: "object" };
    await expect(model(300).complete({ kind: "write", prompt: "scenario:slow", schema, system: "s" })).rejects.toMatchObject({ code: "ai_timeout" });
    const controller = new AbortController();
    const running = model().complete({ kind: "write", prompt: "scenario:slow", schema, signal: controller.signal, system: "s" });
    setTimeout(() => controller.abort(), 100);
    await expect(running).rejects.toMatchObject({ code: "ai_timeout" });
  });

  // The server's virtual CPU cannot run Claude Code's native builds: the pinned JavaScript build runs
  // with this Node (checked offline with --version). Pinned to a specific version in the source project;
  // skipped here because this project tracks Claude Code's current release.
  it.skip("runs the pinned JavaScript build of Claude Code with this Node", () => {
    const launcher = claudeCommand();
    expect(launcher.command).toBe(process.execPath);
    expect(launcher.args[0]).toMatch(/@anthropic-ai[/\\]claude-code[/\\]cli\.js$/u);
    const version = spawnSync(launcher.command, [...launcher.args, "--version"], { encoding: "utf8", env: { HOME: os.tmpdir(), PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv, timeout: 60_000 });
    expect(version.stdout).toContain("2.1.112");
  }, 70_000);

  it("classifies the CLI's own words", () => {
    expect(classifyClaudeFailure("OAuth token has expired")).toBe("ai_auth");
    expect(classifyClaudeFailure("API Error: 401 invalid x-api-key")).toBe("ai_auth");
    expect(classifyClaudeFailure("Rate limit: 429 Too Many Requests")).toBe("ai_limit");
    expect(classifyClaudeFailure("API Error: 529 Overloaded")).toBe("ai_unavailable");
    expect(classifyClaudeFailure("something else")).toBe("ai_failed");
  });
});
