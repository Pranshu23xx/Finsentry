import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

const root = import.meta.dir

export function finsentryDir(): string {
  return join(root, "..", ".finsentry")
}

export function logsDir(): string {
  return join(finsentryDir(), "logs")
}

export function dbPath(): string {
  return join(finsentryDir(), "finsentry.db")
}

export function logToFile(level: string, message: string): void {
  const dir = logsDir()
  mkdirSync(dir, { recursive: true })
  const ts = new Date().toISOString()
  appendFileSync(join(dir, "setup.log"), `[${ts}] ${level.toUpperCase()}: ${message}\n`)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function parseCliArgs(args: string[]): {
  command: string
  positional: string[]
} {
  const cmd = args[0] ?? ""
  const positional = args.slice(1).filter((a) => !a.startsWith("-"))
  return { command: cmd, positional }
}
