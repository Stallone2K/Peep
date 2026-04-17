"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      {/* Reset default Dialog padding + gap so we can control the
          section rhythm ourselves. The base DialogContent has p-4 and
          DialogFooter has a muted-bg strip that looks out of place in
          a dark dialog; both overridden here. */}
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        {/* Header */}
        <DialogHeader className="gap-3 p-6 pb-5">
          <div className="border-orange-500/20 bg-orange-500/10 flex size-10 items-center justify-center rounded-full border">
            <KeyRound className="size-4 text-orange-400" />
          </div>
          <div className="space-y-1.5">
            <DialogTitle className="text-lg">Your New API Key</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Copy This Key Now — It Will Never Be Shown Again. If You Lose
              It, Revoke And Create A New One.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body — key pill + warning */}
        <div className="flex flex-col gap-4 px-6 pb-6">
          <div className="border-border/80 bg-background/60 flex items-center gap-2 rounded-lg border p-2.5">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-1 font-mono text-[13px] text-orange-300">
              {plaintext ?? ""}
            </code>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy key"
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors",
                copied
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "hover:bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </button>
          </div>

          <div className="border-orange-500/20 bg-orange-500/5 flex items-start gap-3 rounded-lg border p-3.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-orange-400" />
            <p className="text-muted-foreground text-sm leading-relaxed">
              Store It In Your Password Manager Or An Env File. Treat It
              Like A Database Password.
            </p>
          </div>
        </div>

        {/* Footer — plain border-top, flush to dialog edges */}
        <div className="border-border/60 flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button onClick={onClose}>I&apos;ve Saved It</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
