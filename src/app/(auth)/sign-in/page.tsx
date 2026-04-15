import { SignInForm } from "./sign-in-form";

export const metadata = {
  title: "Sign in — Peep",
};

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <SignInForm />
    </main>
  );
}
