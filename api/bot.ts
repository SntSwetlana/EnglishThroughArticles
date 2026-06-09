import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import fs from "node:fs";
import path from "node:path";

type Article = {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  level: string;
  ieltsTarget?: string;
  source?: string;
  originalUrl?: string;
  description?: string;
  enabled?: boolean;
};

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = new Bot(token);

const ARTICLES_DIR = path.join(process.cwd(), "data", "articles");

function readArticle(slug: string): Article | null {
  const filePath = path.join(ARTICLES_DIR, slug, "article.json");

  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as Article;
}

function getArticles(): Article[] {
  if (!fs.existsSync(ARTICLES_DIR)) return [];

  return fs
    .readdirSync(ARTICLES_DIR, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((dir) => readArticle(dir.name))
    .filter((article): article is Article => Boolean(article))
    .filter((article) => article.enabled !== false);
}

function readTextFile(slug: string, fileName: string): string | null {
  const filePath = path.join(ARTICLES_DIR, slug, fileName);

  if (!fs.existsSync(filePath)) return null;

  return fs.readFileSync(filePath, "utf-8");
}

function chunkText(text: string, maxLength = 3500): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of text.split("\n\n")) {
    if ((current + "\n\n" + paragraph).length > maxLength) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current += "\n\n" + paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks;
}

function articleMenu(slug: string, article: Article) {
  const keyboard = new InlineKeyboard()
    .text("📖 Passage", `passage:${slug}`)
    .row()
    .text("📚 Vocabulary", `vocab:${slug}`)
    .row()
    .text("📝 Exercises", `exercises:${slug}`);

  if (article.originalUrl) {
    keyboard.row().url("🔗 Original Article", article.originalUrl);
  }

  keyboard.row().text("⬅️ All Articles", "articles");

  return keyboard;
}

bot.command("start", async (ctx) => {
  const payload = ctx.match;

  if (payload?.startsWith("article_")) {
    const slug = payload.replace("article_", "");
    const article = readArticle(slug);

    if (!article) {
      await ctx.reply("Article not found.");
      return;
    }

    await ctx.reply(
      `📚 ${article.title}\n\n${article.description ?? ""}\n\nLevel: ${article.level}\nIELTS Target: ${article.ieltsTarget ?? "—"}`,
      { reply_markup: articleMenu(slug, article) }
    );
    return;
  }

  await ctx.reply(
    "📚 English Through Articles\n\nUse /articles to choose a reading unit."
  );
});

bot.command("articles", async (ctx) => {
  const articles = getArticles();

  if (!articles.length) {
    await ctx.reply("No articles found yet.");
    return;
  }

  const keyboard = new InlineKeyboard();

  for (const article of articles) {
    keyboard.text(`📖 ${article.title}`, `article:${article.slug}`).row();
  }

  await ctx.reply("📚 Available Articles", {
    reply_markup: keyboard,
  });
});

bot.callbackQuery("articles", async (ctx) => {
  await ctx.answerCallbackQuery();

  const articles = getArticles();
  const keyboard = new InlineKeyboard();

  for (const article of articles) {
    keyboard.text(`📖 ${article.title}`, `article:${article.slug}`).row();
  }

  await ctx.editMessageText("📚 Available Articles", {
    reply_markup: keyboard,
  });
});

bot.callbackQuery(/^article:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const article = readArticle(slug);

  if (!article) {
    await ctx.reply("Article not found.");
    return;
  }

  await ctx.editMessageText(
    `📚 ${article.title}\n\n${article.description ?? ""}\n\nLevel: ${article.level}\nIELTS Target: ${article.ieltsTarget ?? "—"}`,
    { reply_markup: articleMenu(slug, article) }
  );
});

bot.callbackQuery(/^passage:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const text = readTextFile(slug, "passage.md");

  if (!text) {
    await ctx.reply("Passage not found.");
    return;
  }

  const chunks = chunkText(text);

  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
});

bot.callbackQuery(/^vocab:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];

  const keyboard = new InlineKeyboard()
    .text("B2", `vocab-set:${slug}:b2`)
    .text("C1", `vocab-set:${slug}:c1`)
    .row()
    .text("C2", `vocab-set:${slug}:c2`)
    .text("Collocations", `vocab-set:${slug}:collocations`)
    .row()
    .text("⬅️ Back", `article:${slug}`);

  await ctx.editMessageText("📚 Choose vocabulary set:", {
    reply_markup: keyboard,
  });
});

bot.callbackQuery(/^vocab-set:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const set = ctx.match[2];

  const filePath = path.join(ARTICLES_DIR, slug, "vocabulary", `${set}.json`);

  if (!fs.existsSync(filePath)) {
    await ctx.reply("Vocabulary set not found.");
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as {
    title: string;
    items: { term: string; definition: string; translation?: string }[];
  };

  const text =
    `📚 ${data.title}\n\n` +
    data.items
      .map((item) => `• ${item.term} — ${item.definition}`)
      .join("\n");

  for (const chunk of chunkText(text)) {
    await ctx.reply(chunk);
  }
});

bot.callbackQuery(/^exercises:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const dir = path.join(ARTICLES_DIR, slug, "exercises");

  if (!fs.existsSync(dir)) {
    await ctx.reply("Exercises not found.");
    return;
  }

  const files = fs.readdirSync(dir).filter((file) => file.endsWith(".json"));

  if (!files.length) {
    await ctx.reply("No exercises yet.");
    return;
  }

  const keyboard = new InlineKeyboard();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const exercise = JSON.parse(raw) as { title: string };

    keyboard.text(`📝 ${exercise.title}`, `exercise:${slug}:${file}`).row();
  }

  keyboard.text("⬅️ Back", `article:${slug}`);

  await ctx.editMessageText("📝 Choose exercise:", {
    reply_markup: keyboard,
  });
});

bot.callbackQuery(/^exercise:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const file = ctx.match[2];

  const filePath = path.join(ARTICLES_DIR, slug, "exercises", file);

  if (!fs.existsSync(filePath)) {
    await ctx.reply("Exercise not found.");
    return;
  }

  const exercise = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  await ctx.reply(`📝 ${exercise.title}\n\n${exercise.instructions ?? ""}`);

  if (exercise.headings) {
    const headings = Object.entries(exercise.headings)
      .map(([key, value]) => `${key}. ${value}`)
      .join("\n");

    await ctx.reply(`Headings:\n\n${headings}`);
  }

  for (const q of exercise.questions) {
    let text = "";

    if (q.statement) {
      text = `${q.number}. ${q.statement}`;
    } else if (q.question) {
      const options = Object.entries(q.options ?? {})
        .map(([key, value]) => `${key}. ${value}`)
        .join("\n");

      text = `${q.number}. ${q.question}\n\n${options}`;
    } else if (q.prompt) {
      text = `${q.number}. ${q.prompt}`;
    } else if (q.paragraph) {
      text = `${q.number}. Paragraph ${q.paragraph}`;
    } else {
      text = `${q.number}. ${JSON.stringify(q)}`;
    }

    await ctx.reply(text);
  }
});

const handleUpdate = webhookCallback(bot, "http");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    return res.status(200).send("Telegram bot webhook is running.");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  return handleUpdate(req, res);
}