export function maskString(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) return value
  const masked = "*".repeat(value.length - visibleChars)
  return masked + value.slice(-visibleChars)
}

export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber
  return "XXXX" + accountNumber.slice(-4)
}

export function maskCustomerId(id: string): string {
  if (id.length <= 3) return id
  return id[0] + "***" + id.slice(-1)
}

export function sanitizeForLogging(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveFields = [
    "accountNumber", "account_number", "acctNo",
    "ssn", "pan", "aadhaar", "dob",
    "password", "pin", "cvv", "secret",
    "token", "authToken",
  ]

  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (sensitiveFields.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      if (typeof value === "string") {
        sanitized[key] = maskString(value, 2)
      } else {
        sanitized[key] = "[REDACTED]"
      }
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}
