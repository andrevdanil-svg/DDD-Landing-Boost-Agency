import { createClaudeCliModel } from "./claude";
import { createNewsReader, type NewsMaterial } from "./reader";
import { postAsText, rewriteNews } from "./rewrite";
import { newsLinkAddress, telegramChannelAddress, telegramPostAddress } from "./source";

// npx tsx src/cli.ts read <article or t.me/channel/123>   — the material as JSON
// npx tsx src/cli.ts channel <@channel | t.me/channel>    — the channel's latest posts
// npx tsx src/cli.ts site <https://site.uz>                — the site's feed and its items
// npx tsx src/cli.ts rewrite <article or t.me/channel/123> — the material rewritten by Claude
// CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) is used when set, else the machine's `claude` login.

const reader = createNewsReader();

async function material(link: string): Promise<NewsMaterial> {
  const post = telegramPostAddress(link);
  if (post) return reader.telegramPost(post.embedUrl, post.handle, post.url);
  const address = newsLinkAddress(link);
  if (!address) throw new Error("Не похоже на ссылку на статью или пост Telegram.");
  return reader.article(address);
}

const [command, argument] = process.argv.slice(2);
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

if (command === "read" && argument) {
  print(await material(argument));
} else if (command === "channel" && argument) {
  const channel = telegramChannelAddress(argument);
  if (!channel) throw new Error("Не похоже на публичный канал.");
  print(await reader.telegramChannel(channel.feedUrl, channel.handle));
} else if (command === "site" && argument) {
  const site = newsLinkAddress(argument, { allowRoot: true });
  if (!site) throw new Error("Не похоже на адрес сайта.");
  const found = await reader.siteFeed(site);
  print({ ...found, items: found.items.map((item) => ({ ...item, text: item.text.slice(0, 300) })) });
} else if (command === "rewrite" && argument) {
  const source = await material(argument);
  const model = createClaudeCliModel(process.env.CLAUDE_CODE_OAUTH_TOKEN ? { token: process.env.CLAUDE_CODE_OAUTH_TOKEN } : {});
  const result = await rewriteNews(source, model);
  print(result);
  if (result.kind === "post") console.log(`\n${postAsText(result.post)}`);
} else {
  console.error("Usage: tsx src/cli.ts read|channel|site|rewrite <address>");
  process.exitCode = 2;
}
