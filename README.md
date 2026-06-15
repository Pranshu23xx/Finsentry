# FinSentry

Turning regulatory documents into verifiable engineering compliance.

FinSentry is a local-first hackathon MVP that ingests a regulatory guideline, extracts measurable action points, scans a repository for affected code, validates evidence, and exposes the compliance context through an MCP-compatible stdio server.

## Quick Start

```powershell
bun install
bun run demo:pdf
bun run finsentry
```

The first run:

- creates `.finsentry/finsentry.db`
- auto-installs Ollama if it is missing
- pulls `llama3.2:3b`
- ingests `assets/guidelines/demo-guideline.pdf`
- extracts and stores MAPs once

For local smoke tests without installing Ollama:

```powershell
$env:FINSENTRY_SKIP_OLLAMA="1"
bun run finsentry status
bun run finsentry ingest assets/guidelines/demo-guideline.pdf
bun run finsentry scan examples/sample-banking-app
bun run finsentry validate
```

## Commands

```bash
bun run finsentry                  # OpenTUI dashboard plus first-run setup
bun run finsentry setup            # Bootstrap local state, Ollama, model, demo guideline
bun run finsentry ingest <pdf>     # Ingest a text PDF or text/markdown guideline
bun run finsentry scan <repo>      # Find impacted source files
bun run finsentry validate         # Evaluate current repo scan against MAPs
bun run finsentry mcp              # Start MCP stdio server
bun run finsentry status           # Print local state
```

## MCP

Configure your MCP-compatible coding assistant to run:

```bash
bun src/main.ts mcp
```

Available tools:

- `list_maps`
- `get_map`
- `get_latest_scan`
- `find_impacted_files`
- `validate_requirement`

## Architecture

```text
OpenTUI / CLI
   |
FinSentry workflow
   |-- SQLite local state
   |-- Ollama local model
   |-- PDF/text ingestion
   |-- repository scanner
   |-- validation engine
   |
MCP stdio server
```

For the hackathon version, old guideline context is not reprocessed on every run. The guideline is extracted once, normalized into MAPs, and read from SQLite during scan, validate, and MCP operations.
