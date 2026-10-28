import {
  copiedPhrases,
  missingNumbers,
  parseWriterVerdict,
  postText,
  whyWriterInvalid,
  writeSchema,
  writeSystemPrompt,
  writeUserPrompt,
  type WriterVerdict,
  type WrittenNewsPost,
} from "./writing";

// One material → one post. The model answers in the schema; when the post repeats phrases of the source,
// it is asked once more with those phrases named; the post comes back with its warnings — figures the
// source does not have, phrases still copied — for a person to look at before publishing. Nothing is
// published from here.

const minimumSourceText = 200;

export type NewsWriterErrorCode = "ai_auth" | "ai_failed" | "ai_invalid" | "ai_limit" | "ai_timeout" | "ai_unavailable";

export class NewsWriterError extends Error {
  readonly code: NewsWriterErrorCode;

  constructor(code: NewsWriterErrorCode) {
    super(`News writer call failed: ${code}`);
    this.code = code;
    this.name = "NewsWriterError";
  }
}

// What a failure means for a queue: the account, its limit or the service — wait (half an hour) without
// using up the material's attempts; anything else — try again a few times, then give up.
export function isTransientWriterError(error: NewsWriterError): boolean {
  return error.code === "ai_auth" || error.code === "ai_limit" || error.code === "ai_unavailable";
}

// The model the writer calls (claude.ts: Claude through `claude -p`).
export type NewsWriterModel = Readonly<{
  complete(input: Readonly<{
    kind: "illustrate" | "write";
    prompt: string;
    schema: object;
    signal?: AbortSignal;
    system: string;
  }>): Promise<unknown>;
}>;

export type NewsPostWarning =
  | Readonly<{ kind: "copied"; phrases: readonly string[] }>
  | Readonly<{ kind: "numbers"; values: readonly string[] }>;

export type RewriteResult =
  | Readonly<{ kind: "post"; post: WrittenNewsPost; warnings: readonly NewsPostWarning[] }>
  | Readonly<{ kind: "skip"; reason: string }>;

export async function rewriteNews(
  material: Readonly<{
    // An editor's wish for this post («короче», «акцент на банках»).
    instruction?: string;
    text: string;
    title: string;
  }>,
  model: NewsWriterModel,
  signal?: AbortSignal,
  // When the caller stops waiting (epoch ms): the second pass that rewrites copied phrases runs only
  // if it fits before it; otherwise the post comes back with those phrases in its warnings.
  deadline?: number,
): Promise<RewriteResult> {
  if (material.text.trim().length < minimumSourceText) return Object.freeze({ kind: "skip", reason: "В источнике слишком мало текста для поста." });
  const source = `${material.title}\n${material.text}`;
  const ask = async (copied?: readonly string[]): Promise<WriterVerdict> => {
    let answer: unknown;
    try {
      answer = await model.complete({
        kind: "write",
        prompt: writeUserPrompt({ ...(copied ? { copied } : {}), ...(material.instruction ? { instruction: material.instruction } : {}), text: material.text, title: material.title }),
        schema: writeSchema,
        ...(signal ? { signal } : {}),
        system: writeSystemPrompt(),
      });
    } catch (error) {
      throw error instanceof NewsWriterError ? error : new NewsWriterError("ai_failed");
    }
    const verdict = parseWriterVerdict(answer);
    if (!verdict) {
      // Diagnostic: say WHY the answer was rejected and dump it. Backend
      // writes stderr into journald, so the reason shows up in logs.
      try {
        const reason = whyWriterInvalid(answer) ?? "unknown";
        const dump = JSON.stringify(answer).slice(0, 4000);
        process.stderr.write(`[writer] invalid: ${reason}; answer=${dump}\n`);
      } catch { /* ignore */ }
      throw new NewsWriterError("ai_invalid");
    }
    return verdict;
  };

  const started = Date.now();
  let verdict = await ask();
  if (verdict.kind === "post") {
    const copied = copiedPhrases(postText(verdict.post), source);
    const firstPass = Date.now() - started;
    const fits = deadline === undefined || deadline - Date.now() > firstPass * 1.2 + 10_000;
    if (copied.length > 0 && fits) {
      // A failed second pass must not lose the post the first one wrote.
      try {
        verdict = await ask(copied);
      } catch (error) {
        process.stderr.write(`[writer] second pass failed (${error instanceof NewsWriterError ? error.code : "error"}), keeping the first post\n`);
      }
    }
  }
  if (verdict.kind === "skip") return verdict;
  const written = postText(verdict.post);
  const copied = copiedPhrases(written, source);
  const numbers = missingNumbers(written, source);
  return Object.freeze({
    kind: "post",
    post: verdict.post,
    warnings: Object.freeze([
      ...(copied.length > 0 ? [{ kind: "copied" as const, phrases: copied }] : []),
      ...(numbers.length > 0 ? [{ kind: "numbers" as const, values: numbers }] : []),
    ]),
  });
}

// The post as plain text for a Telegram message or a page: title, lead, «Главное», paragraphs (a «## »
// paragraph is a subheading), the business note. Visuals other than «Главное» are for a page or a
// picture.
export function postAsText(post: WrittenNewsPost): string {
  const parts = [post.title, post.lead];
  if (post.visuals.highlights?.length) parts.push(["Главное:", ...post.visuals.highlights.map((point) => `• ${point}`)].join("\n"));
  for (const paragraph of post.paragraphs) parts.push(paragraph.startsWith("## ") ? paragraph.slice(3).toUpperCase() : paragraph);
  parts.push(`Что это значит для бизнеса: ${post.businessNote}`);
  return parts.join("\n\n");
}
