import { Bot, webhookCallback } from "grammy";

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command("start", async (ctx) => {
    await ctx.reply(
        "📚 English Through Articles\n\nWelcome!"
    );
});

bot.command("articles", async (ctx) => {
    await ctx.reply(
        "🧬 Wildlife Returns to Chernobyl"
    );
});

export default webhookCallback(bot, "http");