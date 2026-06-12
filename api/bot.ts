import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import fs from "node:fs/promises";
import path from "node:path";

type Level = "B2" | "C1" | "C2";

type ArticlePartMeta = {
  id: string;
  icon?: string;
  title?: string;
};

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
  parts?: ArticlePartMeta[];
};

type QuizletItem = [string, string, string?];

type Part = {
  article: string;
  part: string;
  title: string;
  level: string;
  text: string;
  audio?: {
    url?: string;
    title?: string;
  };
  levels: Record<Level, { quizlet: QuizletItem[] }>;
  questions: {
    type: "choice";
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  }[];
};

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = new Bot(token);

const ARTICLES_DIR = path.join(process.cwd(), "data", "articles");
function escapeHtml(text = ""): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeRegExp(text = ""): string {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function safeEditOrReply(ctx: any, text: string, options: any = {}) {
  try {
    if (ctx.callbackQuery?.message) {
      return await ctx.editMessageText(text, options);
    }
  } catch {
    // If Telegram cannot edit the message, send a new one.
  }

  return ctx.reply(text, options);
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readArticle(slug: string): Promise<Article | null> {
  const filePath = path.join(ARTICLES_DIR, slug, "article.json");

  if (!(await exists(filePath))) {
    return null;
  }

  return readJson<Article>(filePath);
}

async function getArticles(): Promise<Article[]> {
  if (!(await exists(ARTICLES_DIR))) {
    return [];
  }

  const dirs = await fs.readdir(ARTICLES_DIR, { withFileTypes: true });
  const articles: Article[] = [];

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;

    const article = await readArticle(dir.name);

    if (article && article.enabled !== false) {
      articles.push(article);
    }
  }

  return articles;
}

async function getPartIds(slug: string): Promise<string[]> {
  const partsDir = path.join(ARTICLES_DIR, slug, "parts");

  if (!(await exists(partsDir))) {
    return [];
  }

  const files = await fs.readdir(partsDir);

  return files
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.basename(file, ".json"))
    .sort();
}

async function getPart(slug: string, partId: string): Promise<Part | null> {
  const filePath = path.join(ARTICLES_DIR, slug, "parts", `${partId}.json`);

  if (!(await exists(filePath))) {
    return null;
  }

  return readJson<Part>(filePath);
}

function getLevelQuizlet(part: Part, level: Level): QuizletItem[] {
  return part.levels?.[level]?.quizlet ?? [];
}

function boldQuizletPhrases(text: string, quizlet: QuizletItem[]): string {
  if (!text) {
    return "📖 Text will be added soon.";
  }

  let markedText = escapeHtml(text);

  const phrases = quizlet
    .map((item) => item[2] || item[0])
    .filter(Boolean)
    .map((item) => item.trim())
    .sort((a, b) => b.length - a.length);

  for (const phrase of phrases) {
    const regex = new RegExp(escapeRegExp(escapeHtml(phrase)), "gi");
    markedText = markedText.replace(regex, (match) => `<b>${match}</b>`);
  }

  return markedText;
}

function articleHeader(article: Article): string {
  return (
    `📚 <b>${escapeHtml(article.title)}</b>\n\n` +
    `${escapeHtml(article.description ?? "")}\n\n` +
    `Level: ${escapeHtml(article.level)}\n` +
    `IELTS Target: ${escapeHtml(article.ieltsTarget ?? "—")}`
  );
}

async function partHeader(slug: string, part: Part): Promise<string> {
  const article = await readArticle(slug);
  const partId = part.part.replace("Part ", "");
  const meta = article?.parts?.find((item) => item.id === partId);

  const icon = meta?.icon ?? "📄";
  const title = meta?.title ?? part.title;

  return (
    `${icon} <b>${escapeHtml(part.part)}</b>\n\n` +
    `${escapeHtml(title)}\n\n` +
    `Level: ${escapeHtml(part.level || "B2/C1/C2")}`
  );
}

async function articlesKeyboard(): Promise<InlineKeyboard> {
  const articles = await getArticles();
  const keyboard = new InlineKeyboard();

  for (const article of articles) {
    keyboard.text(`📖 ${article.title}`, `article:${article.slug}`).row();
  }

  return keyboard;
}

