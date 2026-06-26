"use client";

import { signIn } from "next-auth/react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SignInForm() {
  return (
    <div className="w-full max-w-sm">
      <div className="border-border/60 bg-card/50 rounded-2xl border p-8 shadow-2xl backdrop-blur-sm">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="inline-flex size-11 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <span className="bg-background size-3.5 rounded-full" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign In To Peep
          </h1>
          <p className="text-muted-foreground text-sm text-balance">
            One URL In — Clean Markdown And Structured JSON Out.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <ProviderButton
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            icon={<GoogleIcon />}
          >
            Continue With Google
          </ProviderButton>
          <ProviderButton
            onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
            icon={<GitHubIcon />}
          >
            Continue With GitHub
          </ProviderButton>
        </div>

        <p className="text-muted-foreground/80 mt-7 text-center text-xs text-balance">
          New Here? Signing In Creates Your Account — 500 Free Credits Included.
        </p>
      </div>
    </div>
  );
}

function ProviderButton({
  children,
  onClick,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-border/70 bg-background/60 hover:bg-muted/70 hover:border-border",
        "inline-flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-2.5",
        "text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-orange-500/50 focus-visible:outline-none",
      )}
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center">
        {icon}
      </span>
      {children}
    </button>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.2 3.44 9.6 8.21 11.16.6.11.82-.25.82-.56 0-.28-.01-1.02-.02-2-3.34.71-4.04-1.58-4.04-1.58-.55-1.37-1.33-1.74-1.33-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.22 1.84 1.22 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.57-2.67-.3-5.47-1.31-5.47-5.84 0-1.29.47-2.34 1.24-3.17-.12-.3-.54-1.52.12-3.16 0 0 1.01-.32 3.3 1.21a11.6 11.6 0 0 1 3-.4c1.02 0 2.05.13 3 .4 2.29-1.53 3.3-1.21 3.3-1.21.66 1.64.24 2.86.12 3.16.77.83 1.24 1.88 1.24 3.17 0 4.54-2.81 5.53-5.49 5.83.43.37.81 1.1.81 2.22 0 1.6-.02 2.9-.02 3.29 0 .31.22.68.83.56C20.56 21.88 24 17.48 24 12.29 24 5.78 18.63.5 12 .5z" />
    </svg>
  );
}
