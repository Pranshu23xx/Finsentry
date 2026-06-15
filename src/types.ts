export interface MetaEntry {
  key: string
  value: string
}

export interface Document {
  id: number
  filepath: string
  filename: string
  ingested_at: string
  is_seeded: number
}

export interface Chunk {
  id: number
  document_id: number
  chunk_index: number
  content: string
}

export interface MAP {
  id: number
  document_id: number
  requirement_id: string
  title: string
  description: string
  source_quote: string
  measurable_criteria: string[]
  severity: "critical" | "high" | "medium" | "low"
  verification_hints: string[]
  chunk_index: number
  created_at: string
}

export interface Scan {
  id: number
  repo_path: string
  scanned_at: string
  summary: ScanSummary
  status: string
}

export interface ScanSummary {
  total_files: number
  impacted_files: number
  maps_checked: number
}

export interface ScanResult {
  id: number
  scan_id: number
  map_id: number
  filepath: string
  evidence: string | null
  match_type: string
}

export interface Validation {
  id: number
  scan_id: number
  map_id: number
  status: "satisfied" | "missing" | "needs_review"
  details: string | null
  validated_at: string
}

export interface MAPExtraction {
  requirement_id: string
  title: string
  description: string
  source_quote: string
  measurable_criteria: string[]
  severity: "critical" | "high" | "medium" | "low"
  verification_hints: string[]
}

export interface OllamaProgress {
  status: string
  completed?: number
  total?: number
  digest?: string
}

export interface SetupState {
  db_initialized: boolean
  ollama_installed: boolean
  ollama_running: boolean
  model_pulled: boolean
  seeded: boolean
  maps_extracted: boolean
  completed: boolean
}

export type CliCommand =
  | { kind: "tui" }
  | { kind: "setup" }
  | { kind: "ingest"; pdf: string }
  | { kind: "scan"; repo: string }
  | { kind: "validate" }
  | { kind: "mcp" }
  | { kind: "status" }
