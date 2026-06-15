import { $ } from "bun"
import { logToFile, sleep } from "./utils"
import type { OllamaProgress, MAPExtraction } from "./types"

const OLLAMA_HOST = "http://localhost:11434"
const MODEL = "llama3.2:3b"
const POLL_INTERVAL = 2000
const MAX_POLL_ATTEMPTS = 30

export { MODEL }

export function getModel(): string {
  return process.env.FINSENTRY_MODEL ?? MODEL
}

export async function isOllamaInstalled(): Promise<boolean> {
  try {
    const result = await $`ollama --version`.quiet()
    return result.exitCode === 0
  } catch {
    return false
  }
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/version`)
    return res.ok
  } catch {
    return false
  }
}

export async function waitForOllama(): Promise<boolean> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (await isOllamaRunning()) return true
    logToFile("info", `Waiting for Ollama to start (attempt ${i + 1}/${MAX_POLL_ATTEMPTS})`)
    await sleep(POLL_INTERVAL)
  }
  return false
}

export async function installOllama(onProgress?: (msg: string) => void): Promise<boolean> {
  const platform = process.platform
  onProgress?.(`Detected platform: ${platform}. Installing Ollama...`)
  logToFile("info", `Starting Ollama installation on ${platform}`)

  try {
    if (platform === "win32") {
      onProgress?.("Downloading Ollama Windows installer...")
      logToFile("info", "Downloading Ollama Windows installer from https://ollama.com/installer/ollama.exe")
      const res = await fetch("https://ollama.com/installer/ollama.exe")
      if (!res.ok) throw new Error(`HTTP ${res.status} downloading installer`)
      const buffer = await res.arrayBuffer()
      const installerPath = joinPath("ollama_installer.exe")
      await Bun.write(installerPath, buffer)
      onProgress?.("Running Ollama installer (this may open a UAC prompt)...")
      logToFile("info", "Running Ollama installer")
      const result = await $`${installerPath} /S`.nothrow()
      return result.exitCode === 0
    } else if (platform === "darwin" || platform === "linux") {
      onProgress?.("Downloading and running Ollama install script...")
      logToFile("info", "Running official Ollama install.sh")
      const result =
        await $`curl -fsSL https://ollama.com/install.sh | sh`.nothrow()
      return result.exitCode === 0
    } else {
      logToFile("error", `Unsupported platform: ${platform}`)
      return false
    }
  } catch (err) {
    logToFile("error", `Ollama install failed: ${err}`)
    return false
  }
}

function joinPath(...parts: string[]): string {
  return parts.join(process.platform === "win32" ? "\\" : "/")
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`)
    if (!res.ok) return []
    const data = (await res.json()) as { models: { name: string }[] }
    return (data.models ?? []).map((m) => m.name)
  } catch {
    return []
  }
}

export async function isModelPulled(model: string): Promise<boolean> {
  const models = await listModels()
  return models.some((m) => m.startsWith(model))
}

export async function* pullModel(
  model: string,
  onProgress?: (progress: OllamaProgress) => void
): AsyncGenerator<OllamaProgress> {
  logToFile("info", `Pulling model ${model}`)
  const res = await fetch(`${OLLAMA_HOST}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: model, stream: true }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Failed to pull model ${model}: ${errText}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const progress: OllamaProgress = JSON.parse(line)
        onProgress?.(progress)
        yield progress
      } catch { }
    }
  }
}

export async function chat(
  model: string,
  messages: { role: string; content: string }[],
  format?: Record<string, unknown>
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: false,
  }

  if (format) {
    body.format = format
  }

  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Ollama chat failed: ${errText}`)
  }

  const data = (await res.json()) as { message: { content: string } }
  return data.message.content
}

export async function extractMapsWithOllama(
  chunk: string,
  chunkIndex: number
): Promise<MAPExtraction[]> {
  const model = getModel()

  const systemPrompt = `You are a compliance analyst. Extract Measurable Action Points (MAPs) from the given regulatory guideline text.
For each MAP, identify:
- requirement_id: A unique identifier like "REQ-001"
- title: A short title
- description: What must be implemented
- source_quote: The exact text from the guideline that supports this requirement
- measurable_criteria: Specific, testable criteria (array of strings)
- severity: One of "critical", "high", "medium", "low"
- verification_hints: Ways to verify compliance (array of strings)

Respond with a JSON array of objects. Do NOT include any text outside the JSON.`

  const schema = {
    type: "array",
    items: {
      type: "object",
      properties: {
        requirement_id: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        source_quote: { type: "string" },
        measurable_criteria: {
          type: "array",
          items: { type: "string" },
        },
        severity: {
          type: "string",
          enum: ["critical", "high", "medium", "low"],
        },
        verification_hints: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "requirement_id",
        "title",
        "description",
        "source_quote",
        "measurable_criteria",
        "severity",
        "verification_hints",
      ],
    },
  }

  const response = await chat(
    model,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Extract MAPs from this guideline text (chunk ${chunkIndex}):\n\n${chunk}` },
    ],
    schema
  )

  // Try to parse the JSON response
  const cleaned = response.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim()
  try {
    return JSON.parse(cleaned) as MAPExtraction[]
  } catch {
    logToFile("error", `Failed to parse Ollama response as JSON: ${response.slice(0, 500)}`)
    return []
  }
}
