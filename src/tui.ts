import { Box, ScrollBox, TabSelect, Text, TextAttributes, bold, createCliRenderer, fg, t } from "@opentui/core"
import { getSetupState } from "./setup"
import { getDb, getDocuments, getLatestScan, getMaps, getScanResults, getValidations } from "./db"
import { COMMANDS, getCommandHelp, parseSlashCommand, runOfflineCommand } from "./commands"
import type { Document, MAP, Scan, Validation } from "./types"

type ScreenName = "dashboard" | "regulations" | "requirements" | "auth-demo" | "scan" | "validate" | "about"

const SCREEN_NAMES: ScreenName[] = ["dashboard", "regulations", "requirements", "auth-demo", "scan", "validate", "about"]

const CANARA_BLUE = "#003366"
const CANARA_SAFFRON = "#FF9933"
const GOOD = "#2E7D32"
const BAD = "#C62828"
const WARN = "#F9A825"
const MUTED = "#8EA4B8"

interface AppState {
  selectedIndex: number
}

interface RegulationSummary {
  id: string
  name: string
  category: string
  fetchedAt: string
  pageCount: number
  source: "regulation" | "document"
}

export async function launchTui(): Promise<void> {
  const state: AppState = {
    selectedIndex: 0,
  }

  const renderer = await createCliRenderer({ exitOnCtrlC: true })
  let currentApp: any = null

  function render(): void {
    if (currentApp !== null) {
      renderer.root.remove(currentApp)
    }

    currentApp = buildApp(state, render)
    renderer.root.add(currentApp)
  }

  render()
}

function buildApp(state: AppState, reRender: () => void): any {
  const tabs = TabSelect({
    width: 96,
    tabWidth: 16,
    options: [
      { name: "Dashboard", description: "Stats" },
      { name: "Regulations", description: "RBI docs" },
      { name: "Requirements", description: "Controls" },
      { name: "Auth Demo", description: "RBI auth" },
      { name: "Scan", description: "History" },
      { name: "Validate", description: "Proof" },
      { name: "About", description: "Canara" },
    ],
  })

  tabs.on("selectionChanged", (index: number) => {
    state.selectedIndex = index
    reRender()
  })
  tabs.focus()

  const screen = SCREEN_NAMES[state.selectedIndex] ?? "dashboard"

  return Box(
    { flexDirection: "column", padding: 1, gap: 1, height: "100%" },
    header(),
    Box({ padding: 1, borderStyle: "single", borderColor: CANARA_BLUE }, tabs),
    buildScreen(screen),
    footer(screen)
  )
}

function header(): any {
  return Box(
    { flexDirection: "column", borderStyle: "double", borderColor: CANARA_BLUE, padding: 1, gap: 0 },
    Text({ content: t`${fg(CANARA_SAFFRON)(bold(" CANARA BANK  "))}${fg("#FFFFFF")(bold("FinSentry"))}` }),
    Text({
      content: " Programmatic RBI compliance proof for banking engineering teams ",
      fg: MUTED,
    }),
    Text({
      content: " Offline agent ready | RBI mandates -> requirements -> scans -> validation evidence ",
      fg: CANARA_SAFFRON,
    })
  )
}

function footer(screen: ScreenName): any {
  const command = parseSlashCommand(screen === "about" ? "/about" : screen === "auth-demo" ? "/auth" : "/status")
  const preview = runOfflineCommand(command)

  return Box(
    { borderStyle: "single", borderColor: CANARA_BLUE, padding: 1 },
    Text({
      content: ` Ctrl+C exit | arrows switch tabs | ${getCommandHelp()} | offline: ${preview.title}`,
      fg: MUTED,
    })
  )
}

function buildScreen(screen: ScreenName): any {
  switch (screen) {
    case "dashboard":
      return dashboardScreen()
    case "regulations":
      return regulationsScreen()
    case "requirements":
      return requirementsScreen()
    case "auth-demo":
      return authDemoScreen()
    case "scan":
      return scanScreen()
    case "validate":
      return validateScreen()
    case "about":
      return aboutScreen()
  }
}

