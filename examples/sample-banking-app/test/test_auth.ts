import { checkFailedLogins, isLockedOut, resetLockout, logAuthEvent } from "../src/auth"

// Simulate multiple failed logins
const customerId = "CUST001"
for (let i = 0; i < 6; i++) {
  logAuthEvent({
    customerId,
    channel: "web",
    timestamp: new Date(),
    outcome: "failure",
    riskSignals: ["invalid_password"],
  })
  checkFailedLogins(customerId)
}

const locked = isLockedOut(customerId)
console.log(`Locked out: ${locked ? "PASS" : "FAIL"}`)

resetLockout(customerId)
console.log(`Reset: ${!isLockedOut(customerId) ? "PASS" : "FAIL"}`)
