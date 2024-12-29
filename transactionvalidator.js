const { Connection, PublicKey } = require("@solana/web3.js");
const config = require("./config");

// Initialize the Solana RPC connection
const connection = new Connection(config.solanaRpcUrl, "confirmed");

/**
 * Validates a Solana transaction.
 *
 * @param {string} txId - The transaction ID (hash).
 * @param {number} requiredAmount - The required SOL amount for the plan.
 * @param {string} targetAddress - The expected receiving wallet address.
 * @returns {Promise<boolean>} - Returns true if the transaction is valid, otherwise false.
 */
async function validateTransaction(txId, requiredAmount, targetAddress) {
  try {
    // Fetch the transaction details
    const txDetails = await connection.getTransaction(txId, { commitment: "confirmed" });

    if (!txDetails) {
      console.error("Transaction not found.");
      return false;
    }

    // Extract the transaction meta information
    const { meta, transaction } = txDetails;
    if (!meta || meta.err) {
      console.error("Transaction failed or contains errors.");
      return false;
    }

    // Check if the transaction includes the expected SOL transfer
    const message = transaction.message;
    const instructions = message.instructions;

    let validTransaction = false;
    for (const instruction of instructions) {
      const programId = instruction.programId.toString();

      // Check if the instruction is a native SOL transfer
      if (programId === "11111111111111111111111111111111") {
        const [source, destination, lamports] = instruction.keys.map((key) => key.pubkey.toString());
        const amount = lamports / Math.pow(10, 9); // Convert lamports to SOL

        if (destination === targetAddress && amount === requiredAmount) {
          validTransaction = true;
          break;
        }
      }
    }

    return validTransaction;
  } catch (error) {
    console.error("Error validating transaction:", error);
    return false;
  }
}

module.exports = validateTransaction;
