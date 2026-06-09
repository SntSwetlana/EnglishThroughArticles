import "dotenv/config";
import { Bot } from "grammy";

const token = process.env.BOT_TOKEN;

console.log("token");
if (!token) {
  throw new Error("BOT_TOKEN is missing");
}

const bot = new Bot(token);
console.log("new bot");

bot.command("start", async (ctx) => {
  await ctx.reply("📚 English Through Articles\n\nUse /articles");
});
console.log("start ");

bot.command("articles", async (ctx) => {
  await ctx.reply("🧬 Wildlife Returns to Chernobyl");
});

console.log("articles ");

console.log("Bot started");

bot.start();