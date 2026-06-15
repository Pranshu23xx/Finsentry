# FinSentry — Development Plan

## Team

| Person | Role | Owns |
|--------|------|------|
| **Shreayash** | Dashboard / TUI (Lead) | `src/tui.ts`, `src/commands.ts` |
| **Debasmita** | Dashboard / TUI | `src/tui.ts`, `src/commands.ts` |
| **Archita** | Dashboard / TUI | `src/tui.ts`, `src/commands.ts` |
| **Pranshu** | MCP Server + Data | `src/mcp.ts`, `src/fetcher.ts`, `src/parser.ts`, `src/rbi-sources.ts` |

### For Dashboard team (Shreayash, Debasmita, Archita) — use **Chalk** or **OpenTUI** for cool terminal design
- Canara Bank colors: `#003366` (deep blue), `#FF9933` (saffron)
- Make it look sharp — gradients, borders, colored status badges
- Split the 6 screens among yourselves to avoid conflicts

## Shared (both read, edits need coordination)

| File | Who touches it |
|------|----------------|
| `src/types.ts` | Pranshu defines types first, Dashboard team imports |
| `src/db.ts` | Pranshu adds tables, Dashboard team reads for queries |
| `src/utils.ts` | Either can add helpers |
| `src/main.ts` | Pranshu owns (wires setup + MCP), Dashboard team adds TUI launch |

---

## Phase 0: Setup (Pranshu first, ~2 hours)

Pranshu defines the data model so the Dashboard team can import types and build UI.

### Pranshu does:
1. Update `src/types.ts` — add `Regulation` type:
   ```typescript
   export interface Regulation {
     id: string           // "DPSC-2021"
     name: string         // "Digital Payment Security Controls"
     category: string     // "authentication" | "logging" | etc.
     url: string          // RBI PDF URL
     fetchedAt: string    // ISO timestamp
     filepath: string     // .finsentry/guidelines/DPSC-2021.pdf
     pageCount: number
     textExtracted: boolean
   }
   ```
2. Update `src/db.ts` — add `regulations` table:
   ```sql
   CREATE TABLE IF NOT EXISTS regulations (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     category TEXT NOT NULL,
     url TEXT NOT NULL,
     fetched_at TEXT,
     filepath TEXT,
     page_count INTEGER DEFAULT 0,
     text_extracted INTEGER DEFAULT 0
   )
   ```
3. Remove old Ollama references from `types.ts`:
   - Delete `OllamaProgress` interface
   - Delete `MAPExtraction` interface
   - Update `SetupState` — remove ollama fields:
     ```typescript
     export interface SetupState {
       db_initialized: boolean
       regulations_fetched: boolean
       completed: boolean
     }
     ```

---

## Phase 1: Parallel Work (~12 hours each)

### Shreayash, Debasmita & Archita — Dashboard (TUI)

**Files owned (all 3 work here — split screens):**
- `src/tui.ts` — All terminal UI (6 screens)
- `src/commands.ts` — `/` command parser (NEW file)

**Screen split suggestion (avoid conflicts):**

| Screen | Owner |
|--------|-------|
| Dashboard (main stats) | Shreayash |
| Regulations (loaded RBI docs) | Debasmita |
| Requirements (compliance list) | Shreayash |
| Scan (scan history) | Debasmita |
| Validate (per-file results) | Archita |
| About (Canara Bank branding) | Archita |

**Build order:**
1. `src/commands.ts` — Parse slash commands:
   ```
   /help    → Show all commands
   /about   → FinSentry credits + Canara Bank branding
   /auth    → Filter auth requirements only
   /all     → Show all requirements
   /scan    → Run scan on current repo
   /validate → Run compliance check
   /status  → Show loaded regulations + last scan
   /fetch   → Re-download RBI guidelines
   /exit    → Quit
   ```
2. `src/tui.ts` — 6-tab layout:
   - **Dashboard** — loaded regs count, last scan, compliance score bar, quick stats
   - **Regulations** — table of all 8 RBI Master Directions (id, name, category, fetched date, page count)
   - **Requirements** — list of RBI requirements with ✓/✗/? status badges
   - **Scan** — scan history + impacted files per scan
   - **Validate** — compliance results per requirement, per file
   - **About** — Canara Bank branding, team credits, `/about` screen

**Design directives (from team):**
- Use **Chalk** (`chalk`) or **OpenTUI** (`@opentui/core`) — already in deps
- Color scheme: `#003366` background, `#FF9933` accents, `#2E7D32` green for ✓, `#C62828` red for ✗
- Canara Bank logo at top of `/about` screen
- Gradients on borders if possible

**What Shreayash reads from DB:**
```typescript
import { getMaps, getLatestScan, getValidations, getDocuments } from "./db"
// Already exists — just call these
```

**What Shreayash does NOT touch:**
- `src/mcp.ts`
- `src/fetcher.ts`
- `src/parser.ts`
- `src/rbi-sources.ts`
- `src/ollama.ts` (will be deleted by Pranshu)

---

### Pranshu — MCP + Data Pipeline

**Files owned:**
- `src/mcp.ts` — MCP server (full rewrite)
- `src/fetcher.ts` — Download RBI PDFs (NEW file)
- `src/parser.ts` — Extract text from PDFs (NEW file)
- `src/rbi-sources.ts` — Curated RBI URLs (NEW file)

