import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getSetupState, runSetup } from "./setup"
import { getDocuments, getLatestScan, getMaps, getValidations } from "./db"
import { COMMANDS, parseSlashCommand, runOfflineCommand } from "./commands"
import { isOllamaInstalled, isOllamaRunning, listModels } from "./ollama"

const PORT = Number(process.env.FINSENTRY_DASHBOARD_PORT ?? 4173)

interface DashboardStatus {
  setupCompleted: boolean
  ollamaInstalled: boolean
  ollamaRunning: boolean
  models: string[]
  documentsLoaded: number
  requirementsExtracted: number
  latestScan: string
  validationScore: string
  mcpReady: boolean
}

export async function launchTui(): Promise<void> {
  const server = Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === "/") return html(loginPage())
      if (url.pathname === "/dashboard") return html(dashboardPage())
      if (url.pathname === "/assets/canara-bank-logo.png") return logoResponse()
      if (url.pathname === "/api/status") return json(await getStatus())
      if (url.pathname === "/api/install" && req.method === "POST") return json(await runInstall())
      if (url.pathname === "/api/slash" && req.method === "POST") return json(await runSlash(req))

      return new Response("Not found", { status: 404 })
    },
  })

  console.log("\nFinSentry dashboard is running.")
  console.log(`Open: http://localhost:${server.port}`)
  console.log("MCP still runs separately with: bun src/main.ts mcp")
  console.log("Press Ctrl+C to stop.\n")

  await new Promise(() => {})
}

function loginPage(): string {
  return baseHtml("Login", `
    <main class="auth-shell">
      <section class="login-panel">
        <img class="brand-logo" src="/assets/canara-bank-logo.png" alt="Canara Bank logo" />
        <p class="eyebrow">Canara Bank</p>
        <h1>FinSentry</h1>
        <p class="subtitle">RBI compliance intelligence for authentication, regulations, and local MCP evidence.</p>

        <form class="login-form" onsubmit="event.preventDefault(); login();">
          <label>
            Employee ID
            <input id="loginId" autocomplete="username" placeholder="CB00123" required />
          </label>
          <label>
            Name
            <input id="loginName" autocomplete="name" placeholder="Branch Manager" required />
          </label>
          <button type="submit">Enter dashboard</button>
        </form>
      </section>
    </main>
    <script>
      function login() {
        const id = document.getElementById("loginId").value.trim();
        const name = document.getElementById("loginName").value.trim();
        if (!id || !name) return;
        sessionStorage.setItem("finsentryUser", JSON.stringify({ id, name }));
        window.location.href = "/dashboard";
      }
    </script>
  `)
}

function dashboardPage(): string {
  return baseHtml("Dashboard", `
    <main class="dashboard-shell">
      <aside class="sidebar">
        <img class="side-logo" src="/assets/canara-bank-logo.png" alt="Canara Bank logo" />
        <div>
          <p class="eyebrow">Canara Bank</p>
          <h1>FinSentry</h1>
        </div>
        <div class="user-card">
          <span id="userName">Compliance User</span>
          <small id="userId">ID pending</small>
        </div>
        <nav>
          <button onclick="runCommand('/install')">/install</button>
          <button onclick="runCommand('/status')">/status</button>
          <button onclick="runCommand('/help')">/help</button>
        </nav>
      </aside>

      <section class="main-panel">
        <header class="topbar">
          <div>
            <p class="eyebrow">Local MCP dashboard</p>
            <h2>Authentication and RBI Regulation Control Room</h2>
          </div>
          <div class="status-pill" id="mcpState">Checking MCP...</div>
        </header>

        <section class="hero-grid">
          <article class="hero-card">
            <h3>Authentication Page</h3>
            <p>Validate high-risk login, MFA, session, and failed-login controls before a regulation review.</p>
            <div class="control-list">
              <div><strong>AUTH-001</strong><span>Multi-factor authentication</span><b class="warn">Review</b></div>
              <div><strong>AUTH-002</strong><span>Session expiry and token rotation</span><b class="ok">Ready</b></div>
              <div><strong>AUTH-003</strong><span>Failed login monitoring</span><b class="bad">Action</b></div>
            </div>
          </article>

          <article class="command-card">
            <h3>Slash Commands</h3>
            <p>Only these commands are enabled for staff use.</p>
            <div class="slash-row">
              <button onclick="runCommand('/install')">/install</button>
              <button onclick="runCommand('/status')">/status</button>
              <button onclick="runCommand('/help')">/help</button>
            </div>
            <input id="slashInput" placeholder="Type /status" onkeydown="if(event.key==='Enter') runCommand(this.value)" />
          </article>
        </section>

        <section class="metrics">
          <article><span>Setup</span><strong id="setupMetric">-</strong></article>
          <article><span>Regulations</span><strong id="docsMetric">-</strong></article>
          <article><span>Requirements</span><strong id="reqMetric">-</strong></article>
          <article><span>Validation</span><strong id="validationMetric">-</strong></article>
        </section>

        <section class="workbench">
          <article>
            <h3>Manager View</h3>
            <p id="managerSummary">Loading status...</p>
            <div class="button-row">
              <button onclick="runCommand('/install')">Install / refresh regulations</button>
              <button onclick="runCommand('/status')">Check readiness</button>
              <button onclick="runCommand('/help')">Show help</button>
            </div>
          </article>
          <article>
            <h3>Command Output</h3>
            <pre id="commandOutput">Use /status to inspect local MCP and regulation readiness.</pre>
          </article>
        </section>
      </section>
    </main>
    <script>
      const user = JSON.parse(sessionStorage.getItem("finsentryUser") || "{}");
      if (!user.id || !user.name) window.location.href = "/";
      document.getElementById("userName").textContent = user.name || "Compliance User";
      document.getElementById("userId").textContent = user.id ? "ID " + user.id : "ID pending";

      async function refreshStatus() {
        const status = await fetch("/api/status").then((r) => r.json());
        document.getElementById("mcpState").textContent = status.mcpReady ? "MCP ready" : "MCP needs setup";
        document.getElementById("setupMetric").textContent = status.setupCompleted ? "Ready" : "Install";
        document.getElementById("docsMetric").textContent = status.documentsLoaded;
        document.getElementById("reqMetric").textContent = status.requirementsExtracted;
        document.getElementById("validationMetric").textContent = status.validationScore;
        document.getElementById("managerSummary").textContent =
          "Local MCP is " + (status.mcpReady ? "available" : "not ready") +
          ". " + status.documentsLoaded + " regulation document(s), " +
          status.requirementsExtracted + " requirement(s), latest scan: " + status.latestScan + ".";
      }

      async function runCommand(raw) {
        const command = (raw || "").trim();
        if (!command) return;
        document.getElementById("commandOutput").textContent = "Running " + command + "...";
        const result = await fetch("/api/slash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command })
        }).then((r) => r.json());
        document.getElementById("commandOutput").textContent = result.output;
        await refreshStatus();
      }

      refreshStatus();
    </script>
  `)
}

