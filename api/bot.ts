import "dotenv/config";
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

export default webhookCallback(bot, "http");