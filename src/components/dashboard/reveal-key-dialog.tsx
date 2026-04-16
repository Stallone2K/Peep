"use client";

import { useEffect, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Controlled dialog. Shown once after a successful POST to
// /api/dashboard/api-keys — the plaintext in `plaintext` is never
// retrievable again. Copy-to-clipboard makes losing it unlikely.
export function RevealKeyDialog({
  plaintext,
  onClose,
}: {
  plaintext: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const open = plaintext !== null;

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  function copy() {
    if (!plaintext) return;
    void navigator.clipboard.writeText(plaintext);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Your New API Key</DialogTitle>
          <DialogDescription>
            Copy This Key Now — It Will Never Be Shown Again. If You Lose It,
            Revoke And Create A New One.
          </DialogDescription>
        </DialogHeader>

        <div className="border-border/80 bg-background/60 flex items-center gap-2 rounded-md border px-3 py-2.5">
          <code className="flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-orange-300">
            {plaintext ?? ""}
          </code>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy key"
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded transition-colors",
              copied
                ? "text-emerald-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>

        <div className="border-border/60 bg-card/30 flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange-400" />
          <p className="text-muted-foreground leading-relaxed">
            Store It In Your Password Manager Or An Env File. Treat It Like A
            Database Password.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>I&apos;ve Saved It</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
