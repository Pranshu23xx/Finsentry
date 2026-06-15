import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { getMaps, getMapById, getLatestScan, getScanResults, getValidations } from "./db"

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: "finsentry", version: "0.1.0" },
    { capabilities: { tools: {}, resources: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_maps",
        description: "List all Measurable Action Points (MAPs) extracted from guidelines",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_map",
        description: "Get details of a specific MAP by ID",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "MAP ID" },
          },
          required: ["id"],
        },
      },
      {
        name: "get_latest_scan",
        description: "Get the latest repository scan summary",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "find_impacted_files",
        description: "Find impacted files for a specific MAP by ID",
        inputSchema: {
          type: "object",
          properties: {
            map_id: { type: "number", description: "MAP ID" },
          },
          required: ["map_id"],
        },
      },
      {
        name: "validate_requirement",
        description: "Get validation status for a specific MAP by ID",
        inputSchema: {
          type: "object",
          properties: {
            map_id: { type: "number", description: "MAP ID" },
          },
          required: ["map_id"],
        },
      },
    ],
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    switch (name) {
      case "list_maps": {
        const maps = getMaps()
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                maps.map((m) => ({
                  id: m.id,
                  requirement_id: m.requirement_id,
                  title: m.title,
                  severity: m.severity,
                })),
                null,
                2
              ),
            },
          ],
        }
      }

      case "get_map": {
        const id = Number(args?.id)
        if (isNaN(id)) {
          return {
            isError: true,
            content: [{ type: "text", text: "Invalid MAP ID" }],
          }
        }
        const map = getMapById(id)
        if (!map) {
          return {
            isError: true,
            content: [{ type: "text", text: `MAP ${id} not found` }],
          }
        }
        return {
          content: [{ type: "text", text: JSON.stringify(map, null, 2) }],
        }
      }

      case "get_latest_scan": {
        const scan = getLatestScan()
        if (!scan) {
          return {
            content: [{ type: "text", text: "No scans found. Run a scan first." }],
          }
        }
        return {
          content: [{ type: "text", text: JSON.stringify(scan, null, 2) }],
        }
      }

      case "find_impacted_files": {
        const mapId = Number(args?.map_id)
        if (isNaN(mapId)) {
          return {
            isError: true,
            content: [{ type: "text", text: "Invalid MAP ID" }],
          }
        }
        const scan = getLatestScan()
        if (!scan) {
          return {
            isError: true,
            content: [{ type: "text", text: "No scans found. Run a scan first." }],
          }
        }
        const results = getScanResults(scan.id).filter((r) => r.map_id === mapId)
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        }
      }

      case "validate_requirement": {
        const mapId = Number(args?.map_id)
        if (isNaN(mapId)) {
          return {
            isError: true,
            content: [{ type: "text", text: "Invalid MAP ID" }],
          }
        }
        const scan = getLatestScan()
        if (!scan) {
          return {
            isError: true,
            content: [{ type: "text", text: "No scans found. Run a scan first." }],
          }
        }
        const validations = getValidations(scan.id).filter(
          (v) => v.map_id === mapId
        )
        return {
          content: [{ type: "text", text: JSON.stringify(validations, null, 2) }],
        }
      }

      default:
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        }
    }
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: "finsentry://maps/latest",
        name: "Latest MAPs",
        mimeType: "application/json",
        description: "All extracted MAPs from the latest guideline",
      },
      {
        uri: "finsentry://scan/latest",
        name: "Latest Scan",
        mimeType: "application/json",
        description: "Latest repository scan results",
      },
    ],
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params

    if (uri === "finsentry://maps/latest") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(getMaps(), null, 2),
          },
        ],
      }
    }

    if (uri === "finsentry://scan/latest") {
      const scan = getLatestScan()
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(scan ?? { error: "No scan found" }, null, 2),
          },
        ],
      }
    }

    return {
      isError: true,
      contents: [{ uri, mimeType: "text/plain", text: "Resource not found" }],
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("FinSentry MCP server running on stdio")
}
