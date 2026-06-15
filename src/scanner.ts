import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, extname } from "node:path"
import { logToFile } from "./utils"
import { getMaps, insertScan, insertScanResult } from "./db"
import type { MAP, ScanResult, ScanSummary } from "./types"

const MAX_FILE_SIZE = 1024 * 1024
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".finsentry",
  "__pycache__", ".cache", "target", "venv", ".env",
])

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4", ".avi", ".mov",
  ".zip", ".tar", ".gz", ".7z", ".rar",
  ".exe", ".dll", ".so", ".dylib",
  ".pdf", ".doc", ".docx",
])

function walkDir(dir: string): string[] {
  const files: string[] = []
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          files.push(...walkDir(fullPath))
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (!SKIP_EXTENSIONS.has(ext)) {
          try {
            const size = statSync(fullPath).size
            if (size <= MAX_FILE_SIZE) files.push(fullPath)
          } catch { }
        }
      }
    }
  } catch (err) {
    logToFile("warn", `Error walking ${dir}: ${err}`)
  }
  return files
}

function getFileSize(filepath: string): number | null {
  try {
    return statSync(filepath).size
  } catch {
    return null
  }
}

interface KeywordPattern {
  mapId: number
  keywords: string[]
  patterns: RegExp[]
  category: string
}

function buildPatterns(maps: MAP[]): KeywordPattern[] {
  return maps.map((map) => {
    const keywords: string[] = []
    const patterns: RegExp[] = []

    // Extract keywords from title and description
    const text = `${map.title} ${map.description} ${map.verification_hints.join(" ")}`
    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3)

    // Add unique significant keywords
    const significant = [...new Set(words)].filter(
      (w) => !["with", "that", "this", "from", "must", "been", "have", "should", "will", "after", "before", "each", "every", "into", "their", "about", "would"].includes(w)
    )
    keywords.push(...significant.slice(0, 8))

    // Add function/class name patterns
    if (map.requirement_id) {
      patterns.push(new RegExp(map.requirement_id.replace(/-/g, "[-_]?"), "i"))
    }

    // Add patterns for specific requirements
    const reqPatterns = requirementPatterns(map)
    patterns.push(...reqPatterns)

    return { mapId: map.id, keywords, patterns, category: map.title }
  })
}

function requirementPatterns(map: MAP): RegExp[] {
  const patterns: RegExp[] = []
  const text = `${map.title} ${map.description}`.toLowerCase()

  if (text.includes("log") || text.includes("audit")) {
    patterns.push(/log(ger|ging|ged)?|audit/i)
  }
  if (text.includes("authent")) {
    patterns.push(/authent(icate|ication|icator)?|login|signin/i)
  }
  if (text.includes("encrypt") || text.includes("mask") || text.includes("tokeniz")) {
    patterns.push(/encrypt|decrypt|mask(ing|ed)?|token(iz|ize)?/i)
  }
  if (text.includes("lockout") || text.includes("lock") || text.includes("step.up")) {
    patterns.push(/lockout|step.?up|mfa|2fa|multi.?factor/i)
  }
  if (text.includes("retention") || text.includes("retain")) {
    patterns.push(/retention|retain|ttl|expir/i)
  }
  if (text.includes("config")) {
    patterns.push(/config|setting|option|flag/i)
  }
  if (text.includes("test") || text.includes("evidence") || text.includes("verif")) {
    patterns.push(/test|spec|verify|assert|expect|should/i)
  }

  return patterns
}

function searchFile(
  filepath: string,
  relativePath: string,
  pattern: KeywordPattern
): string | null {
  try {
    const content = readFileSync(filepath, "utf-8")
    const lowerContent = content.toLowerCase()

    // Check keywords
    const matchedKeywords = pattern.keywords.filter((kw) =>
      lowerContent.includes(kw)
    )
    if (matchedKeywords.length === 0) return null

    // Check patterns
    const matchedPatterns = pattern.patterns.filter((p) => p.test(content))
    if (matchedPatterns.length === 0 && matchedKeywords.length < 2) return null

    // Extract evidence snippet (first matching line)
    const lines = content.split("\n")
    for (const line of lines) {
      const lower = line.toLowerCase()
      const hasKeyword = pattern.keywords.some((kw) => lower.includes(kw))
      const hasPattern = pattern.patterns.some((p) => p.test(line))
      if (hasKeyword || hasPattern) {
        return line.trim().slice(0, 200)
      }
    }

    return null
  } catch {
    return null
  }
}

export async function scanRepository(repoPath: string): Promise<{
  scanId: number
  results: ScanResult[]
  summary: ScanSummary
}> {
  const maps = getMaps()
  if (maps.length === 0) {
    throw new Error("No MAPs found. Ingest a guideline first.")
  }

  logToFile("info", `Scanning repository: ${repoPath}`)
  const patterns = buildPatterns(maps)

  // Walk directory
  const allFiles = walkDir(repoPath)
  logToFile("info", `Found ${allFiles.length} files to scan`)

  // Check each file against each MAP pattern
  const results: ScanResult[] = []
  const mapHitCount = new Map<number, Set<string>>()

  for (const filepath of allFiles) {
    const relPath = relative(repoPath, filepath)

    for (const pattern of patterns) {
      const evidence = searchFile(filepath, relPath, pattern)
      if (evidence) {
        const mapId = pattern.mapId
        if (!mapHitCount.has(mapId)) mapHitCount.set(mapId, new Set())
        mapHitCount.get(mapId)!.add(relPath)

        results.push({
          id: 0,
          scan_id: 0,
          map_id: mapId,
          filepath: relPath,
          evidence,
          match_type: pattern.category,
        })
      }
    }
  }

  const impactedFiles = new Set(results.map((r) => r.filepath))

  const summary: ScanSummary = {
    total_files: allFiles.length,
    impacted_files: impactedFiles.size,
    maps_checked: maps.length,
  }

  const scanId = insertScan(repoPath, summary)

  // Store results
  for (const result of results) {
    insertScanResult(scanId, result.map_id, result.filepath, result.evidence, result.match_type)
  }

  logToFile("info", `Scan complete: ${summary.impacted_files} impacted files, ${results.length} matches`)

  return { scanId, results, summary }
}
