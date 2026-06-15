import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dbPath, finsentryDir, logToFile } from "./utils"
import type {
  Document,
  Chunk,
  MAP,
  Scan,
  ScanResult,
  Validation,
  MetaEntry,
  ScanSummary,
} from "./types"

let _db: Database | null = null

export function getDb(): Database {
  if (_db) return _db
  const dir = finsentryDir()
  mkdirSync(dir, { recursive: true })
  const path = dbPath()
  _db = new Database(path, { create: true })
  _db.run("PRAGMA journal_mode = WAL")
  _db.run("PRAGMA foreign_keys = ON")
  migrate(_db)
  logToFile("info", `Database opened at ${path}`)
  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

function migrate(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      is_seeded INTEGER NOT NULL DEFAULT 0
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      requirement_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_quote TEXT NOT NULL,
      measurable_criteria TEXT NOT NULL,
      severity TEXT NOT NULL,
      verification_hints TEXT NOT NULL,
      chunk_index INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_path TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed'
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS scan_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      filepath TEXT NOT NULL,
      evidence TEXT,
      match_type TEXT NOT NULL,
      FOREIGN KEY (scan_id) REFERENCES scans(id),
      FOREIGN KEY (map_id) REFERENCES maps(id)
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS validations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      details TEXT,
      validated_at TEXT NOT NULL,
      FOREIGN KEY (scan_id) REFERENCES scans(id),
      FOREIGN KEY (map_id) REFERENCES maps(id)
    )
  `)
}

export function getMeta(key: string): string | null {
  const row = getDb().query<MetaEntry, string>(
    "SELECT key, value FROM meta WHERE key = ?"
  ).get(key)
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  getDb()
    .query("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
    .run(key, value)
}

export function insertDocument(
  filepath: string,
  filename: string,
  isSeeded: number
): number {
  const result = getDb()
    .query(
      "INSERT INTO documents (filepath, filename, ingested_at, is_seeded) VALUES (?, ?, ?, ?)"
    )
    .run(filepath, filename, new Date().toISOString(), isSeeded)
  return Number(result.lastInsertRowid)
}

export function getDocuments(): Document[] {
  return getDb().query<Document, []>("SELECT * FROM documents ORDER BY id").all()
}

export function getSeededDocument(): Document | null {
  return (
    getDb()
      .query<Document, []>(
        "SELECT * FROM documents WHERE is_seeded = 1 ORDER BY id DESC LIMIT 1"
      )
      .get() ?? null
  )
}

export function insertChunk(
  documentId: number,
  chunkIndex: number,
  content: string
): void {
  getDb()
    .query(
      "INSERT INTO chunks (document_id, chunk_index, content) VALUES (?, ?, ?)"
    )
    .run(documentId, chunkIndex, content)
}

export function insertMap(
  documentId: number,
  requirementId: string,
  title: string,
  description: string,
  sourceQuote: string,
  measurableCriteria: string[],
  severity: string,
  verificationHints: string[],
  chunkIndex: number
): number {
  const result = getDb()
    .query(
      `INSERT INTO maps (document_id, requirement_id, title, description, source_quote, measurable_criteria, severity, verification_hints, chunk_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      documentId,
      requirementId,
      title,
      description,
      sourceQuote,
      JSON.stringify(measurableCriteria),
      severity,
      JSON.stringify(verificationHints),
      chunkIndex,
      new Date().toISOString()
    )
  return Number(result.lastInsertRowid)
}

export function getMaps(): MAP[] {
  const rows = getDb()
    .query<any, []>("SELECT * FROM maps ORDER BY requirement_id")
    .all()
  return rows.map(deserializeMap)
}

export function getMapById(id: number): MAP | null {
  const row = getDb()
    .query<any, number>("SELECT * FROM maps WHERE id = ?")
    .get(id)
  return row ? deserializeMap(row) : null
}

function deserializeMap(row: any): MAP {
  return {
    ...row,
    measurable_criteria: JSON.parse(row.measurable_criteria),
    verification_hints: JSON.parse(row.verification_hints),
  }
}

export function insertScan(
  repoPath: string,
  summary: ScanSummary
): number {
  const result = getDb()
    .query(
      "INSERT INTO scans (repo_path, scanned_at, summary, status) VALUES (?, ?, ?, ?)"
    )
    .run(repoPath, new Date().toISOString(), JSON.stringify(summary), "completed")
  return Number(result.lastInsertRowid)
}

export function getLatestScan(): Scan | null {
  const row = getDb()
    .query<any, []>("SELECT * FROM scans ORDER BY id DESC LIMIT 1")
    .get()
  return row ? { ...row, summary: JSON.parse(row.summary) } : null
}

export function insertScanResult(
  scanId: number,
  mapId: number,
  filepath: string,
  evidence: string | null,
  matchType: string
): void {
  getDb()
    .query(
      "INSERT INTO scan_results (scan_id, map_id, filepath, evidence, match_type) VALUES (?, ?, ?, ?, ?)"
    )
    .run(scanId, mapId, filepath, evidence, matchType)
}

export function getScanResults(scanId: number): ScanResult[] {
  return getDb()
    .query<ScanResult, number>(
      "SELECT * FROM scan_results WHERE scan_id = ?"
    )
    .all(scanId)
}

export function insertValidation(
  scanId: number,
  mapId: number,
  status: string,
  details: string | null
): void {
  getDb()
    .query(
      "INSERT INTO validations (scan_id, map_id, status, details, validated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(scanId, mapId, status, details, new Date().toISOString())
}

export function getValidations(scanId: number): Validation[] {
  return getDb()
    .query<Validation, number>(
      "SELECT * FROM validations WHERE scan_id = ?"
    )
    .all(scanId)
}
