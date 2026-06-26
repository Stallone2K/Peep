import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Sign In",
};

export default function SignInPage() {
  return (
    <main className="bg-background relative flex min-h-screen flex-col overflow-hidden">
      {/* Soft radial glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/10 blur-[120px]"
      />

      {/* Logo, top-left */}
      <header className="p-6">
        <Link
          href="/"
          aria-label="Peep home"
          className="inline-flex w-fit items-center rounded-md transition-opacity hover:opacity-80"
        >
          <Logo />
        </Link>
      </header>

      {/* Centered sign-in card */}
      <div className="flex flex-1 items-center justify-center px-4 pb-24">
        <SignInForm />
      </div>
    </main>
  );
}
