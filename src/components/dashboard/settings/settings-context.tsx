"use client";

import { createContext, useContext, useState, useCallback } from "react";

// Section ids for the settings modal left-nav.
export type SettingsSection =
  | "account"
  | "preferences"
  | "notifications"
  | "shortcuts"
  | "workspace"
  | "people"
  | "billing"
  | "api-keys"
  | "webhooks"
  | "integrations";

type Ctx = {
  open: boolean;
  section: SettingsSection;
  openSettings: (section?: SettingsSection) => void;
  setSection: (section: SettingsSection) => void;
  close: () => void;
};

const SettingsCtx = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSectionState] = useState<SettingsSection>("account");

  const openSettings = useCallback((s: SettingsSection = "account") => {
    setSectionState(s);
    setOpen(true);
  }, []);
  const setSection = useCallback((s: SettingsSection) => setSectionState(s), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <SettingsCtx.Provider
      value={{ open, section, openSettings, setSection, close }}
    >
      {children}
    </SettingsCtx.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
