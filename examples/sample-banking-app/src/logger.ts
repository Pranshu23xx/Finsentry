import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

type LogLevel = "info" | "warn" | "error" | "audit"

interface LogEntry {
  level: LogLevel
  module: string
  event: string
  data: Record<string, unknown>
  timestamp: string
}

class AuditLogger {
  private module: string
  private logDir: string

  constructor(module: string) {
    this.module = module
    this.logDir = join(process.cwd(), "logs")
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true })
    }
  }

  private write(level: LogLevel, event: string, data: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      module: this.module,
      event,
      data: this.sanitize(data),
      timestamp: new Date().toISOString(),
    }

    const line = JSON.stringify(entry) + "\n"
    const logFile = join(this.logDir, `${this.module}.log`)
    writeFileSync(logFile, line, { flag: "a" })
  }

  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ["password", "secret", "token", "ssn", "pin", "cvv"]
    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(data)) {
      if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
        sanitized[key] = "[MASKED]"
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }

  info(event: string, data: Record<string, unknown> = {}): void {
    this.write("info", event, data)
  }

  warn(event: string, data: Record<string, unknown> = {}): void {
    this.write("warn", event, data)
  }

  error(event: string, data: Record<string, unknown> = {}): void {
    this.write("error", event, data)
  }

  audit(event: string, data: Record<string, unknown> = {}): void {
    this.write("audit", event, data)
  }
}

export function createLogger(module: string): AuditLogger {
  return new AuditLogger(module)
}

export function getRetentionConfig(): { retentionDays: number; configurable: boolean; auditable: boolean } {
  return {
    retentionDays: 180,
    configurable: true,
    auditable: true,
  }
}
