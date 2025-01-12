// api/webhook.js
import TelegramBot from "node-telegram-bot-api";
import { Connection, PublicKey } from "@solana/web3.js";
import { JsonRpcProvider, Contract } from "ethers";
import config from "../config.js";
import logger from "../logger.js";

// Initialize bot in webhook mode with proper options
const bot = new TelegramBot(config.telegramBotToken, {
  webHook: {
    port: process.env.PORT || 443,
  },
});

// Blockchain connections (unchanged)
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || config.solanaRpcUrl,
  { commitment: "confirmed" }
);
const ethereumProvider = new JsonRpcProvider(
  process.env.ETHEREUM_RPC_URL || config.ethereumRpcUrl
);

// Keep existing menus and plans (unchanged)
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

// ... (keep other menu definitions and blockchain plans unchanged)

// Helper functions (keep your existing implementations)
const isValidEthereumAddress = (address) => {
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address);
};

const isValidSolanaAddress = (address) => {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
};

// Message handlers
const handleStart = async (chatId) => {
  try {
    await bot.sendMessage(
      chatId,
      "🚀 *Welcome to multi bumper Volume Boost Bot!*\n\nSelect your blockchain to begin:",
      blockchainMenu
    );
    userState.set(chatId, {});
  } catch (error) {
    logger.error(`Error in handleStart: ${error.message}`);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
};

const handleHelp = async (chatId) => {
  const helpMessage =
    "🆘 *Volume Boost Bot - Help & Support*\n\n" +
    "*How to Use the Bot:*\n" +
    "1. Start with /start command\n" +
    "2. Select your preferred blockchain\n" +
    "3. Choose a volume boost plan\n" +
    "4. Select payment method\n" +
    "5. Provide contract address\n\n" +
    "*Supported Blockchains:*\n" +
    "• Ethereum\n" +
    "• Base\n" +
    "• Solana\n\n" +
    "*Payment Methods:*\n" +
    "• ETH\n" +
    "• SOL\n\n" +
    "*Support & Consultations:*\n" +
    "🤝 For personalized assistance, contact our support team:\n" +
    "[📞 @multibumpersupport](https://t.me/multibumpersupport)\n\n" +
    "_Note: Our support team is available 24/7 to help you with any questions or issues._";

  try {
    await bot.sendMessage(chatId, helpMessage, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  } catch (error) {
    logger.error(`Error in handleHelp: ${error.message}`);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
};

const handleVolumeInfo = async (chatId) => {
  const volumeInfoMessage =
    "🤖 *Volume Bot Details*\n\n" +
    "📈 Our Volume Bot uses advanced algorithms to simulate realistic token buys, ensuring that the volume appears legitimate and organic.\n\n" +
    "💵 *What You Get:*\n" +
    "• 10% of your initial payment refunded back.\n" +
    "• All profits generated from the volume boost.\n\n" +
    "✨ *Why Choose Us?*\n" +
    "1. Smart buy algorithms tailored to avoid detection.\n" +
    "2. Support for multiple blockchains (Ethereum, Solana, Base).\n" +
    "3. Transparent process with real-time updates.\n\n" +
    "🚀 Ready to boost your token's volume? Start with /start and follow the steps!\n\n" +
    "_For further questions, contact our support team._";

  try {
    await bot.sendMessage(chatId, volumeInfoMessage, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  } catch (error) {
    logger.error(`Error in handleVolumeInfo: ${error.message}`);
    await bot.sendMessage(chatId, "❌ An error occurred. Please try again.");
  }
};

// Main webhook handler
export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const update = req.body;

      // Handle text messages
      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text;

        // Command handlers
        switch (text) {
          case "/start":
            await handleStart(chatId);
            break;
          case "/help":
            await handleHelp(chatId);
            break;
          case "/volume_info":
            await handleVolumeInfo(chatId);
            break;
          default:
            // Handle contract address input
            if (/^[A-Za-z0-9]{32,44}$/.test(text)) {
              const currentState = userState.get(chatId);
              if (
                !currentState?.blockchain ||
                !currentState?.selectedPlan ||
                !currentState?.paymentMethod
              ) {
                await bot.sendMessage(
                  chatId,
                  "⚠️ Please start from the beginning using /start",
                  { parse_mode: "Markdown" }
                );
                break;
              }
              await handleContractAddress(
                chatId,
                currentState.blockchain,
                text
              );
            }
        }
      }
      // Handle callback queries (button clicks)
      else if (update.callback_query) {
        const query = update.callback_query;
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        try {
          // Initialize user state if doesn't exist
          if (!userState.has(chatId)) {
            userState.set(chatId, {});
          }
          const currentState = userState.get(chatId);

          // Handle different button callbacks
          if (data.startsWith("blockchain_")) {
            const blockchain = data.split("_")[1];
            currentState.blockchain = blockchain;

            await bot.editMessageText(
              `🌐 *Selected Blockchain:* ${blockchain.toUpperCase()}\n\nSelect your desired volume boost plan:`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                reply_markup: generatePlanMenu(blockchain).reply_markup,
              }
            );
          } else if (blockchainPlans[currentState.blockchain]?.[data]) {
            currentState.selectedPlan =
              blockchainPlans[currentState.blockchain][data].amount;
            currentState.planDescription =
              blockchainPlans[currentState.blockchain][data].description;

            await bot.editMessageText(
              `✨ *Selected Plan:* ${currentState.planDescription}\n\nSelect your payment method:`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
                reply_markup: paymentMethodMenu.reply_markup,
              }
            );
          } else if (data.startsWith("payment_")) {
            const paymentMethod = data.split("_")[1];
            currentState.paymentMethod = paymentMethod;

            await bot.editMessageText(
              `💳 *Payment Method:* ${paymentMethod.toUpperCase()}\n\nPlease enter the contract address of the token you want to boost.`,
              {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: "Markdown",
              }
            );
          }

          // Answer callback query to remove loading state
          await bot.answerCallbackQuery(query.id);
        } catch (error) {
          logger.error(`Callback query error: ${error.message}`);
          await bot.answerCallbackQuery(query.id, {
            text: "❌ An error occurred. Please try again.",
            show_alert: true,
          });
        }
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error(`Webhook handler error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === "GET") {
    // Webhook setup endpoint
    try {
      const url = process.env.VERCEL_URL || "your-vercel-url.vercel.app";
      const webhookUrl = `https://${url}/api/webhook`;
      await bot.setWebHook(webhookUrl);
      res.status(200).json({
        ok: true,
        webhook_url: webhookUrl,
      });
    } catch (error) {
      logger.error(`Webhook setup error: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
