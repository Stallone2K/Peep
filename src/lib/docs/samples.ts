import type { CodeSample } from "@/components/marketing/code-tabs";

// Single source of truth for the docs base URL + placeholder key so
// every code sample across the docs stays consistent. Swap BASE here
// and every cURL/Node/Python snippet updates.
export const DOCS_API_BASE = "https://peep.shownomore.com";
export const DOCS_PLACEHOLDER_KEY = "peep_live_xxx";

type Method = "GET" | "POST" | "DELETE";

// Pretty-print a JSON body with 2-space indent, or undefined for GETs.
function pretty(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  return JSON.stringify(body, null, 2);
}

// Indent a multi-line JSON blob so it nests cleanly inside a cURL
// heredoc / JS object literal without ragged left edges.
function indent(block: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return block
    .split("\n")
    .map((line, i) => (i === 0 ? line : pad + line))
    .join("\n");
}

// Build the four canonical code samples (cURL · Node · Python · MCP)
// for an endpoint. `mcpTool` + `mcpArgs` drive the MCP tab; omit to
// drop it (e.g. endpoints with no MCP tool).
export function apiSamples(opts: {
  method: Method;
  path: string;
  body?: Record<string, unknown>;
  mcpTool?: string;
  mcpArgs?: Record<string, unknown>;
}): CodeSample[] {
  const { method, path, body, mcpTool, mcpArgs } = opts;
  const url = `${DOCS_API_BASE}${path}`;
  const jsonBody = pretty(body);

  // ── cURL ──
  let curl = `curl -X ${method} ${url} \\\n  -H "Authorization: Bearer ${DOCS_PLACEHOLDER_KEY}"`;
  if (jsonBody) {
    curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${indent(jsonBody, 0)}'`;
  }

  // ── Node (fetch) ──
  let node = `const res = await fetch("${url}", {\n  method: "${method}",\n  headers: {\n    Authorization: "Bearer ${DOCS_PLACEHOLDER_KEY}",`;
  if (jsonBody) {
    node += `\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${indent(jsonBody, 2)}),\n});`;
  } else {
    node += `\n  },\n});`;
  }
  node += `\n\nconst data = await res.json();\nconsole.log(data);`;

  // ── Python (requests) ──
  let py = `import requests\n\nres = requests.${method.toLowerCase()}(\n    "${url}",\n    headers={"Authorization": "Bearer ${DOCS_PLACEHOLDER_KEY}"},`;
  if (jsonBody) {
    py += `\n    json=${indent(jsonBody, 4)},`;
  }
  py += `\n)\nprint(res.json())`;

  const samples: CodeSample[] = [
    { label: "cURL", language: "bash", code: curl },
    { label: "Node", language: "javascript", code: node },
    { label: "Python", language: "python", code: py },
  ];

  // ── MCP (Claude / Cursor with @peep/mcp) ──
  if (mcpTool) {
    const args = mcpArgs ?? body ?? {};
    const mcp = `// With @peep/mcp configured in Claude or Cursor,\n// ask in natural language or call the tool directly:\n\n${mcpTool}(${pretty(args) ?? "{}"})`;
    samples.push({ label: "MCP", language: "javascript", code: mcp });
  }

  return samples;
}
