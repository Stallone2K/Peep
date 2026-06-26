import Link from "next/link";

import { Logo } from "@/components/marketing/logo";
import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Sign In",
};

export default function SignInPage() {
  return (
    <main className="bg-background flex min-h-screen flex-col">
      {/* Logo, top-left — same treatment as the marketing nav */}
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
