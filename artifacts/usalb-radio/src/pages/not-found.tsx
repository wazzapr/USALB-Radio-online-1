import { Link } from "wouter";
import { ArrowLeft, Radio } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <Radio className="h-6 w-6 text-primary" />
        </div>
        <p className="eyebrow mt-7 text-primary">USALB / off frequency</p>
        <h1 className="mt-3 font-display text-5xl font-semibold tracking-tight">No signal here.</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">This frequency does not exist. Return to the player and tune in again.</p>
        <Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90" data-testid="link-not-found-home">
          <ArrowLeft className="h-4 w-4" /> Back to the player
        </Link>
      </div>
    </div>
  );
}
