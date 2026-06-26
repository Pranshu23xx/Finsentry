export type SlashCommandName =
  | "help"
  | "about"
  | "auth"
  | "all"
  | "scan"
  | "validate"
  | "status"
  | "fetch"
  | "exit"

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
  exits: boolean
}

export const COMMANDS: CommandDefinition[] = [
  { name: "/help", description: "Show all dashboard commands" },
  { name: "/about", description: "Show FinSentry credits and Canara Bank branding" },
  { name: "/auth", description: "Filter authentication requirements" },
  { name: "/all", description: "Show all requirements" },
  { name: "/scan", description: "Run a local repository scan" },
  { name: "/validate", description: "Run offline compliance validation" },
  { name: "/status", description: "Show loaded regulations and latest scan" },
  { name: "/fetch", description: "Re-download RBI guidelines when online" },
  { name: "/exit", description: "Quit the terminal dashboard" },
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
    case "help":
      return {
        title: "Help",
        body: COMMANDS.map((item) => `${item.name} - ${item.description}`).join("\n"),
        exits: false,
      }
    case "about":
      return {
        title: "About",
        body: "FinSentry dashboard by Shreyash with Canara Bank branding.",
        exits: false,
      }
    case "auth":
      return {
        title: "Authentication Filter",
        body: "Showing authentication-focused RBI requirements.",
        exits: false,
      }
    case "all":
      return {
        title: "All Requirements",
        body: "Showing every extracted RBI requirement.",
        exits: false,
      }
    case "scan":
      return {
        title: "Scan",
        body: "Offline agent command: bun run finsentry scan <repo-path>",
        exits: false,
      }
    case "validate":
      return {
        title: "Validate",
        body: "Offline agent command: bun run finsentry validate",
        exits: false,
      }
    case "status":
      return {
        title: "Status",
        body: "Showing loaded regulations, latest scan, and compliance score.",
        exits: false,
      }
    case "fetch":
      return {
        title: "Fetch",
        body: "Online command: bun run finsentry setup or future --fetch-new pipeline.",
        exits: false,
      }
    case "exit":
      return {
        title: "Exit",
        body: "Closing FinSentry dashboard.",
        exits: true,
      }
  }
}

export function getCommandHelp(): string {
  return COMMANDS.map((command) => command.name).join(" ")
}