async function partsKeyboard(slug: string): Promise<InlineKeyboard> {
  const article = await readArticle(slug);
  const partIds = await getPartIds(slug);
  const keyboard = new InlineKeyboard();

  for (const partId of partIds) {
    const part = await getPart(slug, partId);
    const meta = article?.parts?.find((item) => item.id === partId);

    const icon = meta?.icon ?? "📄";
    const title = meta?.title ?? part?.title ?? `Part ${partId}`;

    keyboard.text(
      `${icon} ${title}`,
      `part:${slug}:${partId}`
    ).row();
  }

  keyboard.text("⬅️ All Articles", "articles");

  return keyboard;
}

function articleKeyboard(slug: string, article: Article): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("📖 Parts", `parts:${slug}`)
    .row()
    .text("📝 IELTS Exercises", `ielts:${slug}`)
    .row()
    .text("✍️ Grammar", `grammar-menu:${slug}`);

  if (article.originalUrl) {
    keyboard.row().url("🔗 Original Article", article.originalUrl);
  }

  keyboard.row().text("⬅️ All Articles", "articles");

  return keyboard;
}

function partKeyboard(slug: string, partId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📖 Text B2", `text:${slug}:${partId}:B2`)
    .text("📖 Text C1", `text:${slug}:${partId}:C1`)
    .text("📖 Text C2", `text:${slug}:${partId}:C2`)
    .row()
    .text("🟦 B2 Quizlet", `quizlet:${slug}:${partId}:B2`)
    .text("🟪 C1 Quizlet", `quizlet:${slug}:${partId}:C1`)
    .text("🟥 C2 Quizlet", `quizlet:${slug}:${partId}:C2`)
    .row()
    .text("✅ Practice", `q:${slug}:${partId}:0`)
    .row()
    .text("⬅️ Parts", `parts:${slug}`);
}

function questionKeyboard(
  slug: string,
  partId: string,
  questionIndex: number,
  question: Part["questions"][number]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  question.options.forEach((option, optionIndex) => {
    keyboard.text(option, `a:${slug}:${partId}:${questionIndex}:${optionIndex}`).row();
  });

  return keyboard;
}

bot.command("start", async (ctx) => {
  const payload = ctx.match;

  if (payload?.startsWith("article_")) {
    const slug = payload.replace("article_", "");
    const article = await readArticle(slug);

    if (!article) {
      return ctx.reply("Article not found.");
    }

    return ctx.reply(articleHeader(article), {
      parse_mode: "HTML",
      reply_markup: articleKeyboard(slug, article),
    });
  }

  await ctx.reply("📚 English Through Articles\n\nUse /articles to choose a reading unit.");
});

bot.command("articles", async (ctx) => {
  await ctx.reply("📚 Available Articles", {
    reply_markup: await articlesKeyboard(),
  });
});

bot.callbackQuery("articles", async (ctx) => {
  await ctx.answerCallbackQuery();

  await safeEditOrReply(ctx, "📚 Available Articles", {
    reply_markup: await articlesKeyboard(),
  });
});

