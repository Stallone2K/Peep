import { PlaygroundTabs } from "@/components/dashboard/playground-tabs";

export const metadata = { title: "Map — Playground" };

export default function MapPlaygroundPage() {
  return (
    <div className="flex w-full flex-col">
      <PlaygroundTabs />
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="border-border/60 bg-card/20 rounded-lg border px-6 py-16 text-center">
          <h1 className="text-lg font-medium">Map Playground Coming Soon</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            The Underlying Endpoint Already Works —{" "}
            <span className="font-mono">POST /api/v1/map</span>. The UI
            Ships Alongside Phase 6B.
          </p>
        </div>
      </div>
    </div>
  );
}
