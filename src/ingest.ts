import { readFileSync, existsSync } from "node:fs"
import { extname, basename } from "node:path"
import { logToFile } from "./utils"
import { extractMapsWithOllama } from "./ollama"
import {
  insertDocument,
  insertChunk,
  insertMap,
  getDocuments,
  getSeededDocument,
} from "./db"
import type { MAPExtraction } from "./types"

const CHUNK_SIZE = 2000
const CHUNK_OVERLAP = 200

export async function parsePdf(filepath: string): Promise<string> {
  if (!existsSync(filepath)) {
    throw new Error(`File not found: ${filepath}`)
  }

  const ext = extname(filepath).toLowerCase()

  if (ext === ".txt" || ext === ".md") {
    return readFileSync(filepath, "utf-8")
  } else if (ext === ".pdf") {
    return extractPdfTextSimple(filepath)
  } else {
    throw new Error(`Unsupported file type: ${ext}. Support PDF, TXT, and MD.`)
  }
}

function extractPdfTextSimple(filepath: string): string {
  const raw = readFileSync(filepath, "binary")
  const textParts: string[] = []

  // Extract text between parentheses in PDF Tj operators
  const tjRegex = /\(([^)]*)\)\s*Tj/g
  let match: RegExpExecArray | null
  while ((match = tjRegex.exec(raw)) !== null) {
    const text = match[1]
      .replace(/\\(.)/g, "$1") // unescape PDF escapes
      .trim()
    if (text) textParts.push(text)
  }

  // Also try TJ operator (array of strings)
  const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g
  while ((match = tjArrayRegex.exec(raw)) !== null) {
    const inner = match[1]
    const strMatch = inner.match(/\(([^)]*)\)/g)
    if (strMatch) {
      for (const s of strMatch) {
        const text = s.slice(1, -1).replace(/\\(.)/g, "$1").trim()
        if (text) textParts.push(text)
      }
    }
  }

  const text = textParts.join(" ")

  if (!text.trim()) {
    throw new Error(
      "Could not extract text from PDF. For text-based PDFs, ensure content uses standard text operators. " +
      "For scanned PDFs, use OCR tools separately."
    )
  }

  return text
}

export function chunkText(text: string): { index: number; content: string }[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const chunks: { index: number; content: string }[] = []
  let current = ""
  let index = 0

  for (const line of lines) {
    if (current.length + line.length + 1 > CHUNK_SIZE && current.length > 0) {
      chunks.push({ index: index++, content: current.trim() })
      // Keep overlap
      const words = current.split(/\s+/)
      const overlapText = words.slice(-Math.floor(CHUNK_OVERLAP / 5)).join(" ")
      current = overlapText + "\n"
    }
    current += line + "\n"
  }

  if (current.trim()) {
    chunks.push({ index, content: current.trim() })
  }

  return chunks
}

export async function ingestDocument(
  filepath: string,
  isSeeded: number = 0
): Promise<{ documentId: number; mapCount: number }> {
  const filename = basename(filepath)
  logToFile("info", `Ingesting document: ${filepath}`)

  // Check if already ingested
  const existing = getDocuments().find((d) => d.filepath === filepath)
  if (existing) {
    logToFile("info", `Document already ingested (id=${existing.id}), skipping`)
    return { documentId: existing.id, mapCount: 0 }
  }

  // Parse
  const text = await parsePdf(filepath)
  logToFile("info", `Extracted ${text.length} characters from ${filename}`)

  // Chunk
  const chunks = chunkText(text)
  logToFile("info", `Split into ${chunks.length} chunks`)

  // Store document
  const docId = insertDocument(filepath, filename, isSeeded)

  // Store chunks
  for (const chunk of chunks) {
    insertChunk(docId, chunk.index, chunk.content)
  }

  // Extract MAPs from each chunk
  let totalMaps = 0
  const skipOllama = process.env.FINSENTRY_SKIP_OLLAMA === "1"
  for (const chunk of chunks) {
    if (skipOllama) {
      logToFile("info", `Skipping MAP extraction (FINSENTRY_SKIP_OLLAMA=1)`)
      break
    }
    try {
      const maps = await extractMapsWithOllama(chunk.content, chunk.index)
      for (const map of maps) {
        insertMap(
          docId,
          map.requirement_id,
          map.title,
          map.description,
          map.source_quote,
          map.measurable_criteria,
          map.severity,
          map.verification_hints,
          chunk.index
        )
        totalMaps++
      }
      logToFile("info", `Chunk ${chunk.index}: extracted ${maps.length} MAPs`)
    } catch (err) {
      logToFile("warn", `MAP extraction failed for chunk ${chunk.index}: ${err}`)
    }
  }

  logToFile("info", `Document ${filename}: ${totalMaps} total MAPs extracted`)
  return { documentId: docId, mapCount: totalMaps }
}

export async function seedDemoGuideline(): Promise<boolean> {
  const existing = getSeededDocument()
  if (existing) {
    logToFile("info", `Demo guideline already seeded (id=${existing.id}), skipping`)
    return true
  }

  const root = import.meta.dir
  const txtPath = `${root}/../assets/guidelines/demo-guideline.txt`
  const pdfPath = `${root}/../assets/guidelines/demo-guideline.pdf`

  // Prefer TXT (more reliable), fall back to PDF
  let filepath = txtPath
  if (!existsSync(txtPath)) {
    filepath = pdfPath
    if (!existsSync(pdfPath)) {
      throw new Error("No demo guideline found at assets/guidelines/")
    }
  }

  const result = await ingestDocument(filepath, 1)
  logToFile("info", `Demo guideline seeded: ${result.mapCount} MAPs extracted`)
  return result.mapCount > 0
}