bot.callbackQuery(/^article:([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const article = await readArticle(slug);

  if (!article) {
    return safeEditOrReply(ctx, "Article not found.");
  }

  await safeEditOrReply(ctx, articleHeader(article), {
    parse_mode: "HTML",
    reply_markup: articleKeyboard(slug, article),
  });
});

bot.callbackQuery(/^parts:([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];

  await safeEditOrReply(ctx, "📖 Choose a part:", {
    reply_markup: await partsKeyboard(slug),
  });
});

bot.callbackQuery(/^part:([^:]+):([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const partId = ctx.match[2];

  const part = await getPart(slug, partId);

  if (!part) {
    return safeEditOrReply(ctx, "Part not found.");
  }

await safeEditOrReply(ctx, await partHeader(slug, part), {
    parse_mode: "HTML",
    reply_markup: partKeyboard(slug, partId),
  });
});

bot.callbackQuery(/^text:([^:]+):([^:]+):(B2|C1|C2)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const partId = ctx.match[2];
  const level = ctx.match[3] as Level;

  const part = await getPart(slug, partId);

  if (!part) {
    return safeEditOrReply(ctx, "Part not found.");
  }

  const quizlet = getLevelQuizlet(part, level);
  const markedText = boldQuizletPhrases(part.text, quizlet);

  await safeEditOrReply(
    ctx,
    `📖 <b>${escapeHtml(level)} text focus</b>\n\n${markedText}`,
    {
      parse_mode: "HTML",
      reply_markup: partKeyboard(slug, partId),
    }
  );
});

bot.callbackQuery(/^quizlet:([^:]+):([^:]+):(B2|C1|C2)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const partId = ctx.match[2];
  const level = ctx.match[3] as Level;

  const part = await getPart(slug, partId);

  if (!part) {
    return safeEditOrReply(ctx, "Part not found.");
  }

  const quizlet = getLevelQuizlet(part, level);

  if (!quizlet.length) {
    return safeEditOrReply(ctx, `🧩 No ${level} Quizlet yet.`, {
      parse_mode: "HTML",
      reply_markup: partKeyboard(slug, partId),
    });
  }

  const text =
    `🧩 <b>${escapeHtml(level)} Quizlet</b>\n\n` +
    quizlet
      .map(
        ([en, ru]) =>
          `• <b>${escapeHtml(en.trim())}</b>\n  ${escapeHtml(ru.trim())}`
      )
      .join("\n\n");

  await safeEditOrReply(ctx, text, {
    parse_mode: "HTML",
    reply_markup: partKeyboard(slug, partId),
  });
});

bot.callbackQuery(/^q:([^:]+):([^:]+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const partId = ctx.match[2];
  const questionIndex = Number(ctx.match[3]);

  const part = await getPart(slug, partId);

  if (!part) {
    return safeEditOrReply(ctx, "Part not found.");
  }

  const question = part.questions?.[questionIndex];

  if (!question) {
    return safeEditOrReply(ctx, "🏁 <b>Practice finished!</b>\n\nGreat work.", {
      parse_mode: "HTML",
      reply_markup: partKeyboard(slug, partId),
    });
  }

  await safeEditOrReply(
    ctx,
    `✅ <b>Question ${questionIndex + 1}/${part.questions.length}</b>\n\n${escapeHtml(
      question.question
    )}`,
    {
      parse_mode: "HTML",
      reply_markup: questionKeyboard(slug, partId, questionIndex, question),
    }
  );
});

bot.callbackQuery(/^a:([^:]+):([^:]+):(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];
  const partId = ctx.match[2];
  const questionIndex = Number(ctx.match[3]);
  const optionIndex = Number(ctx.match[4]);

  const part = await getPart(slug, partId);

  if (!part) {
    return safeEditOrReply(ctx, "Part not found.");
  }

  const question = part.questions?.[questionIndex];

  if (!question) {
    return safeEditOrReply(ctx, "Question not found.");
  }

  const isCorrect = optionIndex === question.answer;

  const resultText = isCorrect
    ? `✅ <b>Correct!</b>\n\n💡 ${escapeHtml(question.explanation)}`
    : `❌ <b>Not quite.</b>\n\nCorrect answer: <b>${escapeHtml(
        question.options[question.answer]
      )}</b>\n\n💡 ${escapeHtml(question.explanation)}`;

  await safeEditOrReply(ctx, resultText, {
    parse_mode: "HTML",
    reply_markup: new InlineKeyboard()
      .text("➡️ Next", `q:${slug}:${partId}:${questionIndex + 1}`)
      .row()
      .text("⬅️ Part", `part:${slug}:${partId}`),
  });
});

bot.callbackQuery(/^ielts:([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];

  await safeEditOrReply(
    ctx,
    "📝 IELTS exercises will be added here:\n\n• True / False / Not Given\n• Matching Headings\n• Summary Completion\n• Table Completion\n• NO MORE THAN TWO WORDS",
    {
      reply_markup: new InlineKeyboard().text("⬅️ Article", `article:${slug}`),
    }
  );
});

bot.callbackQuery(/^grammar-menu:([^:]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const slug = ctx.match[1];

  await safeEditOrReply(
    ctx,
    "✍️ Grammar exercises will be added here:\n\n• Gap Fill\n• Transformations\n• Word Formation",
    {
      reply_markup: new InlineKeyboard().text("⬅️ Article", `article:${slug}`),
    }
  );
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