"use client";

import { useEffect, useState } from "react";
import { Video, Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const ENDPOINT = "/api/dashboard/settings/youtube-session";

export function YouTubeSessionCard() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [cookies, setCookies] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(ENDPOINT)
      .then((r) => r.json())
      .then((j) => {
        setConnected(!!j.connected);
        setCount(j.count ?? 0);
      })
      .catch(() => setConnected(false));
  }, []);

  async function connect() {
    if (!cookies.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookies }),
      });
      const j = await res.json();
      if (res.ok && j.success) {
        setConnected(true);
        setCount(j.count);
        setCookies("");
        toast.success(`Connected — ${j.count} Cookies Stored`);
      } else {
        toast.error(j?.error?.message ?? "Failed To Connect");
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await fetch(ENDPOINT, { method: "DELETE" });
      setConnected(false);
      setCount(0);
      toast.success("Disconnected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-border/60 bg-card/20 flex flex-col gap-4 rounded-xl border p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video className="size-5 text-red-500" />
          <span className="font-medium">YouTube Session</span>
          {connected && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
              <Check className="size-3" /> Connected ({count})
            </span>
          )}
        </div>
        {connected && (
          <Button variant="outline" size="sm" onClick={disconnect} disabled={busy}>
            <Trash2 className="size-4" /> Disconnect
          </Button>
        )}
      </div>

      <p className="text-muted-foreground text-sm">
        Paste Your YouTube Cookies To Unlock <strong>Transcripts</strong> And{" "}
        <strong>Comments</strong> (YouTube Gates These Behind A Logged-In
        Session). Use A "Get cookies.txt" Browser Extension On{" "}
        <span className="font-mono">youtube.com</span>, Or A Cookie Header
        String. Stored Encrypted; Used Only For Your YouTube Scrapes.
      </p>

      <textarea
        value={cookies}
        onChange={(e) => setCookies(e.target.value)}
        rows={3}
        placeholder="Paste cookies.txt contents, or: SID=...; HSID=...; SAPISID=...; __Secure-3PSID=..."
        className="border-border/60 bg-background/60 placeholder:text-muted-foreground/50 resize-none rounded-lg border p-3 font-mono text-xs outline-none"
      />
      <div className="flex justify-end">
        <Button onClick={connect} disabled={busy || !cookies.trim()}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving
            </>
          ) : (
            <>{connected ? "Update Session" : "Connect YouTube"}</>
          )}
        </Button>
      </div>
    </div>
  );
}
