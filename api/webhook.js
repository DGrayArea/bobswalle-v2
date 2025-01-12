// api/webhook.js
import TelegramBot from "node-telegram-bot-api";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fetch from "node-fetch";
import { JsonRpcProvider, Contract } from "ethers";
import config from "../config.js";
import logger from "../logger.js";

//https://api.telegram.org/bot7479941090:AAG6S8U9cUplRpg6aAUYLM-7Mw4GVpwyXns/setWebhook?url=https://bobswallet.vercel.app/api/webhook
// https://api.telegram.org/bot7479941090:AAG6S8U9cUplRpg6aAUYLM-7Mw4GVpwyXns/getWebhookInfo

const bot = new TelegramBot(config.telegramBotToken, {
  webHook: {
    port: process.env.PORT || 443,
  },
});

const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || config.solanaRpcUrl,
  { commitment: "confirmed" }
);
const ethereumProvider = new JsonRpcProvider(
  process.env.ETHEREUM_RPC_URL || config.ethereumRpcUrl
);

const userState = new Map();

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

const blockchainWallets = {
  ethereum: process.env.ETHEREUM_WALLET_ADDRESS,
  base: process.env.BASE_WALLET_ADDRESS,
  solana: process.env.SOLANA_WALLET_ADDRESS,
};

const blockchainPlans = {
  ethereum: {
    "24_hour": { amount: 0.1, description: "24 Hour Volume Boost" },
    "12_hour": { amount: 0.05, description: "12 Hour Volume Boost" },
    "6_hour": { amount: 0.025, description: "6 Hour Volume Boost" },
    "3_hour": { amount: 0.01, description: "3 Hour Volume Boost" },
  },
  base: {
    "24_hour": { amount: 0.08, description: "24 Hour Volume Boost" },
    "12_hour": { amount: 0.04, description: "12 Hour Volume Boost" },
    "6_hour": { amount: 0.02, description: "6 Hour Volume Boost" },
    "3_hour": { amount: 0.008, description: "3 Hour Volume Boost" },
  },
  solana: {
    "24_hour": { amount: 10.0, description: "24 Hour Volume Boost" },
    "12_hour": { amount: 5.0, description: "12 Hour Volume Boost" },
    "6_hour": { amount: 2.5, description: "6 Hour Volume Boost" },
    "3_hour": { amount: 1.0, description: "3 Hour Volume Boost" },
  },
};

const paymentMethodMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "💰 ETH", callback_data: "payment_eth" }],
      [{ text: "🌊 SOL", callback_data: "payment_sol" }],
    ],
  },
  parse_mode: "Markdown",
};

function isValidEthereumAddress(address) {
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address);
}

function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

function generatePlanMenu(blockchain) {
  return {
    reply_markup: {
      inline_keyboard: Object.entries(blockchainPlans[blockchain] || {}).map(
        ([key, plan]) => [
          {
            text: `⏰ ${plan.description} (${
              plan.amount
            } ${blockchain.toUpperCase()})`,
            callback_data: key,
          },
        ]
      ),
    },
    parse_mode: "Markdown",
  };
}

async function fetchTokenDetails(blockchain, contractAddress) {
  try {
    if (blockchain === "ethereum" || blockchain === "base") {
      if (!isValidEthereumAddress(contractAddress)) {
        throw new Error("Invalid Ethereum/Base contract address");
      }

      const abi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ];
      const contract = new Contract(contractAddress, abi, ethereumProvider);

      const [name, symbol, decimals] = await Promise.all([
        contract.name(),
        contract.symbol(),
        contract.decimals(),
      ]);

      // logger.info(`Fetched ${blockchain} token details`, {
      //   name,
      //   symbol,
      //   decimals,
      // });
      return { name, symbol, decimals };
    } else if (blockchain === "solana") {
      if (!isValidSolanaAddress(contractAddress)) {
        throw new Error("Invalid Solana token address");
      }

      const mintPublicKey = new PublicKey(contractAddress);
      const tokenAccountInfo = await solanaConnection.getAccountInfo(
        mintPublicKey
      );

      if (!tokenAccountInfo) {
        throw new Error("Token account not found or invalid");
      }

      // logger.info(`Fetched Solana token details`);
      return {
        name: "Solana Token",
        symbol: "SOL",
        decimals: 9,
      };
    } else {
      throw new Error("Unsupported blockchain");
    }
  } catch (error) {
    logger.error(`Error fetching token details: ${error.message}`);
    return {
      error: error.message,
      name: "Unknown Token",
      symbol: "UNKNOWN",
      decimals: 0,
    };
  }
}

