import TelegramBot from 'node-telegram-bot-api';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fetch from 'node-fetch';
import { JsonRpcProvider, Contract } from 'ethers';
import config from './config.js';
import logger from './logger.js';


// Initialize bot and Solana connection
const bot = new TelegramBot(config.telegramBotToken, { 
  polling: true,
  request_timeout: 30000 
});

// Dynamically set RPC providers based on environment
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || config.solanaRpcUrl, 
  { commitment: 'confirmed' }
);
const ethereumProvider = new JsonRpcProvider(
  process.env.ETHEREUM_RPC_URL || config.ethereumRpcUrl
);

// In-memory user state (use a database for production)
const userState = new Map();

// Blockchain selection menu
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

// Blockchain wallet addresses
const blockchainWallets = {
  ethereum: process.env.ETHEREUM_WALLET_ADDRESS,
  base: process.env.BASE_WALLET_ADDRESS,
  solana: process.env.SOLANA_WALLET_ADDRESS
};

// Separate price plans for different blockchains
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
  }
};

// Payment method selection menu
const paymentMethodMenu = {
  reply_markup: {
    inline_keyboard: [
      [{ text: "💰 ETH", callback_data: "payment_eth" }],
      [{ text: "🌊 SOL", callback_data: "payment_sol" }],
    ],
  },
  parse_mode: "Markdown",
};

// Helper function to validate Ethereum/Base contract address
function isValidEthereumAddress(address) {
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address);
}

// Helper function to validate Solana address
function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
}

// Generate plan menu dynamically based on blockchain
function generatePlanMenu(blockchain) {
  return {
    reply_markup: {
      inline_keyboard: Object.entries(blockchainPlans[blockchain] || {}).map(([key, plan]) => [
        { text: `⏰ ${plan.description} (${plan.amount} ${blockchain.toUpperCase()})`, callback_data: key },
      ]),
    },
    parse_mode: "Markdown",
  };
}

// Helper to fetch token details (blockchain-specific)
async function fetchTokenDetails(blockchain, contractAddress) {
  try {
    if (blockchain === "ethereum" || blockchain === "base") {
      // Validate Ethereum/Base address first
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

      return { name, symbol, decimals };
    } else if (blockchain === "solana") {
      // Validate Solana address first
      if (!isValidSolanaAddress(contractAddress)) {
        throw new Error("Invalid Solana token address");
      }

      const mintPublicKey = new PublicKey(contractAddress);

      // Fetch token account info more robustly
      const tokenAccountInfo = await solanaConnection.getAccountInfo(mintPublicKey);
      
      if (!tokenAccountInfo) {
        throw new Error("Token account not found or invalid");
      }

      // Basic token info extraction
      return {
        name: "Solana Token",
        symbol: "SOL",
        decimals: 9  // Default Solana token decimals
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
      decimals: 0
    };
  }
}

// Helper to handle contract address input
async function handleContractAddress(chatId, blockchain, contractAddress) {
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

    await bot.sendMessage(chatId, confirmationMessage, { parse_mode: "Markdown" });
  } catch (error) {
    logger.error(`Error handling contract address: ${error.message}`);
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`, { parse_mode: "Markdown" });
  }
}
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
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

  bot.sendMessage(chatId, helpMessage, { 
    parse_mode: "Markdown",
    disable_web_page_preview: true 
  });
});
// Start command handler
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  userState.set(chatId, {});
  bot.sendMessage(
    chatId,
    "🚀 *Welcome to multi bumper  Volume Boost Bot!*\n\nSelect your blockchain to begin:",
    blockchainMenu
  );
});
// Volume bot information command
bot.onText(/\/volume_info/, (msg) => {
    const chatId = msg.chat.id;
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
  
    bot.sendMessage(chatId, volumeInfoMessage, { 
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
  });
  
// Callback query handler
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const callbackData = query.data;

  // Ensure user state exists
  if (!userState.has(chatId)) {
    userState.set(chatId, {});
  }
  const currentState = userState.get(chatId);

  // Blockchain selection
  if (callbackData.startsWith("blockchain_")) {
    const blockchain = callbackData.split("_")[1];
    currentState.blockchain = blockchain;
    bot.sendMessage(
      chatId,
      `🌐 *Selected Blockchain:* ${blockchain.toUpperCase()}\n\nSelect your desired volume boost plan:`,
      generatePlanMenu(blockchain)
    );
  } 
  // Plan selection
  else if (blockchainPlans[currentState.blockchain]?.[callbackData]) {
    currentState.selectedPlan = blockchainPlans[currentState.blockchain][callbackData].amount;
    currentState.planDescription = blockchainPlans[currentState.blockchain][callbackData].description;

    bot.sendMessage(
      chatId,
      `✨ *Selected Plan:* ${currentState.planDescription}\n\nSelect your payment method:`,
      paymentMethodMenu
    );
  }
  // Payment method selection
  else if (callbackData.startsWith("payment_")) {
    const paymentMethod = callbackData.split("_")[1];
    currentState.paymentMethod = paymentMethod;

    bot.sendMessage(
      chatId,
      `💳 *Payment Method:* ${paymentMethod.toUpperCase()}\n\nPlease enter the contract address of the token.`,
      { parse_mode: "Markdown" }
    );
  }
});

// Contract address input handler
bot.onText(/^[A-Za-z0-9]{32,44}$/, async (msg) => {
  const chatId = msg.chat.id;
  const contractAddress = msg.text;

  const currentState = userState.get(chatId) || {};
  const { blockchain, selectedPlan, paymentMethod } = currentState;

  // Validate inputs
  if (!blockchain) {
    await bot.sendMessage(chatId, "⚠️ Please select a blockchain first.", { parse_mode: "Markdown" });
    return;
  }

  if (!selectedPlan) {
    await bot.sendMessage(chatId, "⚠️ Please select a plan before providing the contract address.", { parse_mode: "Markdown" });
    return;
  }

  if (!paymentMethod) {
    await bot.sendMessage(chatId, "⚠️ Please select a payment method.", { parse_mode: "Markdown" });
    return;
  }

  await handleContractAddress(chatId, blockchain, contractAddress);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Gracefully shutting down from SIGINT (Ctrl-C)');
  bot.stopPolling();
  process.exit(0);
});

module.exports = bot;