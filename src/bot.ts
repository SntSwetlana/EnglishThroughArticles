import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = new Bot(token);

bot.command("start", async (ctx) => {
  await ctx.reply("📚 English Through Articles\n\nUse /articles");
});

bot.command("articles", async (ctx) => {
  await ctx.reply("🧬 Wildlife Returns to Chernobyl");
});

console.log("Bot started");

bot.start();