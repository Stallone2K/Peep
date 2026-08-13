"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Bell,
  Blocks,
  Building2,
  Command,
  CreditCard,
  KeyRound,
  Loader2,
  SlidersHorizontal,
  User as UserIcon,
  Users,
  Webhook,
  Check,
  LogOut,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useSettings,
  type SettingsSection,
} from "@/components/dashboard/settings/settings-context";

type Account = {
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
    planTier: string;
    creditBalance: number;
    createdAt: string;
  } | null;
  providers: string[];
  sessions: { id: string; expires: string; current: boolean }[];
};

const NAV: { group: string; items: { id: SettingsSection; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    group: "Account",
    items: [
      { id: "account", label: "My Account", icon: UserIcon },
      { id: "preferences", label: "Preferences", icon: SlidersHorizontal },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "shortcuts", label: "Keyboard Shortcuts", icon: Command },
    ],
  },
  {
    group: "Workspace",
    items: [
      { id: "workspace", label: "General", icon: Building2 },
      { id: "people", label: "People", icon: Users },
      { id: "billing", label: "Billing & Usage", icon: CreditCard },
      { id: "api-keys", label: "API Keys", icon: KeyRound },
      { id: "webhooks", label: "Webhooks", icon: Webhook },
      { id: "integrations", label: "Integrations", icon: Blocks },
    ],
  },
];

export function SettingsModal() {
  const { open, section, setSection, close } = useSettings();
  const [data, setData] = useState<Account | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/dashboard/account")
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="grid-cols-1 gap-0 overflow-hidden p-0 sm:max-w-4xl md:h-[82vh]">
        <div className="flex h-full min-h-[560px] flex-col md:flex-row">
          {/* Left nav */}
          <aside className="border-border/60 bg-card/30 w-full shrink-0 overflow-y-auto border-b p-3 md:w-56 md:border-r md:border-b-0">
            {NAV.map((g) => (
              <div key={g.group} className="mb-4">
                <p className="text-muted-foreground/60 mb-1 px-2 text-[10px] font-medium tracking-wider uppercase">
                  {g.group}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {g.items.map((it) => {
                    const Icon = it.icon;
                    const active = section === it.id;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => setSection(it.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            active
                              ? "bg-orange-500/10 font-medium text-orange-300"
                              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          {it.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </aside>

          {/* Content */}
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {loading && !data ? (
              <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            ) : section === "account" ? (
              <AccountSection data={data} onChange={setData} />
            ) : (
              <ComingSoon
                title={NAV.flatMap((g) => g.items).find((i) => i.id === section)?.label ?? ""}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountSection({
  data,
  onChange,
}: {
  data: Account | null;
  onChange: (a: Account) => void;
}) {
  const u = data?.user;
  const [name, setName] = useState(u?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setName(u?.name ?? ""), [u?.name]);

  async function saveName() {
    if (!name.trim() || saving || name.trim() === (u?.name ?? "")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok && data) {
        onChange({ ...data, user: data.user ? { ...data.user, name: name.trim() } : null });
        toast.success("Name Updated");
      } else toast.error("Failed To Update");
    } catch {
      toast.error("Network Error");
    } finally {
      setSaving(false);
    }
  }

  async function logoutEverywhere() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard/account/sessions", { method: "DELETE" });
      const j = await res.json();
      if (res.ok) toast.success(`Logged Out ${j.revoked} Other Device(s)`);
      else toast.error("Failed");
    } catch {
      toast.error("Network Error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Delete your account and ALL data (scrapes, keys, credits)? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/dashboard/account", { method: "DELETE" });
      if (res.ok) {
        toast.success("Account Deleted");
        void signOut({ callbackUrl: "/sign-in" });
      } else toast.error("Failed To Delete");
    } catch {
      toast.error("Network Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground text-xs">Account</p>
        <h2 className="text-xl font-semibold tracking-tight">My Account</h2>
      </div>

      {/* Profile */}
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          My Profile
        </p>
        <div className="flex items-center gap-4">
          <span className="bg-muted flex size-16 items-center justify-center overflow-hidden rounded-full text-lg font-medium">
            {u?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.image} alt="" className="size-full object-cover" />
            ) : (
              (u?.name?.[0] ?? u?.email?.[0] ?? "?").toUpperCase()
            )}
          </span>
          <div className="text-muted-foreground text-xs">
            Synced from your sign-in provider.
          </div>
        </div>
        <div className="max-w-sm">
          <label className="text-muted-foreground mb-1 block text-sm">
            Preferred Name
          </label>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            <Button
              onClick={saveName}
              disabled={saving || !name.trim() || name.trim() === (u?.name ?? "")}
              size="sm"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save
            </Button>
          </div>
        </div>
      </div>

      <Divider />

      {/* Security */}
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Account Security
        </p>
        <Row label="Email" value={u?.email ?? "—"} />
        <Row
          label="Sign-in"
          value={
            data?.providers.length
              ? data.providers.map((p) => p[0].toUpperCase() + p.slice(1)).join(", ")
              : "—"
          }
        />
        <Row
          label="Plan"
          value={`${u?.planTier ?? "FREE"} · ${u?.creditBalance ?? 0} credits`}
        />
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Active Devices</p>
            <p className="text-muted-foreground text-sm">
              {data?.sessions.length ?? 0} active session
              {(data?.sessions.length ?? 0) === 1 ? "" : "s"}
              {data?.sessions.some((s) => s.current) ? " · this device active" : ""}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={logoutEverywhere} disabled={busy}>
            <LogOut className="size-4" /> Log Out Other Devices
          </Button>
        </div>
      </div>

      <Divider />

      {/* Danger */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-destructive text-sm font-medium">Delete Account</p>
          <p className="text-muted-foreground text-sm">
            Permanently delete your account and all associated data.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={deleteAccount}
          disabled={busy}
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium">{label}</span>
      <span className="text-muted-foreground text-sm">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-border/50 border-t" />;
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
        {title} is coming in the next update.
      </div>
    </div>
  );
}
