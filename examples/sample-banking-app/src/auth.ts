import { createLogger } from "./logger"

const logger = createLogger("auth")

interface AuthEvent {
  customerId: string
  channel: "web" | "mobile" | "atm" | "branch"
  timestamp: Date
  outcome: "success" | "failure" | "lockout"
  riskSignals: string[]
}

export function logAuthEvent(event: AuthEvent): void {
  logger.info("auth_event", {
    customerId: event.customerId,
    channel: event.channel,
    timestamp: event.timestamp.toISOString(),
    outcome: event.outcome,
    riskSignals: event.riskSignals,
  })
}

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000

const attemptStore = new Map<string, number[]>()
const lockoutStore = new Set<string>()

export function checkFailedLogins(customerId: string): boolean {
  const now = Date.now()
  const attempts = attemptStore.get(customerId) ?? []
  const recent = attempts.filter((t) => now - t < LOCKOUT_WINDOW_MS)
  recent.push(now)
  attemptStore.set(customerId, recent)

  if (recent.length >= MAX_FAILED_ATTEMPTS) {
    lockoutStore.add(customerId)
    logger.warn("account_lockout", { customerId, reason: "max_failed_attempts" })
    triggerRiskEvent(customerId)
    return true
  }
  return false
}

function triggerRiskEvent(customerId: string): void {
  logger.audit("risk_event", {
    customerId,
    eventType: "failed_login_threshold_exceeded",
    threshold: MAX_FAILED_ATTEMPTS,
    windowMinutes: 15,
  })
}

export function isLockedOut(customerId: string): boolean {
  return lockoutStore.has(customerId)
}

export function resetLockout(customerId: string): void {
  lockoutStore.delete(customerId)
  attemptStore.delete(customerId)
}