async function handleContractAddress(chatId, blockchain, contractAddress) {
  // logger.info(`Processing contract address`, {
  //   chatId,
  //   blockchain,
  //   contractAddress,
  // });

  try {
    const tokenDetails = await fetchTokenDetails(blockchain, contractAddress);

    if (tokenDetails.error) {
      throw new Error(tokenDetails.error);
    }

    const currentState = userState.get(chatId) || {};
    currentState.contractAddress = contractAddress;
    currentState.tokenDetails = tokenDetails;
    userState.set(chatId, currentState);

    const walletAddress = blockchainWallets[blockchain];
    const amount = currentState.selectedPlan;
    const paymentMethod = currentState.paymentMethod.toUpperCase();

    const confirmationMessage =
      `🎉 *Token Details Successfully Fetched*\n\n` +
      `📝 *Token Information:*\n` +
      `• Name: \`${tokenDetails.name}\`\n` +
      `• Symbol: \`${tokenDetails.symbol}\`\n` +
      `• Decimals: \`${tokenDetails.decimals}\`\n\n` +
      `💰 *Payment Instructions:*\n` +
      `1. Send exactly \`${amount}\` ${paymentMethod} to:\n` +
      `\`${walletAddress}\`\n\n` +
      `2. After payment, provide the transaction hash/link here for verification.\n\n` +
      `_⚠️ Ensure you send the exact amount to avoid delays in processing._`;

    await bot.sendMessage(chatId, confirmationMessage, {
      parse_mode: "Markdown",
    });

    // logger.info(`Sent confirmation message`, { chatId });
  } catch (error) {
    logger.error(`Error handling contract address: ${error.message}`, {
      chatId,
      blockchain,
    });
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`, {
      parse_mode: "Markdown",
    });
  }
}

// Main webhook handler
export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const update = req.body;

      if (update.message) {
        const msg = update.message;
        const chatId = msg.chat.id;
        const text = msg.text;

        if (text === "/start") {
          userState.set(chatId, {});
          await bot.sendMessage(
            chatId,
            "🚀 *Welcome to multi bumper Volume Boost Bot!*\n\nSelect your blockchain to begin:",
            blockchainMenu
          );
        } else if (text === "/help") {
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

          await bot.sendMessage(chatId, helpMessage, {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          });
        } else if (text === "/volume_info") {
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

          await bot.sendMessage(chatId, volumeInfoMessage, {
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          });
        } else if (/^[A-Za-z0-9]{32,44}$/.test(text)) {
          const currentState = userState.get(chatId) || {};
          const { blockchain, selectedPlan, paymentMethod } = currentState;

          if (!blockchain || !selectedPlan || !paymentMethod) {
            await bot.sendMessage(
              chatId,
              "⚠️ Please start from the beginning using /start",
              { parse_mode: "Markdown" }
            );
            return;
          }

          await handleContractAddress(chatId, blockchain, text);
        }
      } else if (update.callback_query) {
        const query = update.callback_query;
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        if (!userState.has(chatId)) {
          userState.set(chatId, {});
        }
        const currentState = userState.get(chatId);

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
            `💳 *Payment Method:* ${paymentMethod.toUpperCase()}\n\nPlease enter the contract address of the token.`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: "Markdown",
            }
          );
        }

        await bot.answerCallbackQuery(query.id);
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      logger.error(`Webhook handler error: ${error.stack}`);
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === "GET") {
    try {
      const url = process.env.VERCEL_URL || "https://bobswallet.vercel.app";
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

// Error handling
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

export { handleContractAddress, generatePlanMenu };
