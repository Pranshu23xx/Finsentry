import { createLogger } from "./logger"
import { createHash, randomUUID } from "node:crypto"

const logger = createLogger("payments")

interface PaymentTransaction {
  transactionId: string
  customerId: string
  amount: number
  currency: string
  beneficiary: string
  approvalState: "pending" | "approved" | "rejected" | "completed"
  actor: string
  timestamp: string
  decisionReason: string
}

export function createPayment(
  customerId: string,
  amount: number,
  beneficiary: string,
  actor: string
): PaymentTransaction {
  const transaction: PaymentTransaction = {
    transactionId: randomUUID(),
    customerId,
    amount,
    currency: "INR",
    beneficiary,
    approvalState: "pending",
    actor,
    timestamp: new Date().toISOString(),
    decisionReason: "initiated",
  }

  auditPayment(transaction)
  return transaction
}

function auditPayment(tx: PaymentTransaction): void {
  const hash = createHash("sha256").update(tx.transactionId).digest("hex")
  logger.audit("payment_transaction", {
    transactionId: tx.transactionId,
    auditHash: hash,
    customerId: tx.customerId,
    amount: tx.amount,
    currency: tx.currency,
    beneficiary: tx.beneficiary,
    approvalState: tx.approvalState,
    actor: tx.actor,
    timestamp: tx.timestamp,
    decisionReason: tx.decisionReason,
  })
}