async function runSlash(req: Request): Promise<{ output: string }> {
  const body = await req.json().catch(() => ({ command: "/help" })) as { command?: string }
  const command = parseSlashCommand(body.command ?? "/help")

  if (command.kind === "install") {
    const result = await runInstall()
    return { output: result.message }
  }

  if (command.kind === "status") {
    const status = await getStatus()
    return {
      output: [
        "FinSentry Status",
        `Setup completed: ${status.setupCompleted ? "Yes" : "No"}`,
        `Ollama installed: ${status.ollamaInstalled ? "Yes" : "No"}`,
        `Ollama running: ${status.ollamaRunning ? "Yes" : "No"}`,
        `Models: ${status.models.length > 0 ? status.models.join(", ") : "None"}`,
        `Regulation documents: ${status.documentsLoaded}`,
        `Requirements: ${status.requirementsExtracted}`,
        `Latest scan: ${status.latestScan}`,
        `Validation: ${status.validationScore}`,
      ].join("\\n"),
    }
  }

  return { output: runOfflineCommand(command).body }
}

async function runInstall(): Promise<{ message: string }> {
  const messages: string[] = []
  try {
    const state = await runSetup((msg) => messages.push(msg))
    return {
      message: [
        "Install complete.",
        `Database: ${state.db_initialized ? "Ready" : "Pending"}`,
        `Ollama: ${state.ollama_installed ? "Ready" : "Pending"}`,
        `Model: ${state.model_pulled ? "Ready" : "Pending"}`,
        `Requirements: ${state.maps_extracted ? "Ready" : "Pending"}`,
        "",
        ...messages.slice(-8),
      ].join("\\n"),
    }
  } catch (error) {
    return { message: `Install failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function getStatus(): Promise<DashboardStatus> {
  const setup = safeRead(() => getSetupState(), null)
  const documents = safeRead(() => getDocuments(), [])
  const maps = safeRead(() => getMaps(), [])
  const scan = safeRead(() => getLatestScan(), null)
  const validations = scan ? safeRead(() => getValidations(scan.id), []) : []
  const models = await listModels()
  const ollamaInstalled = await isOllamaInstalled()
  const ollamaRunning = await isOllamaRunning()

  return {
    setupCompleted: setup?.completed ?? false,
    ollamaInstalled,
    ollamaRunning,
    models,
    documentsLoaded: documents.length,
    requirementsExtracted: maps.length,
    latestScan: scan ? `#${scan.id} ${scan.repo_path}` : "No scan yet",
    validationScore: validations.length > 0 ? `${score(validations)}%` : "Pending",
    mcpReady: Boolean(setup?.completed && ollamaRunning),
  }
}

function score(validations: Array<{ status: string }>): number {
  if (validations.length === 0) return 0
  return Math.round((validations.filter((item) => item.status === "satisfied").length / validations.length) * 100)
}

function logoResponse(): Response {
  const logo = readFileSync(join(process.cwd(), "assets", "canara-bank-logo.png"))
  return new Response(logo, { headers: { "Content-Type": "image/png" } })
}

function html(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } })
}