**Build order:**
1. `src/rbi-sources.ts` — Export array of 8 RBI Master Direction objects:
   ```typescript
   export const RBI_SOURCES: RbiSource[] = [
     {
       id: "DPSC-2021",
       name: "Digital Payment Security Controls",
       category: "authentication",
       url: "https://rbidocs.rbi.org.in/rdocs/notification/PDFs/..."
     },
     // ...7 more
   ]
   ```
2. `src/fetcher.ts` — Download + cache:
   - `fetchAllGuidelines()` — downloads all 8 PDFs to `.finsentry/guidelines/`
   - `fetchGuideline(source)` — single download with progress
   - Cached check — skip if file exists + size matches
   - `--fetch-new` flag to force re-download
3. `src/parser.ts` — Extract text from PDF:
   - Simple regex-based extractor (works for text-based RBI PDFs)
   - Returns raw text + estimated page count
   - Store raw text in DB or as `.txt` cache file
4. `src/setup.ts` — Rewrite:
   - Remove all Ollama install/pull/seed logic
   - New flow: init DB → fetch all RBI PDFs → parse each → store in `regulations` table
5. `src/mcp.ts` — Rewrite tools:
   - `check_compliance(repo_path, category?)` — scan repo + return regulation text + file matches → OpenCode LLM does the mapping
   - `get_regulation(id)` — return full regulation text
   - `list_regulations(category?)` — list loaded regulations
   - `get_requirements(category?)` — list requirements extracted from regulation text
   - Resource: `finsentry://regulations/{id}` — regulation text
6. `src/main.ts` — Wire up:
   - CLI flags: `--fetch-new` (force re-download), `--auth-only` (filter)
   - `bun run finsentry setup` → setup flow
   - `bun run finsentry` → TUI
   - `bun run finsentry mcp` → MCP stdio server

**What Pranshu does NOT touch:**
- `src/tui.ts`
- `src/commands.ts`

---

## Phase 2: Integration (~2 hours)

### Pranshu:
- Update `src/main.ts` — wire setup + MCP + TUI launch
- Delete `src/ollama.ts`
- Delete `scripts/create-demo-pdf.ts`
- Delete `scripts/seed-test-maps.ts`
- Delete `assets/guidelines/demo-guideline.txt`
- Remove unused deps from `package.json` if any

### Shreayash:
- Final polish on TUI screens
- Add Canara Bank branding banner to header and `/about` screen
- Test all `/` commands

---

## Conflict Avoidance Rules

1. **Types first** — Pranshu defines all types before Shreayash starts UI
2. **DB schema** — Pranshu adds tables, Shreayash only reads (never writes)
3. **No shared files** — If both need to edit `main.ts`, coordinate on chat
4. **Branches** — Each works on their own branch:
   ```
   pranshu/mcp-fetcher    ← Pranshu's work
   shreayash/dashboard    ← Shreayash's work
   ```
5. **Merge** — After both are done, squash merge into `main`
6. **If stuck** — Ask each other before touching the other's files

---

## File Map

```
src/
  main.ts           ← Pranshu owns (wires everything)
  types.ts          ← Pranshu defines, Shreayash imports (read-only)
  db.ts             ← Pranshu adds tables, Shreayash reads (read-only)
  utils.ts          ← Either can add helpers
  setup.ts          ← Pranshu rewrites
  fetcher.ts        ← Pranshu (NEW)
  parser.ts         ← Pranshu (NEW)
  rbi-sources.ts    ← Pranshu (NEW)
  mcp.ts            ← Pranshu rewrites
  tui.ts            ← Shreayash rewrites
  commands.ts       ← Shreayash (NEW)
  ollama.ts         ← DELETED (no longer needed)
```

---

## Demo Flow (Target)

```
1. git clone finsentry
2. cd finsentry && bun install
3. bun run finsentry setup            # Downloads 8 RBI PDFs (~2 min with internet)
4. bun run finsentry                  # Opens terminal dashboard with stats
5. bun run finsentry mcp              # Starts MCP server for OpenCode
6. In OpenCode: "check my auth code against RBI guidelines"
   → OpenCode calls check_compliance(".")
   → MCP returns regulation text + file matches
   → OpenCode LLM reads them and says: "AUTH-001: ✓ satisfied, AUTH-002: ✗ missing..."
7. bun run finsentry                  # Terminal shows compliance score 60%
```

---

## RBI Master Directions to Load (8 total)

| ID | Name | Category |
|----|------|----------|
| DPSC-2021 | Digital Payment Security Controls | authentication |
| AUTH-2025 | Authentication Mechanisms | authentication |
| CR-2024 | Cyber Resilience (non-bank PSOs) | authentication |
| IT-GRC-2023 | IT Governance, Risk & Assurance | it-governance |
| KYC-2025 | KYC Master Direction | kyc |
| FRAUD-2024 | Fraud Risk Management | fraud |
| PAY-2025 | Payment System Operator Regulations | payments |
| PPI-2021 | Prepaid Payment Instruments | payments |

> Note: Actual RBI PDF URLs need to be found from: https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx
