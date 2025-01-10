// api/webhook.js
import TelegramBot from "node-telegram-bot-api";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { JsonRpcProvider, Contract } from "ethers";
import config from "../config.js";
import logger from "../logger.js";

// Initialize bot in webhook mode instead of polling
const bot = new TelegramBot(config.telegramBotToken);

// Set webhook URL after deploying
// const WEBHOOK_URL = `https://api.telegram.org/bot${config.telegramBotToken}/setWebhook?url=https://https://bobswallet.vercel.app/api/webhook`;

const WEBHOOK_URL = `https://bobswallet.vercel.app/api/webhook`;
bot.setWebHook(WEBHOOK_URL);

// Rest of your initialization code...
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || config.solanaRpcUrl,
  { commitment: "confirmed" }
);

const ethereumProvider = new JsonRpcProvider(
  process.env.ETHEREUM_RPC_URL || config.ethereumRpcUrl
);

// Use Vercel KV or Redis for state management instead of in-memory
import { kv } from "@vercel/kv";
import { generatePlanMenu, handleContractAddress } from "../bot.js";

// Webhook handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const update = req.body;
    const blockchainMenu = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟡 Ethereum", callback_data: "blockchain_ethereum" }],
          [{ text: "🔵 Base", callback_data: "blockchain_base" }],
          [{ text: "🟢 Solana", callback_data: "blockchain_solana" }],
        ],
      },
      parse_mode: "Markdown",
    };
    // Handle the update
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      // Handle commands
      if (text === "/start") {
        await bot.sendMessage(
          chatId,
          "🚀 *Welcome to multi bumper Volume Boost Bot!*\n\nSelect your blockchain to begin:",
          blockchainMenu
        );
      } else if (text === "/help") {
        // Your help command handler
      } else if (text === "/volume_info") {
        // Your volume info command handler
      } else if (/^[A-Za-z0-9]{32,44}$/.test(text)) {
        // Contract address handler
        const userState = await kv.get(`user:${chatId}`);
        await handleContractAddress(chatId, userState?.blockchain, text);
      }
    } else if (update.callback_query) {
      // Handle callback queries (button clicks)
      const query = update.callback_query;
      const chatId = query.message.chat.id;
      const userState = (await kv.get(`user:${chatId}`)) || {};

      if (query.data.startsWith("blockchain_")) {
        const blockchain = query.data.split("_")[1];
        userState.blockchain = blockchain;
        await kv.set(`user:${chatId}`, userState);

        await bot.sendMessage(
          chatId,
          `🌐 *Selected Blockchain:* ${blockchain.toUpperCase()}\n\nSelect your desired volume boost plan:`,
          generatePlanMenu(blockchain)
        );
      }
      // ... rest of your callback handlers
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("Webhook handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
