import { createCliRenderer, Box, Text, TabSelect, ScrollBox, TextAttributes, t, bold, fg } from "@opentui/core"
import { getSetupState } from "./setup"
import { getMaps, getLatestScan, getScanResults, getValidations } from "./db"
import type { SetupState, MAP, Scan, Validation } from "./types"

type ScreenName = "dashboard" | "setup" | "maps" | "scan" | "validate" | "mcp"

const SCREEN_NAMES: ScreenName[] = ["dashboard", "setup", "maps", "scan", "validate", "mcp"]

interface AppState {
  selectedIndex: number
  setupState: SetupState | null
}

export async function launchTui(): Promise<void> {
  const state: AppState = {
    selectedIndex: 0,
    setupState: null,
  }

  try {
    state.setupState = getSetupState()
  } catch { }

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
  const header = Box(
    { borderStyle: "rounded", padding: 1, gap: 1 },
    Text({
      content: t`${bold(" FinSentry - Compliance Intelligence ")}`,
      fg: "#00AAFF",
    }),
    Text({
      content: " Local-first regulatory compliance for engineering teams ",
      fg: "#888888",
    })
  )

  const tabs = TabSelect({
    width: 80,
    tabWidth: 14,
    options: [
      { name: "Dashboard", description: "Overview" },
      { name: "Setup", description: "Install status" },
      { name: "MAPs", description: "Action points" },
      { name: "Scan", description: "Repo scan results" },
      { name: "Validate", description: "Compliance check" },
      { name: "MCP", description: "Server info" },
    ],
  })

  tabs.on("itemSelected", (_index: number, _option: { name: string }) => {
    // handled by selectionChanged
  })

  tabs.on("selectionChanged", (index: number) => {
    state.selectedIndex = index
    reRender()
  })

  tabs.focus()

  const content = buildScreen(state, SCREEN_NAMES[state.selectedIndex] ?? "dashboard")

  const footer = Box(
    { borderStyle: "single", padding: 1 },
    Text({
      content: t`${fg("#666666")(" Ctrl+C to exit | ← → navigate | Enter to select ")}`,
    })
  )

  return Box(
    { flexDirection: "column", padding: 1, gap: 1, height: "100%" },
    header,
    Box({ padding: 1 }, tabs),
    content,
    footer
  )
}

function buildScreen(state: AppState, screen: ScreenName): any {
  switch (screen) {
    case "setup":
      return setupScreen(state)
    case "dashboard":
      return dashboardScreen()
    case "maps":
      return mapsScreen()
    case "scan":
      return scanScreen()
    case "validate":
      return validateScreen()
    case "mcp":
      return mcpScreen()
  }
}

function setupScreen(state: AppState): any {
  const s = state.setupState
  if (!s) {
    return Box(
      { borderStyle: "rounded", padding: 1, flexGrow: 1 },
      Text({ content: " Could not read setup state. Run: bun run finsentry setup ", fg: "#888888" })
    )
  }

  const items = [
    `Database          ${s.db_initialized ? "✓" : "○"}`,
    `Ollama Installed  ${s.ollama_installed ? "✓" : "○"}`,
    `Ollama Running    ${s.ollama_running ? "✓" : "○"}`,
    `Model Pulled      ${s.model_pulled ? "✓" : "○"}`,
    `Guideline Seeded  ${s.seeded ? "✓" : "○"}`,
    `MAPs Extracted    ${s.maps_extracted ? "✓" : "○"}`,
    `Setup Complete    ${s.completed ? "✓" : "○"}`,
  ]

  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, gap: 1, flexGrow: 1 },
    Text({ content: t`${fg("#FFFF00")(" Setup Status ")}` }),
    Box({ flexDirection: "column", gap: 0 }, ...items.map((i) => Text({ content: `  ${i}` }))),
    Text({}),
    Text({ content: " Run: bun run finsentry setup", fg: "#888888" })
  )
}

function dashboardScreen(): any {
  const maps = getMaps()
  const scan = getLatestScan()

  const items = [
    `MAPs Extracted:      ${maps.length}`,
    `Requirements:        ${maps.length > 0 ? maps.map((m) => m.requirement_id).join(", ") : "N/A"}`,
    `Latest Scan:         ${scan ? scan.repo_path : "No scan yet"}`,
    `Impacted Files:      ${scan ? scan.summary.impacted_files : "N/A"}`,
  ]

  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, gap: 1, flexGrow: 1 },
    Text({ content: t`${fg("#00FF00")(" Dashboard ")}` }),
    Box({ flexDirection: "column", gap: 0 }, ...items.map((i) => Text({ content: `  ${i}` }))),
    Text({}),
    Text({ content: " Commands:", fg: "#FFFF00" }),
    Text({ content: "   bun run finsentry setup" }),
    Text({ content: "   bun run finsentry scan <repo>" }),
    Text({ content: "   bun run finsentry validate" }),
    Text({ content: "   bun run finsentry mcp" })
  )
}