function json(value: unknown): Response {
  return Response.json(value)
}

function safeRead<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

function baseHtml(title: string, content: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FinSentry - ${title}</title>
  <style>
    :root {
      --blue: #003366;
      --saffron: #ff9933;
      --ink: #142033;
      --muted: #617086;
      --line: #d7dee8;
      --panel: #ffffff;
      --bg: #eef3f8;
      --ok: #2e7d32;
      --warn: #b86b00;
      --bad: #c62828;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      background: var(--bg);
      color: var(--ink);
      letter-spacing: 0;
    }
    button, input {
      font: inherit;
    }
    button {
      border: 0;
      border-radius: 6px;
      padding: 10px 14px;
      color: #fff;
      background: var(--blue);
      cursor: pointer;
      font-weight: 700;
    }
    button:hover { background: #004b91; }
    .auth-shell {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 28px;
      background: linear-gradient(135deg, #e7f4fb 0%, #ffffff 52%, #fff0df 100%);
    }
    .login-panel {
      width: min(430px, 100%);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 18px 50px rgba(0, 51, 102, .16);
    }
    .brand-logo {
      width: 86px;
      height: 86px;
      object-fit: contain;
      display: block;
      margin-bottom: 18px;
    }
    .eyebrow {
      margin: 0 0 6px;
      color: var(--saffron);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    h1, h2, h3, p { margin-top: 0; }
    h1 { margin-bottom: 8px; color: var(--blue); font-size: 34px; }
    h2 { margin-bottom: 0; color: var(--blue); font-size: 26px; }
    h3 { margin-bottom: 10px; color: var(--blue); font-size: 18px; }
    .subtitle { color: var(--muted); line-height: 1.5; }
    .login-form { display: grid; gap: 16px; margin-top: 24px; }
    label { display: grid; gap: 7px; font-weight: 700; color: var(--blue); }
    input {
      min-height: 42px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 10px 12px;
      color: var(--ink);
      background: #fff;
    }
    .dashboard-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 270px 1fr;
    }
    .sidebar {
      background: var(--blue);
      color: #fff;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .side-logo {
      width: 72px;
      height: 72px;
      object-fit: contain;
      background: #0caee0;
      border-radius: 6px;
    }
    .sidebar h1 { color: #fff; font-size: 28px; }
    .user-card {
      border: 1px solid rgba(255,255,255,.24);
      border-radius: 8px;
      padding: 14px;
      display: grid;
      gap: 4px;
    }
    .user-card small { color: #bfd3e8; }
    nav { display: grid; gap: 10px; }
    nav button {
      background: rgba(255,255,255,.12);
      text-align: left;
      border: 1px solid rgba(255,255,255,.18);
    }
    .main-panel { padding: 26px; display: grid; gap: 20px; }
    .topbar, .hero-grid, .metrics, .workbench {
      display: grid;
      gap: 16px;
    }
    .topbar {
      grid-template-columns: 1fr auto;
      align-items: center;
    }
    .status-pill {
      border-radius: 999px;
      padding: 9px 14px;
      background: #e8f5e9;
      color: var(--ok);
      font-weight: 800;
    }
    .hero-grid { grid-template-columns: 1.25fr .85fr; }
    article {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 10px 24px rgba(20, 32, 51, .06);
    }
    .control-list { display: grid; gap: 10px; margin-top: 18px; }
    .control-list div {
      display: grid;
      grid-template-columns: 88px 1fr auto;
      gap: 10px;
      align-items: center;
      border-top: 1px solid var(--line);
      padding-top: 10px;
    }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .slash-row, .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 14px 0;
    }
    .command-card input { width: 100%; }
    .metrics {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .metrics article {
      display: grid;
      gap: 8px;
      min-height: 96px;
    }
    .metrics span { color: var(--muted); font-weight: 700; }
    .metrics strong { color: var(--blue); font-size: 28px; }
    .workbench { grid-template-columns: 1fr 1fr; }
    pre {
      min-height: 190px;
      white-space: pre-wrap;
      margin: 0;
      color: #dce8f5;
      background: #101b2b;
      border-radius: 6px;
      padding: 14px;
      line-height: 1.45;
    }
    @media (max-width: 980px) {
      .dashboard-shell, .hero-grid, .workbench { grid-template-columns: 1fr; }
      .sidebar { position: static; }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 560px) {
      .metrics { grid-template-columns: 1fr; }
      .topbar { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
${content}
</body>
</html>`
}
