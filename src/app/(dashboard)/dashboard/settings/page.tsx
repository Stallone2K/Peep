import { YouTubeSessionCard } from "@/components/dashboard/youtube-session-card";

export const metadata = { title: "Settings" };

// Auth enforced by the dashboard layout.
export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Connect Accounts And Manage Your Workspace.
        </p>
      </div>

      <YouTubeSessionCard />

      <p className="text-muted-foreground/70 text-xs">
        Profile, Billing, Team Members, And Webhook Secrets Are Coming Soon.
      </p>
    </div>
  );
}
