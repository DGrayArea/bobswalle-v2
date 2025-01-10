// config.js
import dotenv from 'dotenv';
dotenv.config();

export default {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  ethereumRpcUrl: process.env.ETHEREUM_RPC_URL,
  walletAddresses: {
    ethereum: process.env.ETHEREUM_WALLET_ADDRESS,
    base: process.env.BASE_WALLET_ADDRESS,
    solana: process.env.SOLANA_WALLET_ADDRESS
  }
};