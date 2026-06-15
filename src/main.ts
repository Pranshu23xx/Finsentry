#!/usr/bin/env bun
import { existsSync } from "node:fs"
import { join } from "node:path"
import { parseCliArgs } from "./utils"
import { getDb, getMaps, getLatestScan, closeDb, getMeta } from "./db"
import { runSetup } from "./setup"
import { ingestDocument } from "./ingest"
import { scanRepository } from "./scanner"
import { validateAll } from "./validator"
import { startMcpServer } from "./mcp"
import { launchTui } from "./tui"
import { isOllamaInstalled, isOllamaRunning, listModels } from "./ollama"
import type { CliCommand } from "./types"

function parseCommand(): CliCommand {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    return { kind: "tui" }
  }

  const cmd = args[0]
  switch (cmd) {
    case "setup":
      return { kind: "setup" }
    case "ingest":
      if (!args[1]) {
        console.error("Usage: bun run finsentry ingest <pdf-path>")
        process.exit(1)
      }
      return { kind: "ingest", pdf: args[1] }
    case "scan":
      if (!args[1]) {
        console.error("Usage: bun run finsentry scan <repo-path>")
        process.exit(1)
      }
      return { kind: "scan", repo: args[1] }
    case "validate":
      return { kind: "validate" }
    case "mcp":
      return { kind: "mcp" }
    case "status":
      return { kind: "status" }
    default:
      console.error(`Unknown command: ${cmd}`)
      console.error("Usage: bun run finsentry [setup|ingest|scan|validate|mcp|status]")
      process.exit(1)
  }
}

async function main(): Promise<void> {
  const command = parseCommand()

  switch (command.kind) {
    case "tui":
      await launchTui()
      break

    case "setup":
      console.log("FinSentry Setup\n")
      try {
        const state = await runSetup((msg) => {
          console.log(`  ${msg}`)
        })
        console.log("\nSetup complete!")
        console.log(`  DB:        ${state.db_initialized ? "✓" : "○"}`)
        console.log(`  Ollama:    ${state.ollama_installed ? "✓" : "○"}`)
        console.log(`  Running:   ${state.ollama_running ? "✓" : "○"}`)
        console.log(`  Model:     ${state.model_pulled ? "✓" : "○"}`)
        console.log(`  Guideline: ${state.seeded ? "✓" : "○"}`)
        console.log(`  MAPs:      ${state.maps_extracted ? "✓" : "○"}`)
        console.log(`  Completed: ${state.completed ? "✓" : "○"}`)
      } catch (err) {
        console.error(`\nSetup failed: ${err}`)
        process.exit(1)
      }
      break

    case "ingest": {
      const filepath = command.pdf
      if (!existsSync(filepath)) {
        console.error(`File not found: ${filepath}`)
        process.exit(1)
      }
      console.log(`Ingesting: ${filepath}`)
      try {
        const result = await ingestDocument(filepath)
        console.log(`Done: document id=${result.documentId}, ${result.mapCount} MAPs extracted`)
      } catch (err) {
        console.error(`Ingestion failed: ${err}`)
        process.exit(1)
      }
      break
    }

    case "scan": {
      const repoPath = command.repo
      if (!existsSync(repoPath)) {
        console.error(`Repository path not found: ${repoPath}`)
        process.exit(1)
      }
      console.log(`Scanning repository: ${repoPath}`)
      try {
        const result = await scanRepository(repoPath)
        console.log(`\nScan complete:`)
        console.log(`  Total files:    ${result.summary.total_files}`)
        console.log(`  Impacted files: ${result.summary.impacted_files}`)
        console.log(`  MAPs checked:   ${result.summary.maps_checked}`)
        console.log(`  Scan ID:        ${result.scanId}`)
        if (result.results.length > 0) {
          console.log(`\nMatches:`)
          for (const r of result.results.slice(0, 20)) {
            console.log(`  [MAP #${r.map_id}] ${r.filepath}`)
            if (r.evidence) console.log(`    → ${r.evidence.slice(0, 120)}`)
          }
          if (result.results.length > 20) {
            console.log(`  ... and ${result.results.length - 20} more matches`)
          }
        }
      } catch (err) {
        console.error(`Scan failed: ${err}`)
        process.exit(1)
      }
      break
    }

    case "validate": {
      try {
        const result = validateAll()
        console.log(`Validation results (scan #${result.scanId}):`)
        console.log(`  ✓ Satisfied:   ${result.summary.satisfied}`)
        console.log(`  ✗ Missing:     ${result.summary.missing}`)
        console.log(`  ? Needs Review: ${result.summary.needs_review}`)
        for (const v of result.validations) {
          const icon = v.status === "satisfied" ? "✓" : v.status === "missing" ? "✗" : "?"
          console.log(`  ${icon} MAP #${v.map_id}: ${v.status}${v.details ? ` - ${v.details}` : ""}`)
        }
      } catch (err) {
        console.error(`Validation failed: ${err}`)
        process.exit(1)
      }
      break
    }

    case "mcp":
      try {
        await startMcpServer()
      } catch (err) {
        console.error(`MCP server failed: ${err}`)
        process.exit(1)
      }
      break

    case "status": {
      const setupComplete = getMeta("setup_completed")
      const maps = getMaps()
      const scan = getLatestScan()
      const ollamaInstalled = await isOllamaInstalled()
      const ollamaRunning = await isOllamaRunning()
      const models = await listModels()

      console.log("FinSentry Status\n")
      console.log(`Setup completed:  ${setupComplete === "true" ? "Yes" : "No"}`)
      console.log(`Ollama installed:  ${ollamaInstalled ? "Yes" : "No"}`)
      console.log(`Ollama running:    ${ollamaRunning ? "Yes" : "No"}`)
      console.log(`Models available:  ${models.length > 0 ? models.join(", ") : "None"}`)
      console.log(`MAPs extracted:    ${maps.length}`)
      if (maps.length > 0) {
        for (const map of maps) {
          console.log(`  ${map.requirement_id}: ${map.title} [${map.severity}]`)
        }
      }
      if (scan) {
        console.log(`\nLatest scan:`)
        console.log(`  Repo:        ${scan.repo_path}`)
        console.log(`  Impacted:    ${scan.summary.impacted_files} files`)
        console.log(`  Checked:     ${scan.summary.maps_checked} MAPs`)
        console.log(`  When:        ${scan.scanned_at}`)
      }
      break
    }
  }

  closeDb()
}

main().catch((err) => {
  console.error(`Fatal: ${err}`)
  process.exit(1)
})
