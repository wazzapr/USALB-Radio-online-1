import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminSessionQueryKey,
  getGetAdminStationQueryKey,
  getGetRadioConfigQueryKey,
  getGetRadioStatusQueryKey,
  getGetStreamUrlQueryKey,
  useAdminLogin,
  useAdminLogout,
  useGetAdminSession,
  useGetAdminStation,
  useTestAdminStream,
  useUpdateAdminStation,
} from "@workspace/api-client-react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CircleHelp,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  LogOut,
  Radio,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Signal,
  Wifi,
  WifiOff,
} from "lucide-react";
import logoSrc from "@assets/usalbradio_1775675611808.jpg";
import { cn } from "@/lib/utils";

type FormState = {
  stationName: string;
  tagline: string;
  genre: string;
  hostName: string;
  showName: string;
  sourceType: "icecast" | "mp3" | "encoder";
  sourceUrl: string;
  isLive: boolean;
};

const emptyForm: FormState = {
  stationName: "",
  tagline: "",
  genre: "",
  hostName: "",
  showName: "",
  sourceType: "icecast",
  sourceUrl: "",
  isLive: false,
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId: string;
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-2 block text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-2 focus:ring-primary/15"
        data-testid={testId}
      />
    </label>
  );
}

export default function Admin() {
  const client = useQueryClient();
  const sessionQuery = useGetAdminSession();
  const authenticated = sessionQuery.data?.authenticated === true;
  const stationQuery = useGetAdminStation({
    query: {
      enabled: authenticated,
      queryKey: getGetAdminStationQueryKey(),
    },
  });
  const login = useAdminLogin();
  const logout = useAdminLogout();
  const update = useUpdateAdminStation();
  const testStream = useTestAdminStream();
  const [accessKey, setAccessKey] = useState("");
  const [loginError, setLoginError] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (stationQuery.data && !initialized) {
      setForm({
        stationName: stationQuery.data.stationName,
        tagline: stationQuery.data.tagline,
        genre: stationQuery.data.genre,
        hostName: stationQuery.data.hostName,
        showName: stationQuery.data.showName,
        sourceType: stationQuery.data.sourceType,
        sourceUrl: stationQuery.data.sourceUrl,
        isLive: stationQuery.data.isLive,
      });
      setInitialized(true);
    }
  }, [initialized, stationQuery.data]);

  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    login.mutate(
      { data: { accessKey } },
      {
        onSuccess: () => {
          setAccessKey("");
          sessionQuery.refetch();
        },
        onError: () => setLoginError("That key is not valid. Try again."),
      },
    );
  };

  const save = () => {
    update.mutate(
      { data: form },
      {
        onSuccess: () => {
          client.invalidateQueries({ queryKey: getGetAdminStationQueryKey() });
          client.invalidateQueries({ queryKey: getGetRadioConfigQueryKey() });
          client.invalidateQueries({ queryKey: getGetRadioStatusQueryKey() });
          client.invalidateQueries({ queryKey: getGetStreamUrlQueryKey() });
        },
      },
    );
  };

  const signOut = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setInitialized(false);
        setForm(emptyForm);
        client.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
        sessionQuery.refetch();
      },
    });
  };

  if (sessionQuery.isLoading) {
    return (
      <AdminShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
        </div>
      </AdminShell>
    );
  }

  if (sessionQuery.isError) {
    return (
      <AdminShell>
        <EmptyState
          title="Could not check the station key"
          description="Refresh the page and try again."
          icon={<AlertCircle className="h-7 w-7 text-primary" />}
        />
      </AdminShell>
    );
  }

  if (!authenticated) {
    return (
      <AdminShell>
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <p className="eyebrow text-primary">Private station access</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight">
            Enter your station key
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This room is private. Use the access key you created for USALB RADIO.
          </p>
          <form onSubmit={submitLogin} className="mt-7 w-full space-y-3">
            <input
              type="text"
              name="username"
              value="station-owner"
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              autoComplete="username"
            />
            <input
              type="password"
              name="password"
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              placeholder="Station access key"
              autoComplete="current-password"
              className="w-full rounded-xl border border-input bg-card/70 px-4 py-3.5 text-center text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15"
              data-testid="input-admin-access-key"
            />
            <button
              type="submit"
              disabled={login.isPending || !accessKey}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="button-admin-login"
            >
              {login.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              {login.isPending ? "Checking key…" : "Unlock control room"}
            </button>
          </form>
          {loginError && (
            <p className="mt-4 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {loginError}
            </p>
          )}
          <p className="mt-8 text-xs text-muted-foreground">
            Keep this key private. Anyone who has it can manage the station.
          </p>
        </div>
      </AdminShell>
    );
  }

  if (stationQuery.isLoading) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="h-8 w-56 animate-pulse rounded bg-muted" />
          <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
            <div className="h-[480px] animate-pulse rounded-2xl bg-muted/60" />
            <div className="h-72 animate-pulse rounded-2xl bg-muted/60" />
          </div>
        </div>
      </AdminShell>
    );
  }

  if (stationQuery.isError || !stationQuery.data) {
    return (
      <AdminShell>
        <EmptyState
          title="Station settings are unavailable"
          description="Refresh the page and try again."
          icon={<AlertCircle className="h-7 w-7 text-primary" />}
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow text-primary">Station operations</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Control room
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Keep the signal clear. Changes apply to the public player when saved.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
              <ShieldCheck className="h-4 w-4" /> Control room unlocked
            </div>
            <button
              onClick={signOut}
              disabled={logout.isPending}
              className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
              data-testid="button-admin-logout"
            >
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.4fr_.8fr]">
          <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-lg sm:p-7">
            <div className="mb-7 flex items-center justify-between border-b border-border pb-5">
              <div>
                <p className="eyebrow text-muted-foreground">01 / Identity</p>
                <h2 className="mt-1 text-xl font-bold">Station profile</h2>
              </div>
              <Radio className="h-5 w-5 text-primary" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Station name" value={form.stationName} onChange={(value) => set("stationName", value)} placeholder="USALB RADIO" testId="input-station-name" />
              <Field label="Tagline" value={form.tagline} onChange={(value) => set("tagline", value)} placeholder="Your sound. Your story." testId="input-tagline" />
              <Field label="Genre" value={form.genre} onChange={(value) => set("genre", value)} placeholder="Albanian hits · Talk" testId="input-genre" />
              <Field label="Host name" value={form.hostName} onChange={(value) => set("hostName", value)} placeholder="USALB Studio" testId="input-host-name" />
              <div className="sm:col-span-2">
                <Field label="Current show" value={form.showName} onChange={(value) => set("showName", value)} placeholder="Live from the studio" testId="input-show-name" />
              </div>
            </div>

            <div className="mb-7 mt-10 flex items-center justify-between border-b border-border pb-5">
              <div>
                <p className="eyebrow text-muted-foreground">02 / Source</p>
                <h2 className="mt-1 text-xl font-bold">Broadcast source</h2>
              </div>
              <Server className="h-5 w-5 text-primary" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="eyebrow mb-2 block text-muted-foreground">Source type</span>
                <select value={form.sourceType} onChange={(event) => set("sourceType", event.target.value)} className="w-full rounded-xl border border-input bg-background/70 px-4 py-3 text-sm text-foreground outline-none focus:border-primary" data-testid="select-source-type">
                  <option value="icecast">Icecast</option>
                  <option value="mp3">MP3 stream</option>
                  <option value="encoder">Encoder</option>
                </select>
              </label>
              <div className="flex items-end">
                <label className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-border bg-background/50 px-4 py-3">
                  <span className="flex items-center gap-3 text-sm font-semibold">
                    <span className={cn("h-2.5 w-2.5 rounded-full", form.isLive ? "animate-pulse bg-accent" : "bg-muted-foreground")} />
                    Mark station live
                  </span>
                  <input type="checkbox" checked={form.isLive} onChange={(event) => set("isLive", event.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" data-testid="input-is-live" />
                </label>
              </div>
              <div className="sm:col-span-2">
                <Field label="Source URL" value={form.sourceUrl} onChange={(value) => set("sourceUrl", value)} placeholder="https://your-icecast-host/live.mp3" testId="input-source-url" />
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CircleHelp className="h-3.5 w-3.5" /> The upstream address used by BUTT or your station encoder.
                </p>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-end gap-3">
              <span className={cn("mr-auto flex items-center gap-2 text-xs", update.isSuccess ? "text-accent" : "text-muted-foreground")} data-testid="status-save">
                {update.isSuccess ? <><Check className="h-4 w-4" /> Saved to station</> : "Unsaved changes stay local"}
              </span>
              <button onClick={save} disabled={update.isPending || !form.stationName || !form.sourceUrl} className="flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-save-station">
                {update.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {update.isPending ? "Saving…" : "Save station"}
              </button>
            </div>
            {update.isError && <p className="mt-4 flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> Could not save changes. Please try again.</p>}
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-lg sm:p-6">
              <div className="flex items-start justify-between">
                <div><p className="eyebrow text-muted-foreground">Connection check</p><h2 className="mt-1 text-xl font-bold">Test the source</h2></div>
                <Signal className="h-5 w-5 text-accent" />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Check reachability before taking the station live.</p>
              <button onClick={() => testStream.mutate({ data: { sourceUrl: form.sourceUrl } })} disabled={testStream.isPending || !form.sourceUrl} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-bold text-primary transition hover:bg-primary/20 disabled:opacity-50" data-testid="button-test-stream">
                {testStream.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {testStream.isPending ? "Testing source…" : "Run stream test"}
              </button>
              {testStream.data && <div className={cn("mt-4 rounded-xl border p-4", testStream.data.ok ? "border-accent/30 bg-accent/10" : "border-destructive/30 bg-destructive/10")} data-testid="status-stream-test">
                <div className="flex items-center gap-2 font-bold">{testStream.data.ok ? <Wifi className="h-4 w-4 text-accent" /> : <WifiOff className="h-4 w-4 text-destructive" />}{testStream.data.ok ? "Source reachable" : "Source needs attention"}</div>
                <p className="mt-2 text-xs text-muted-foreground">{testStream.data.message}</p>
                {testStream.data.contentType && <p className="mt-2 font-mono text-[10px] text-muted-foreground">{testStream.data.contentType}</p>}
              </div>}
              {testStream.isError && <p className="mt-4 text-sm text-destructive">The stream test failed to complete.</p>}
            </section>
            <section className="rounded-2xl border border-border bg-card/70 p-5 shadow-lg sm:p-6">
              <p className="eyebrow text-muted-foreground">Public presence</p>
              <div className="mt-4 flex items-center gap-3"><img src={logoSrc} alt="" className="h-10 w-28 rounded object-cover object-left" /><div><p className="text-sm font-bold">{form.stationName || "USALB RADIO"}</p><p className="text-xs text-muted-foreground">{form.isLive ? "Broadcasting live" : "Currently in standby"}</p></div></div>
              <Link href="/" className="mt-5 flex items-center justify-between rounded-xl border border-border px-4 py-3 text-sm font-semibold transition hover:border-primary/50 hover:bg-background" data-testid="link-view-public">View public player <ExternalLink className="h-4 w-4 text-muted-foreground" /></Link>
            </section>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}

function EmptyState({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/10 p-4">{icon}</div>
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" data-testid="link-admin-logo">
            <img src={logoSrc} alt="USALB RADIO" className="h-9 w-[140px] rounded object-cover object-left" />
            <span className="hidden border-l border-border pl-3 text-xs font-bold text-muted-foreground sm:inline">Control room</span>
          </Link>
          <Link href="/" className="flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-foreground" data-testid="link-back-to-player">
            <ArrowLeft className="h-4 w-4" /> Public player
          </Link>
        </div>
      </header>
      <main className="px-5 py-10 sm:px-8 sm:py-14">{children}</main>
    </div>
  );
}