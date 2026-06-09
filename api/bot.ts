import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Bot, webhookCallback } from "grammy";

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = new Bot(token);

bot.command("start", async (ctx) => {
  await ctx.reply("📚 English Through Articles\n\nWelcome!");
});

bot.command("articles", async (ctx) => {
  await ctx.reply("🧬 Wildlife Returns to Chernobyl");
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