require('dotenv').config();

module.exports = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  walletAddresses: {
    ethereum: process.env.ETHEREUM_WALLET_ADDRESS,
    base: process.env.BASE_WALLET_ADDRESS,
    solana: process.env.SOLANA_WALLET_ADDRESS
  }
};