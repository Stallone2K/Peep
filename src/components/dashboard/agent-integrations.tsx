"use client";

import { useState } from "react";
import { Bot, Check, Copy, FileText, Terminal } from "lucide-react";

import { WidgetCard, WidgetHeader } from "@/components/dashboard/widget-card";
import { cn } from "@/lib/utils";

const SKILLS_CLI = `npx -y @shownomore/peep-cli@latest init --all --browser`;

const MCP_CONFIG = `{
  "mcpServers": {
    "peep-mcp": {
      "command": "npx",
      "args": ["-y", "@shownomore/peep-mcp"],
      "env": {
        "PEEP_API_KEY": "$PEEP_API_KEY"
      }
    }
  }
}`;

export function AgentIntegrations() {
  return (
    <WidgetCard>
      <WidgetHeader
        title="Agent Integrations"
        subtitle="Give Your AI Agents Web Data."
        trailing={
          <div className="flex items-center gap-1">
            <Badge title="Claude" icon={Bot} />
            <Badge title="Cursor" icon={FileText} />
            <Badge title="VS Code" icon={Terminal} />
          </div>
        }
      />
      <div className="border-border/60 border-t">
        <CopyBlock
          label="Skills + CLI"
          content={SKILLS_CLI}
          prompt
        />
      </div>
      <div className="border-border/60 border-t">
        <CopyBlock label="MCP Config" content={MCP_CONFIG} />
      </div>
    </WidgetCard>
  );
}

function Badge({
  title,
  icon: Icon,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className="border-border/60 bg-card/60 text-muted-foreground inline-flex size-6 items-center justify-center rounded-md border"
    >
      <Icon className="size-3.5" />
    </span>
  );
}

function CopyBlock({
  label,
  content,
  prompt,
}: {
  label: string;
  content: string;
  prompt?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="px-6 py-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium">{label}</span>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "inline-flex items-center gap-1 text-xs transition-colors",
            copied
              ? "text-emerald-400"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {copied ? (
            <>
              <Check className="size-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="size-3" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="border-border/60 bg-background/60 max-h-56 overflow-x-auto rounded-md border px-3 py-2.5 font-mono text-[12px] leading-relaxed">
        <code>
          {prompt ? (
            <>
              <span className="text-muted-foreground">$ </span>
              {content}
            </>
          ) : (
            content
          )}
        </code>
      </pre>
    </div>
  );
}
