import { logToFile, sleep } from "./utils"
import { getMeta, setMeta, getDb, getDocuments } from "./db"
import { isOllamaInstalled, isOllamaRunning, installOllama, waitForOllama, isModelPulled, pullModel, getModel } from "./ollama"
import { seedDemoGuideline } from "./ingest"
import type { SetupState } from "./types"

export function getSetupState(): SetupState {
  return {
    db_initialized: getMeta("db_initialized") === "true",
    ollama_installed: getMeta("ollama_installed") === "true",
    ollama_running: getMeta("ollama_running") === "true",
    model_pulled: getMeta("model_pulled") === "true",
    seeded: getMeta("seeded") === "true",
    maps_extracted: getMeta("maps_extracted") === "true",
    completed: getMeta("setup_completed") === "true",
  }
}

export async function runSetup(onProgress?: (msg: string) => void): Promise<SetupState> {
  const state = getSetupState()
  onProgress?.(`Setup state: db=${state.db_initialized} ollama=${state.ollama_installed} model=${state.model_pulled} seeded=${state.seeded}`)

  // Initialize DB
  if (!state.db_initialized) {
    onProgress?.("Initializing database...")
    getDb()
    setMeta("db_initialized", "true")
    logToFile("info", "Database initialized")
  }

  const skipOllama = process.env.FINSENTRY_SKIP_OLLAMA === "1"
  if (skipOllama) {
    onProgress?.("Skipping Ollama setup (FINSENTRY_SKIP_OLLAMA=1)")
    logToFile("info", "Ollama setup skipped via env var")
    setMeta("ollama_installed", "true")
    setMeta("ollama_running", "true")
    setMeta("model_pulled", "true")
  } else {
    // Install Ollama
    if (!state.ollama_installed) {
      const installed = await isOllamaInstalled()
      if (!installed) {
        onProgress?.("Ollama not found. Installing...")
        const ok = await installOllama(onProgress)
        if (!ok) {
          logToFile("error", "Ollama installation failed")
          throw new Error("Ollama installation failed. Install manually from https://ollama.com")
        }
        onProgress?.("Ollama installed. Starting...")
        logToFile("info", "Ollama installed successfully")
        await sleep(3000)
      }
      setMeta("ollama_installed", "true")
    }

    // Wait for Ollama to be running
    if (!state.ollama_running) {
      onProgress?.("Waiting for Ollama to start...")
      const running = await waitForOllama()
      if (!running) {
        logToFile("error", "Ollama did not start")
        throw new Error("Ollama failed to start. Check logs in .finsentry/logs/setup.log")
      }
      setMeta("ollama_running", "true")
      logToFile("info", "Ollama is running")
    }

    // Pull model
    if (!state.model_pulled) {
      const model = getModel()
      onProgress?.(`Checking if ${model} is available...`)
      const pulled = await isModelPulled(model)
      if (!pulled) {
        onProgress?.(`Pulling ${model} (this may take a few minutes)...`)
        logToFile("info", `Pulling model ${model}`)
        for await (const progress of pullModel(model, (p) => {
          if (p.status === "downloading" && p.completed && p.total) {
            const pct = Math.round((p.completed / p.total) * 100)
            onProgress?.(`Downloading ${model}: ${pct}% (${(p.completed / 1e9).toFixed(1)}GB / ${(p.total / 1e9).toFixed(1)}GB)`)
          } else if (p.status === "pulling manifest") {
            onProgress?.("Pulling manifest...")
          } else if (p.status === "success") {
            onProgress?.(`${model} downloaded successfully`)
          }
        })) { /* iterate */ }
        logToFile("info", `Model ${model} pulled`)
      } else {
        onProgress?.(`${model} already available`)
      }
      setMeta("model_pulled", "true")
    }
  }

  // Seed demo guideline
  if (!state.seeded) {
    onProgress?.("Seeding demo guideline...")
    try {
      await seedDemoGuideline()
      setMeta("seeded", "true")
      logToFile("info", "Demo guideline seeded")
    } catch (seedErr) {
      logToFile("error", `Seed failed: ${seedErr instanceof Error ? `${seedErr.message}\n${seedErr.stack}` : seedErr}`)
      throw seedErr
    }
  }

  // Check MAPs extracted
  const mapsCount = getMeta("maps_extracted") === "true"
  if (!mapsCount) {
    // Check if any MAPs exist in DB
    const db = getDb()
    const count = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM maps").get()
    if (count && count.count > 0) {
      setMeta("maps_extracted", "true")
    }
  }

  setMeta("setup_completed", "true")
  logToFile("info", "Setup completed successfully")

  return getSetupState()
}