function dashboardScreen(): any {
  const maps = safeRead(() => getMaps(), [] as MAP[])
  const scan = safeRead(() => getLatestScan(), null)
  const validations = scan ? safeRead(() => getValidations(scan.id), [] as Validation[]) : []
  const regulations = loadRegulations()
  const documents = safeRead(() => getDocuments(), [] as Document[])
  const setup = safeRead(() => getSetupState(), null)

  const score = complianceScore(validations)
  const bar = scoreBar(score)
  const stats = [
    metric("RBI docs loaded", String(regulations.length || documents.length), regulations.length > 0 ? GOOD : WARN),
    metric("Requirements", String(maps.length), maps.length > 0 ? GOOD : WARN),
    metric("Latest scan", scan ? `#${scan.id}` : "none", scan ? GOOD : WARN),
    metric("Compliance", validations.length > 0 ? `${score}% ${bar}` : "pending", validations.length > 0 ? scoreColor(score) : WARN),
    metric("Offline agent", setup?.completed ? "ready" : "local mode", GOOD),
  ]

  return Box(
    { flexDirection: "column", borderStyle: "rounded", borderColor: CANARA_BLUE, padding: 1, gap: 1, flexGrow: 1 },
    Text({ content: t`${fg(CANARA_SAFFRON)(bold(" Dashboard "))}` }),
    Box({ flexDirection: "column", gap: 0 }, ...stats),
    Text({}),
    Text({ content: "Mandate workflow", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
    Text({ content: "  RBI PDF intake -> MAP requirements -> repository scan -> validation proof", fg: "#DCE6F2" }),
    Text({ content: `  Last scan: ${formatScan(scan)}`, fg: MUTED }),
    Text({}),
    Text({ content: "Slash commands", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
    ...COMMANDS.map((command) => Text({ content: `  ${command.name.padEnd(10)} ${command.description}`, fg: "#DCE6F2" }))
  )
}

function regulationsScreen(): any {
  const regulations = loadRegulations()

  if (regulations.length === 0) {
    return emptyPanel(
      " Regulations ",
      "No RBI documents are loaded yet. Run setup or ingest RBI PDFs, then return here for the 8 Master Directions."
    )
  }

  const rows = regulations.map((reg) =>
    Text({
      content: ` ${reg.id.padEnd(12)} ${trim(reg.name, 38).padEnd(40)} ${reg.category.padEnd(16)} ${reg.pageCount
        .toString()
        .padStart(4)}p  ${formatDate(reg.fetchedAt)}`,
      fg: reg.source === "regulation" ? "#DCE6F2" : MUTED,
    })
  )

  return ScrollBox(
    { borderStyle: "rounded", borderColor: CANARA_BLUE, padding: 1, flexGrow: 1 },
    Box(
      { flexDirection: "column", gap: 0 },
      Text({ content: t`${fg(CANARA_SAFFRON)(bold(` Regulations (${regulations.length}) `))}` }),
      Text({ content: " ID           Name                                     Category          Page  Fetched", fg: MUTED }),
      Text({ content: " -------------------------------------------------------------------------------", fg: CANARA_BLUE }),
      ...rows
    )
  )
}

function requirementsScreen(): any {
  const maps = safeRead(() => getMaps(), [] as MAP[])

  if (maps.length === 0) {
    return emptyPanel(
      " Requirements ",
      "No requirements are available yet. After RBI documents are parsed, extracted MAPs will appear with status badges."
    )
  }

  const latestScan = safeRead(() => getLatestScan(), null)
  const validations = latestScan ? safeRead(() => getValidations(latestScan.id), [] as Validation[]) : []

  const rows = maps.flatMap((map) => {
    const validation = validations.find((item) => item.map_id === map.id)
    const badge = statusBadge(validation?.status)
    return [
      Text({
        content: ` ${badge.icon} ${map.requirement_id} [${map.severity.toUpperCase()}] ${map.title}`,
        fg: badge.color,
        attributes: TextAttributes.BOLD,
      }),
      Text({ content: `   ${trim(map.description, 120)}`, fg: "#DCE6F2" }),
      Text({ content: `   Evidence hints: ${map.verification_hints.join(" | ") || "pending"}`, fg: MUTED }),
      Text({}),
    ]
  })

  return ScrollBox(
    { borderStyle: "rounded", borderColor: CANARA_BLUE, padding: 1, flexGrow: 1 },
    Box(
      { flexDirection: "column", gap: 0 },
      Text({ content: t`${fg(CANARA_SAFFRON)(bold(` Requirements (${maps.length}) `))}` }),
      Text({ content: " Green = satisfied, red = missing, amber = needs review, ? = not validated", fg: MUTED }),
      Text({}),
      ...rows
    )
  )
}

function authDemoScreen(): any {
  const maps = safeRead(() => getMaps(), [] as MAP[])
  const authMaps = maps.filter((map) => {
    const haystack = `${map.requirement_id} ${map.title} ${map.description} ${map.verification_hints.join(" ")}`.toLowerCase()
    return ["auth", "login", "password", "mfa", "otp", "session", "token"].some((keyword) => haystack.includes(keyword))
  })

  const demoRows = [
    {
      id: "AUTH-001",
      control: "Multi-factor authentication for privileged and customer-sensitive actions",
      evidence: "auth/mfa.ts, otp.service.ts, transaction-approval.ts",
      status: "needs_review" as const,
    },
    {
      id: "AUTH-002",
      control: "Strong session expiry, token rotation, and replay protection",
      evidence: "session.middleware.ts, jwt-rotation.ts",
      status: "satisfied" as const,
    },
    {
      id: "AUTH-003",
      control: "Audit trail for failed login attempts and account lock events",
      evidence: "login.controller.ts, audit-log.repository.ts",
      status: "missing" as const,
    },
    {
      id: "AUTH-004",
      control: "Step-up authentication for risky device or beneficiary changes",
      evidence: "risk-engine.ts, device-binding.ts",
      status: "needs_review" as const,
    },
  ]

  const authSummary = authMaps.length > 0
    ? `${authMaps.length} extracted authentication requirement(s) found in local DB`
    : "Demo mode: auth requirements will bind to RBI extracted MAPs after setup"

  return ScrollBox(
    { borderStyle: "rounded", borderColor: CANARA_BLUE, padding: 1, flexGrow: 1 },
    Box(
      { flexDirection: "column", gap: 0 },
      Text({ content: t`${fg(CANARA_SAFFRON)(bold(" Authentication Compliance Demo "))}` }),
      Text({ content: " RBI authentication mandate -> code evidence -> proof status", fg: MUTED }),
      Text({ content: ` ${authSummary}`, fg: authMaps.length > 0 ? GOOD : WARN }),
      Text({}),
      Text({ content: "Demo checks", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
      ...demoRows.flatMap((row) => {
        const badge = statusBadge(row.status)
        return [
          Text({
            content: ` ${badge.icon} ${row.id} ${row.control}`,
            fg: badge.color,
            attributes: TextAttributes.BOLD,
          }),
          Text({ content: `   Evidence: ${row.evidence}`, fg: "#DCE6F2" }),
          Text({}),
        ]
      }),
      Text({ content: "Offline agent prompt", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
      Text({ content: '  "Check my auth code against RBI authentication guidelines."', fg: "#DCE6F2" }),
      Text({ content: "  Expected path: /auth -> /scan -> /validate -> evidence-backed status", fg: MUTED }),
      Text({}),
      Text({ content: "Live extracted auth requirements", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
      ...(authMaps.length > 0
        ? authMaps.slice(0, 8).map((map) => Text({ content: `  ${map.requirement_id}: ${trim(map.title, 88)}`, fg: "#DCE6F2" }))
        : [Text({ content: "  No local auth MAPs yet. Run setup/ingest when Pranshu data pipeline is ready.", fg: MUTED })])
    )
  )
}

function scanScreen(): any {
  const scan = safeRead(() => getLatestScan(), null)

  if (!scan) {
    return emptyPanel(" Scan ", "No scan history yet. Run: bun run finsentry scan <repo-path>")
  }

  const results = safeRead(() => getScanResults(scan.id), [])
  const impacted = unique(results.map((result) => result.filepath))

  return ScrollBox(
    { borderStyle: "rounded", borderColor: CANARA_BLUE, padding: 1, flexGrow: 1 },
    Box(
      { flexDirection: "column", gap: 0 },
      Text({ content: t`${fg(CANARA_SAFFRON)(bold(` Scan #${scan.id} `))}` }),
      Text({ content: ` Repo:      ${scan.repo_path}`, fg: "#DCE6F2" }),
      Text({ content: ` When:      ${formatDate(scan.scanned_at)}`, fg: "#DCE6F2" }),
      Text({ content: ` Files:     ${scan.summary.total_files}`, fg: "#DCE6F2" }),
      Text({ content: ` Impacted:  ${scan.summary.impacted_files}`, fg: scan.summary.impacted_files > 0 ? WARN : GOOD }),
      Text({ content: ` Checked:   ${scan.summary.maps_checked} requirements`, fg: "#DCE6F2" }),
      Text({}),
      Text({ content: "Impacted files", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
      ...(impacted.length > 0
        ? impacted.slice(0, 24).map((file) => Text({ content: `  ${file}`, fg: MUTED }))
        : [Text({ content: "  No impacted files were recorded for this scan.", fg: MUTED })])
    )
  )
}

function validateScreen(): any {
  const scan = safeRead(() => getLatestScan(), null)

  if (!scan) {
    return emptyPanel(" Validate ", "Run a repository scan first, then run: bun run finsentry validate")
  }

  const validations = safeRead(() => getValidations(scan.id), [] as Validation[])
  if (validations.length === 0) {
    return emptyPanel(" Validate ", "No validation rows yet. Run: bun run finsentry validate")
  }

  const sat = validations.filter((v) => v.status === "satisfied").length
  const miss = validations.filter((v) => v.status === "missing").length
  const review = validations.filter((v) => v.status === "needs_review").length

  return ScrollBox(
    { borderStyle: "rounded", borderColor: CANARA_BLUE, padding: 1, flexGrow: 1 },
    Box(
      { flexDirection: "column", gap: 0 },
      Text({ content: t`${fg(CANARA_SAFFRON)(bold(" Validate "))}` }),
      Text({ content: ` Compliance score: ${complianceScore(validations)}% ${scoreBar(complianceScore(validations))}`, fg: scoreColor(complianceScore(validations)) }),
      Text({ content: ` Satisfied: ${sat} | Missing: ${miss} | Needs review: ${review}`, fg: MUTED }),
      Text({}),
      ...validations.map((validation) => {
        const badge = statusBadge(validation.status)
        return Text({
          content: ` ${badge.icon} MAP #${validation.map_id}: ${validation.status}${validation.details ? ` - ${trim(validation.details, 120)}` : ""}`,
          fg: badge.color,
        })
      })
    )
  )
}

function aboutScreen(): any {
  return Box(
    { flexDirection: "column", borderStyle: "double", borderColor: CANARA_BLUE, padding: 1, gap: 0, flexGrow: 1 },
    Text({ content: t`${fg(CANARA_SAFFRON)(bold(" CANARA BANK "))}` }),
    Text({ content: "  ____                              ____              _", fg: CANARA_SAFFRON }),
    Text({ content: " / ___|__ _ _ __   __ _ _ __ __ _  | __ )  __ _ _ __ | | __", fg: CANARA_SAFFRON }),
    Text({ content: "| |   / _` | '_ \\ / _` | '__/ _` | |  _ \\ / _` | '_ \\| |/ /", fg: CANARA_SAFFRON }),
    Text({ content: "| |__| (_| | | | | (_| | | | (_| | | |_) | (_| | | | |   <", fg: CANARA_SAFFRON }),
    Text({ content: " \\____\\__,_|_| |_|\\__,_|_|  \\__,_| |____/ \\__,_|_| |_|_|\\_\\", fg: CANARA_SAFFRON }),
    Text({}),
    Text({ content: "FinSentry", fg: "#FFFFFF", attributes: TextAttributes.BOLD }),
    Text({ content: "Local-first compliance intelligence for RBI mandates and engineering proof.", fg: "#DCE6F2" }),
    Text({}),
    Text({ content: "Team credits", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
    Text({ content: "  Shreyash  - Dashboard lead, main stats, requirements, Canara branding polish", fg: "#DCE6F2" }),
    Text({ content: "  Debasmita - Regulations and scan surfaces", fg: MUTED }),
    Text({ content: "  Archita   - Validate and about surfaces", fg: MUTED }),
    Text({ content: "  Pranshu   - MCP server and RBI data pipeline", fg: MUTED }),
    Text({}),
    Text({ content: "Offline slash commands", fg: CANARA_SAFFRON, attributes: TextAttributes.BOLD }),
    ...COMMANDS.map((command) => Text({ content: `  ${command.name.padEnd(10)} ${command.description}`, fg: "#DCE6F2" }))
  )
}

function emptyPanel(title: string, message: string): any {
  return Box(
    { flexDirection: "column", borderStyle: "rounded", borderColor: CANARA_BLUE, padding: 1, gap: 1, flexGrow: 1 },
    Text({ content: t`${fg(CANARA_SAFFRON)(bold(title))}` }),
    Text({ content: ` ${message}`, fg: MUTED })
  )
}

function metric(label: string, value: string, color: string): any {
  return Text({
    content: ` ${label.padEnd(18)} ${value}`,
    fg: color,
  })
}

function loadRegulations(): RegulationSummary[] {
  const fromRegulations = safeRead(() => {
    const db = getDb()
    const table = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'regulations'").get()
    if (!table) return []

    return db
      .query<any, []>(
        "SELECT id, name, category, fetched_at, page_count FROM regulations ORDER BY category, id"
      )
      .all()
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        category: String(row.category),
        fetchedAt: String(row.fetched_at ?? ""),
        pageCount: Number(row.page_count ?? 0),
        source: "regulation" as const,
      }))
  }, [] as RegulationSummary[])

  if (fromRegulations.length > 0) return fromRegulations

  return safeRead(() => getDocuments(), [] as Document[]).map((doc) => ({
    id: `DOC-${doc.id}`,
    name: doc.filename,
    category: doc.is_seeded ? "seeded" : "ingested",
    fetchedAt: doc.ingested_at,
    pageCount: 0,
    source: "document" as const,
  }))
}

function complianceScore(validations: Validation[]): number {
  if (validations.length === 0) return 0
  const satisfied = validations.filter((v) => v.status === "satisfied").length
  return Math.round((satisfied / validations.length) * 100)
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 10)
  return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`
}

function scoreColor(score: number): string {
  if (score >= 80) return GOOD
  if (score >= 50) return WARN
  return BAD
}

function statusBadge(status?: Validation["status"]): { icon: string; color: string } {
  if (status === "satisfied") return { icon: "OK", color: GOOD }
  if (status === "missing") return { icon: "NO", color: BAD }
  if (status === "needs_review") return { icon: "??", color: WARN }
  return { icon: "?", color: MUTED }
}

function formatScan(scan: Scan | null): string {
  if (!scan) return "no scan yet"
  return `${scan.repo_path} at ${formatDate(scan.scanned_at)}`
}

function formatDate(value: string): string {
  if (!value) return "pending"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function trim(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function safeRead<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}
