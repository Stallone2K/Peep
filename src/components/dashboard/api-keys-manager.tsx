"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RevealKeyDialog } from "@/components/dashboard/reveal-key-dialog";
import type { ApiKeyListItem, CreatedApiKey } from "@/types/api-key";
import { cn } from "@/lib/utils";

export function ApiKeysManager({
  initialKeys,
}: {
  initialKeys: ApiKeyListItem[];
}) {
  const [keys, setKeys] = useState<ApiKeyListItem[]>(initialKeys);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const router = useRouter();

  function upsertKey(k: ApiKeyListItem) {
    setKeys((prev) => [k, ...prev]);
  }

  function markRevoked(id: string) {
    setKeys((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k,
      ),
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Use These Keys To Authenticate Requests To The Peep API. Keep Them
            Secret — Treat Them Like Passwords.
          </p>
        </div>
        <CreateKeyDialog
          onCreated={(created) => {
            upsertKey(stripPlaintext(created));
            setPlaintext(created.plaintext);
            router.refresh();
          }}
        />
      </div>

      <KeysTable
        keys={keys}
        onRevoked={(id) => {
          markRevoked(id);
          router.refresh();
        }}
      />

      <RevealKeyDialog
        plaintext={plaintext}
        onClose={() => setPlaintext(null)}
      />
    </>
  );
}

function stripPlaintext(k: CreatedApiKey): ApiKeyListItem {
  const { plaintext: _plain, ...rest } = k;
  void _plain;
  return rest;
}

// ──────────────────────────────────────────────────────────────
// Create dialog
// ──────────────────────────────────────────────────────────────

function CreateKeyDialog({
  onCreated,
}: {
  onCreated: (k: CreatedApiKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const res = await fetch("/api/dashboard/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json?.error?.message ?? "Failed To Create Key");
        return;
      }
      onCreated(json.data);
      setOpen(false);
      setName("");
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) setOpen(v);
      }}
    >
      <DialogTrigger
        render={
          <Button className="gap-1.5">
            <Plus className="size-4" /> New Key
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create An API Key</DialogTitle>
          <DialogDescription>
            Give Your Key A Name So You Can Find It Later — For Example
            &quot;Local Dev&quot; Or &quot;CI Pipeline&quot;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="api-key-name">Name</Label>
            <Input
              id="api-key-name"
              placeholder="Local Dev"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create Key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────
// Keys table
// ──────────────────────────────────────────────────────────────

function KeysTable({
  keys,
  onRevoked,
}: {
  keys: ApiKeyListItem[];
  onRevoked: (id: string) => void;
}) {
  if (keys.length === 0) {
    return (
      <div className="border-border/60 bg-card/20 flex flex-col items-center gap-2 rounded-lg border px-6 py-16 text-center">
        <p className="text-sm font-medium">No Keys Yet</p>
        <p className="text-muted-foreground max-w-md text-sm">
          Create Your First API Key To Start Making Requests To The Peep API.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border/60 bg-card/20 overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="border-border/60 text-muted-foreground border-b">
          <tr>
            <Th>Name</Th>
            <Th>Prefix</Th>
            <Th>Last Used</Th>
            <Th>Created</Th>
            <Th className="text-right">Action</Th>
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {keys.map((k) => (
            <KeysRow key={k.id} row={k} onRevoked={onRevoked} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-left font-mono text-[11px] font-medium uppercase tracking-wider",
        className,
      )}
    >
      {children}
    </th>
  );
}

function KeysRow({
  row,
  onRevoked,
}: {
  row: ApiKeyListItem;
  onRevoked: (id: string) => void;
}) {
  const revoked = !!row.revokedAt;

  return (
    <tr className={cn(revoked && "opacity-50")}>
      <td className="px-4 py-3 font-medium">{row.name}</td>
      <td className="px-4 py-3 font-mono text-xs text-orange-300">
        {row.prefix}
      </td>
      <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
        {row.lastUsedAt ? formatRelative(row.lastUsedAt) : "Never"}
      </td>
      <td className="text-muted-foreground px-4 py-3 font-mono text-xs">
        {formatDate(row.createdAt)}
      </td>
      <td className="px-4 py-3 text-right">
        {revoked ? (
          <span className="text-muted-foreground font-mono text-[11px] uppercase tracking-wider">
            Revoked
          </span>
        ) : (
          <RevokeButton id={row.id} name={row.name} onRevoked={onRevoked} />
        )}
      </td>
    </tr>
  );
}

function RevokeButton({
  id,
  name,
  onRevoked,
}: {
  id: string;
  name: string;
  onRevoked: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmRevoke() {
    startTransition(async () => {
      const res = await fetch(`/api/dashboard/api-keys/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json?.error?.message ?? "Failed To Revoke Key");
        return;
      }
      onRevoked(id);
      setOpen(false);
      toast.success(`Revoked "${name}"`);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) setOpen(v);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
          >
            <Trash2 className="size-3.5" /> Revoke
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke {name}?</DialogTitle>
          <DialogDescription>
            Any Service Using This Key Will Start Receiving 401 Responses
            Immediately. You Can&apos;t Undo This.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirmRevoke}
            disabled={pending}
          >
            {pending ? "Revoking…" : "Revoke Key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "Just Now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m Ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h Ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d Ago`;
  return formatDate(iso);
}
