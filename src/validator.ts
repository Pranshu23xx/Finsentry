import { logToFile } from "./utils"
import { getMaps, getLatestScan, getScanResults, insertValidation, getValidations } from "./db"
import type { MAP, ScanResult, Validation } from "./types"

export function validateAll(): {
  scanId: number
  validations: Validation[]
  summary: { satisfied: number; missing: number; needs_review: number }
} {
  const scan = getLatestScan()
  if (!scan) {
    throw new Error("No scan results found. Run a scan first.")
  }

  const maps = getMaps()
  const results = getScanResults(scan.id)

  // Group scan results by map_id
  const resultsByMap = new Map<number, ScanResult[]>()
  for (const result of results) {
    if (!resultsByMap.has(result.map_id)) {
      resultsByMap.set(result.map_id, [])
    }
    resultsByMap.get(result.map_id)!.push(result)
  }

  let satisfied = 0
  let missing = 0
  let needsReview = 0
  const validations: Validation[] = []

  for (const map of maps) {
    const mapResults = resultsByMap.get(map.id) ?? []

    // Determine status
    let status: "satisfied" | "missing" | "needs_review"
    let details: string | null = null

    if (mapResults.length === 0) {
      status = "missing"
      details = `No files found matching requirement "${map.requirement_id}: ${map.title}". Expected evidence in codebase.`
      missing++
    } else {
      // Check if results provide concrete evidence
      const totalCriteria = map.measurable_criteria.length
      const matchedCriteria = countMatchedCriteria(map, mapResults)

      if (matchedCriteria >= totalCriteria * 0.5) {
        status = "satisfied"
        details = `Found ${mapResults.length} file(s) with evidence matching ${matchedCriteria}/${totalCriteria} criteria.`
        satisfied++
      } else if (matchedCriteria > 0) {
        status = "needs_review"
        details = `Found ${mapResults.length} file(s) but only matched ${matchedCriteria}/${totalCriteria} criteria. Manual review needed.`
        needsReview++
      } else {
        status = "missing"
        details = `Files found but no criteria matched. Expected: ${map.measurable_criteria.join(", ")}`
        missing++
      }
    }

    insertValidation(scan.id, map.id, status, details)
    validations.push({
      id: 0,
      scan_id: scan.id,
      map_id: map.id,
      status,
      details,
      validated_at: new Date().toISOString(),
    })
  }

  logToFile(
    "info",
    `Validation complete: ${satisfied} satisfied, ${missing} missing, ${needsReview} needs_review`
  )

  return {
    scanId: scan.id,
    validations,
    summary: { satisfied, missing, needs_review: needsReview },
  }
}

function countMatchedCriteria(map: MAP, results: ScanResult[]): number {
  let matched = 0
  const criteria = map.measurable_criteria
  const evidenceText = results
    .map((r) => `${r.filepath} ${r.evidence ?? ""}`)
    .join(" ")
    .toLowerCase()

  for (const criterion of criteria) {
    const words = criterion.toLowerCase().split(/\s+/)
    const matchCount = words.filter((w) => w.length > 3 && evidenceText.includes(w)).length
    // If more than half of significant words match
    const significant = words.filter((w) => w.length > 3)
    if (significant.length > 0 && matchCount >= significant.length * 0.4) {
      matched++
    }
  }

  return matched
}
