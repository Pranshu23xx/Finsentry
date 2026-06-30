export type SlashCommandName = "install" | "status" | "help"

export interface SlashCommand {
  kind: SlashCommandName
  raw: string
  args: string[]
}

export interface CommandDefinition {
  name: `/${SlashCommandName}`
  description: string
}

export interface OfflineCommandResult {
  title: string
  body: string
}

export const COMMANDS: CommandDefinition[] = [
  { name: "/install", description: "Install or refresh the local FinSentry regulation data" },
  { name: "/status", description: "Show MCP, setup, regulation, scan, and validation readiness" },
  { name: "/help", description: "Show the supported dashboard commands" },
]

const COMMAND_NAMES = new Set(COMMANDS.map((command) => command.name.slice(1)))

export function parseSlashCommand(input: string): SlashCommand {
  const normalized = input.trim()
  if (!normalized.startsWith("/")) {
    return { kind: "help", raw: input, args: [] }
  }

  const [command = "/help", ...args] = normalized.split(/\s+/)
  const name = command.slice(1).toLowerCase()

  if (COMMAND_NAMES.has(name)) {
    return { kind: name as SlashCommandName, raw: input, args }
  }

  return { kind: "help", raw: input, args: [] }
}

export function runOfflineCommand(command: SlashCommand): OfflineCommandResult {
  switch (command.kind) {
    case "install":
      return {
        title: "Install",
        body: "Runs the local setup flow and refreshes FinSentry regulation data.",
      }
    case "status":
      return {
        title: "Status",
        body: "Shows setup, MCP, regulation, scan, and validation readiness.",
      }
    case "help":
      return {
        title: "Help",
        body: COMMANDS.map((item) => `${item.name} - ${item.description}`).join("\n"),
      }
  }
}

export function getCommandHelp(): string {
  return COMMANDS.map((command) => command.name).join(" ")
}