function mapsScreen(): any {
  const maps = getMaps()

  if (maps.length === 0) {
    return Box(
      { borderStyle: "rounded", padding: 1, flexGrow: 1 },
      Text({ content: " No MAPs extracted. Run: bun run finsentry setup ", fg: "#888888" })
    )
  }

  const items = maps.flatMap((m) => [
    Text({
      content: ` ${m.requirement_id} [${m.severity.toUpperCase()}] ${m.title}`,
      fg: m.severity === "critical" ? "#FF0000" : m.severity === "high" ? "#FF8800" : "#AAAAAA",
      attributes: TextAttributes.BOLD,
    }),
    Text({
      content: `   ${m.description.slice(0, 120)}${m.description.length > 120 ? "..." : ""}`,
      fg: "#CCCCCC",
    }),
    Text({
      content: `   Criteria: ${m.measurable_criteria.join(" | ")}`,
      fg: "#888888",
    }),
    Text({}),
  ])

  return ScrollBox(
    { borderStyle: "rounded", padding: 1, flexGrow: 1 },
    Box(
      { flexDirection: "column", gap: 0 },
      Text({ content: t`${fg("#00AAFF")(` Measurable Action Points (${maps.length}) `)}` }),
      Text({}),
      ...items
    )
  )
}

function scanScreen(): any {
  const scan = getLatestScan()

  const content = scan
    ? Box(
        { flexDirection: "column", gap: 0 },
        Text({ content: ` Repo:    ${scan.repo_path}` }),
        Text({ content: ` When:    ${scan.scanned_at}` }),
        Text({ content: ` Files:   ${scan.summary.total_files}` }),
        Text({ content: ` Hit:     ${scan.summary.impacted_files}` }),
        Text({ content: ` MAPs:    ${scan.summary.maps_checked}` })
      )
    : Text({ content: " No scan results. Run: bun run finsentry scan <repo-path> ", fg: "#888888" })

  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, gap: 1, flexGrow: 1 },
    Text({ content: t`${fg("#FF8800")(" Repository Scan ")}` }),
    content,
    Text({}),
    Text({ content: " Run: bun run finsentry scan ./examples/sample-banking-app", fg: "#FFFF00" })
  )
}

function validateScreen(): any {
  const scan = getLatestScan()

  if (!scan) {
    return Box(
      { borderStyle: "rounded", padding: 1, flexGrow: 1 },
      Text({ content: " No validation results. Run a scan first. ", fg: "#888888" })
    )
  }

  const validations = getValidations(scan.id)

  if (validations.length === 0) {
    return Box(
      { borderStyle: "rounded", padding: 1, flexGrow: 1 },
      Text({ content: " Run: bun run finsentry validate ", fg: "#888888" })
    )
  }

  const sat = validations.filter((v) => v.status === "satisfied").length
  const miss = validations.filter((v) => v.status === "missing").length
  const rev = validations.filter((v) => v.status === "needs_review").length

  const items = validations.map((v) => {
    const color = v.status === "satisfied" ? "#00FF00" : v.status === "missing" ? "#FF0000" : "#FF8800"
    const icon = v.status === "satisfied" ? "✓" : v.status === "missing" ? "✗" : "?"
    return Text({
      content: ` ${icon} MAP #${v.map_id}: ${v.status}${v.details ? " " + v.details.slice(0, 120) : ""}`,
      fg: color,
    })
  })

  const headerText = ` Validation  (✓${sat}  ✗${miss}  ?${rev}) `

  return ScrollBox(
    { borderStyle: "rounded", padding: 1, flexGrow: 1 },
    Box(
      { flexDirection: "column", gap: 0 },
      Text({ content: t`${fg("#00AAFF")(headerText)}` }),
      Text({}),
      ...items
    )
  )
}

function mcpScreen(): any {
  return Box(
    { flexDirection: "column", borderStyle: "rounded", padding: 1, gap: 1, flexGrow: 1 },
    Text({ content: t`${fg("#FF00FF")(" MCP Server ")}` }),
    Text({ content: " Start: bun run finsentry mcp", fg: "#FFFF00" }),
    Text({}),
    Text({ content: " Then add to your MCP client:", fg: "#00AAFF" }),
    Text({ content: '   { "command": "bun", "args": ["src/main.ts", "mcp"] }' }),
    Text({}),
    Text({ content: " Tools:", fg: "#FFFF00" }),
    Text({ content: "   list_maps" }),
    Text({ content: "   get_map" }),
    Text({ content: "   get_latest_scan" }),
    Text({ content: "   find_impacted_files" }),
    Text({ content: "   validate_requirement" }),
    Text({}),
    Text({ content: " Resources:", fg: "#FFFF00" }),
    Text({ content: "   finsentry://maps/latest" }),
    Text({ content: "   finsentry://scan/latest" })
  )
}
