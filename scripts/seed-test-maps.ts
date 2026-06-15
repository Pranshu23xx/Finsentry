import { getDb, insertDocument, insertChunk, insertMap, getDocuments, getSeededDocument } from "../src/db"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = import.meta.dir

const MOCK_MAPS = [
  {
    requirement_id: "REQ-001",
    title: "Customer Authentication Event Logging",
    description: "All customer authentication events must be logged with identifier, channel, timestamp, outcome, and risk signals.",
    source_quote: "All customer authentication events must be logged. Logs must include the customer identifier, channel, timestamp, outcome, and risk signals.",
    measurable_criteria: [
      "Authentication events are logged with customer identifier",
      "Logs include channel information",
      "Logs include timestamp",
      "Logs include outcome",
      "Logs include risk signals",
    ],
    severity: "high" as const,
    verification_hints: [
      "Look for auth event logging functions",
      "Check log structure for required fields",
      "Verify retention period is configurable",
    ],
  },
  {
    requirement_id: "REQ-002",
    title: "Failed Login Monitoring",
    description: "Applications must detect repeated failed login attempts. After 5 failed attempts within 15 minutes, trigger a risk event, record audit entry, and apply lockout.",
    source_quote: "After five failed attempts within fifteen minutes, the system must trigger a risk event, record an audit entry, and apply an appropriate lockout or step-up authentication policy.",
    measurable_criteria: [
      "Failed login attempts are counted",
      "Threshold of 5 failures within 15 minutes is enforced",
      "Risk event is triggered on threshold exceeded",
      "Audit entry is recorded",
      "Lockout or step-up auth is applied",
    ],
    severity: "critical" as const,
    verification_hints: [
      "Find failed attempt counter logic",
      "Check for lockout mechanism",
      "Look for risk event triggers",
      "Find step-up authentication implementation",
    ],
  },
  {
    requirement_id: "REQ-003",
    title: "Payment Transaction Audit Trail",
    description: "Every payment transaction must have a tamper-evident audit trail with transaction id, customer id, amount, beneficiary, approval state, actor, timestamp, and decision reason.",
    source_quote: "Every payment transaction must have a tamper-evident audit trail including transaction id, customer id, amount, beneficiary, approval state, actor, timestamp, and system decision reason.",
    measurable_criteria: [
      "All payment transactions are audited",
      "Audit record includes transaction id",
      "Audit record includes customer id",
      "Audit record includes amount and beneficiary",
      "Audit trail is tamper-evident",
    ],
    severity: "critical" as const,
    verification_hints: [
      "Find payment processing code",
      "Check audit logging in payment flow",
      "Look for tamper-evident mechanisms",
    ],
  },
  {
    requirement_id: "REQ-004",
    title: "Sensitive Data Protection",
    description: "Customer personal information must not be written to plaintext logs. Sensitive values must be masked, tokenized, or encrypted before persistence.",
    source_quote: "Customer personal information and account numbers must not be written to plaintext logs. Sensitive values must be masked, tokenized, or encrypted.",
    measurable_criteria: [
      "No plaintext sensitive data in logs",
      "Account numbers are masked or encrypted in logs",
      "Sensitive data handling functions exist",
    ],
    severity: "critical" as const,
    verification_hints: [
      "Check log sanitization functions",
      "Look for masking/tokenization/encryption utilities",
      "Verify no plaintext sensitive data paths",
    ],
  },
  {
    requirement_id: "REQ-005",
    title: "Compliance Evidence Exposure",
    description: "Systems must expose evidence that logging, retention, masking, lockout, and audit workflows are configured and active.",
    source_quote: "Systems implementing these controls must expose evidence that logging, retention, masking, lockout, and audit workflows are configured and active.",
    measurable_criteria: [
      "Configuration files exist for compliance controls",
      "Tests verify compliance controls are active",
      "Evidence artifacts are produced",
    ],
    severity: "medium" as const,
    verification_hints: [
      "Find configuration files for logging/security",
      "Check for compliance-related tests",
      "Look for evidence generation code",
    ],
  },
]

const txtPath = join(root, "..", "assets", "guidelines", "demo-guideline.txt")
const txtContent = readFileSync(txtPath, "utf-8")

// Seed document
let doc = getSeededDocument()
if (!doc) {
  const docId = insertDocument(txtPath, "demo-guideline.txt", 1)
  const chunks = txtContent.split("\n\n")
  chunks.forEach((chunk, i) => insertChunk(docId, i, chunk))
  doc = getSeededDocument()!
}

// Seed maps
const existingMaps = getDb()
  .query<{ count: number }, []>("SELECT COUNT(*) as count FROM maps")
  .get()!
if (existingMaps.count === 0) {
  for (const map of MOCK_MAPS) {
    insertMap(
      doc!.id,
      map.requirement_id,
      map.title,
      map.description,
      map.source_quote,
      map.measurable_criteria,
      map.severity,
      map.verification_hints,
      0
    )
  }
  console.log(`Seeded ${MOCK_MAPS.length} mock MAPs`)
} else {
  console.log(`${existingMaps.count} MAPs already exist, skipping`)
}
