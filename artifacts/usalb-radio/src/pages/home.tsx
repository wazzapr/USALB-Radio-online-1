import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useGetRadioConfig, useGetRadioStatus } from "@workspace/api-client-react";
import { Activity, ArrowUpRight, Headphones, Info, LoaderCircle, Pause, Play, Share2, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import logoSrc from "@assets/usalbradio_1775675611808.jpg";
import { cn } from "@/lib/utils";

const fallback = { stationName: "USALB RADIO", tagline: "Zëri që të mban afër.", genre: "Albanian hits · Talk · Culture", hostName: "USALB Studio", showName: "Live from the studio", sourceType: "icecast", isLive: false };

type LiveStatusMessage = {
  type: "status";
  live: boolean;
  mimeType?: string | null;
  audioMode?: "webm" | "pcm";
  sampleRate?: number | null;
  channels?: number | null;
};

type ListenerFormat = "webm" | "pcm";

const pcmMagic = [0x50, 0x43, 0x4d, 0x31];

function listenerSocketUrl(format: ListenerFormat): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/live/ws?role=listener&format=${format}`;
}

function canPlayWebmStream(): boolean {
  if (!("MediaSource" in window)) return false;
  return ["audio/webm;codecs=opus", "audio/webm"].some((mimeType) => MediaSource.isTypeSupported(mimeType));
}

function SignalBars({ active }: { active: boolean }) {
  return <div className="flex h-6 items-end gap-1" aria-label={active ? "Audio is playing" : "Audio is paused"}>{[35, 58, 82, 48, 70].map((height, i) => <span key={i} className={cn("w-1 rounded-t-sm bg-primary transition-transform", active && "animate-[equalizer_1s_ease-in-out_infinite_alternate]")} style={{ height: `${active ? height : 18}%`, animationDelay: `${i * -120}ms` }} />)}</div>;
}

export default function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [volume, setVolume] = useState(.82);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [broadcastLive, setBroadcastLive] = useState<boolean | null>(null);
  const configQuery = useGetRadioConfig();
  const statusQuery = useGetRadioStatus();
  const config = configQuery.data ?? fallback;
  const isLive = broadcastLive ?? statusQuery.data?.isLive ?? config.isLive;
  const updated = statusQuery.data?.updatedAt || configQuery.data?.updatedAt;
  const socketRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queuedChunksRef = useRef<ArrayBuffer[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const mimeTypeRef = useRef("audio/webm;codecs=opus");
  const audioContextRef = useRef<AudioContext | null>(null);
  const pcmGainRef = useRef<GainNode | null>(null);
  const pcmSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const pcmNextTimeRef = useRef(0);
  const pcmConfigRef = useRef({ sampleRate: 48000, channels: 2 });

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    if (pcmGainRef.current) pcmGainRef.current.gain.value = muted ? 0 : volume;
  }, [muted, volume]);
  const lastUpdated = useMemo(() => updated ? new Date(updated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—", [updated]);

  const cleanupListener = () => {
    socketRef.current?.close();
    socketRef.current = null;
    sourceBufferRef.current = null;
    mediaSourceRef.current = null;
    queuedChunksRef.current = [];
    pcmSourcesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    });
    pcmSourcesRef.current.clear();
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    pcmGainRef.current = null;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  const appendQueuedChunks = () => {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer || sourceBuffer.updating || queuedChunksRef.current.length === 0) return;
    const nextChunk = queuedChunksRef.current.shift();
    if (!nextChunk) return;

    try {
      sourceBuffer.appendBuffer(nextChunk);
    } catch {
      queuedChunksRef.current.unshift(nextChunk);
      setError("The live audio format is not supported by this browser.");
    }
  };

  const setupSourceBuffer = () => {
    const mediaSource = mediaSourceRef.current;
    if (!mediaSource || mediaSource.readyState !== "open" || sourceBufferRef.current) return;

    const mimeType = MediaSource.isTypeSupported(mimeTypeRef.current)
      ? mimeTypeRef.current
      : "audio/webm";

    if (!MediaSource.isTypeSupported(mimeType)) {
      setError("This browser cannot play the live broadcast format.");
      return;
    }

    const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
    sourceBuffer.mode = "sequence";
    sourceBuffer.addEventListener("updateend", appendQueuedChunks);
    sourceBufferRef.current = sourceBuffer;
    appendQueuedChunks();
  };

  const enqueuePcmChunk = (chunk: ArrayBuffer) => {
    const context = audioContextRef.current;
    if (!context || chunk.byteLength <= pcmMagic.length) return;
    const bytes = new Uint8Array(chunk, 0, pcmMagic.length);
    if (!pcmMagic.every((value, index) => bytes[index] === value)) return;

    const { sampleRate, channels } = pcmConfigRef.current;
    const frameBytes = channels * 2;
    const frameCount = Math.floor((chunk.byteLength - pcmMagic.length) / frameBytes);
    if (!frameCount) return;

    const audioBuffer = context.createBuffer(channels, frameCount, sampleRate);
    const view = new DataView(chunk, pcmMagic.length);
    for (let frame = 0; frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) {
        const offset = (frame * channels + channel) * 2;
        audioBuffer.getChannelData(channel)[frame] = view.getInt16(offset, true) / 32768;
      }
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(pcmGainRef.current ?? context.destination);
    const now = context.currentTime;
    const startAt = Math.max(pcmNextTimeRef.current, now + 0.04);
    source.start(startAt);
    pcmNextTimeRef.current = startAt + audioBuffer.duration;
    pcmSourcesRef.current.add(source);
    source.addEventListener("ended", () => pcmSourcesRef.current.delete(source), { once: true });
  };

  const connectListener = (format: ListenerFormat) => {
    const audio = audioRef.current;
    const socket = new WebSocket(listenerSocketUrl(format));
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    if (format === "webm" && audio) {
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      objectUrlRef.current = URL.createObjectURL(mediaSource);
      audio.src = objectUrlRef.current;
      mediaSource.addEventListener("sourceopen", setupSourceBuffer);
    }

    socket.onopen = async () => {
      try {
        if (format === "pcm") {
          const AudioContextConstructor = window.AudioContext
            ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioContextConstructor) throw new Error("Audio playback is not supported in this browser.");
          const context = new AudioContextConstructor();
          await context.resume();
          audioContextRef.current = context;
          const gain = context.createGain();
          gain.gain.value = muted ? 0 : volume;
          gain.connect(context.destination);
          pcmGainRef.current = gain;
          pcmNextTimeRef.current = context.currentTime + 0.08;
        } else if (audio) {
          await audio.play();
        }
        setLoading(false);
        setPlaying(true);
      } catch {
        setLoading(false);
        setPlaying(false);
        setError("Tap the play button again to connect to the live source.");
      }
    };

    socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        try {
          const message = JSON.parse(event.data) as LiveStatusMessage;
          if (message.type === "status") {
            setBroadcastLive(message.live);
            if (format === "pcm" && message.sampleRate && message.channels) {
              pcmConfigRef.current = { sampleRate: message.sampleRate, channels: message.channels };
            }
            if (format === "webm" && message.mimeType) {
              if (!MediaSource.isTypeSupported(message.mimeType)) {
                if (socketRef.current !== socket) return;
                cleanupListener();
                setLoading(true);
                connectListener("pcm");
                return;
              }
              mimeTypeRef.current = message.mimeType;
              setupSourceBuffer();
            }
            if (!message.live) setError("The studio is waiting for the next live broadcast.");
          }
        } catch {
          setError("The live connection sent an invalid status.");
        }
        return;
      }

      const chunk = event.data instanceof ArrayBuffer ? event.data : null;
      if (!chunk) return;
      if (format === "pcm") {
        enqueuePcmChunk(chunk);
        return;
      }
      queuedChunksRef.current.push(chunk);
      setupSourceBuffer();
      appendQueuedChunks();
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      setLoading(false);
      setPlaying(false);
      setError("The live studio connection is unavailable.");
    };

    socket.onclose = () => {
      if (socketRef.current !== socket) return;
      setLoading(false);
      setPlaying(false);
      if (broadcastLive) setError("The live broadcast connection ended.");
    };
  };

  const toggle = async () => {
    const audio = audioRef.current;
    if (playing) {
      audio?.pause();
      cleanupListener();
      setPlaying(false);
      return;
    }

    setLoading(true);
    setError("");
    setBroadcastLive(null);
    cleanupListener();
    connectListener(canPlayWebmStream() ? "webm" : "pcm");
  };

  const share = async () => {
    if (navigator.share) await navigator.share({ title: config.stationName, text: config.tagline, url: window.location.href }).catch(() => undefined);
    else await navigator.clipboard?.writeText(window.location.href);
  };

  return (
    <main className="min-h-[100dvh] overflow-hidden">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-3" data-testid="link-home">
          <img src={logoSrc} alt="USALB RADIO" className="h-10 w-[156px] rounded-md object-cover object-left sm:h-12 sm:w-[188px]" data-testid="img-station-logo" />
        </Link>
        <nav className="flex items-center gap-3">
          <span className="hidden eyebrow text-muted-foreground sm:inline">Tirana · Prishtina · diaspora</span>
          <Link href="/admin" className="rounded-full border border-border bg-card/70 px-4 py-2 text-xs font-bold text-foreground transition hover:border-primary/60 hover:bg-card" data-testid="link-admin">Control room <ArrowUpRight className="ml-1 inline h-3 w-3" /></Link>
        </nav>
      </header>

      <section className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-20 lg:pb-28 lg:pt-20">
        <div className="pointer-events-none absolute -left-40 top-12 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <div className="eyebrow mb-6 flex items-center gap-3 text-accent"><span className="h-px w-8 bg-accent" /> live radio / 24—7</div>
          <h1 className="font-display max-w-3xl text-5xl font-semibold leading-[.98] tracking-[-.055em] text-foreground sm:text-7xl lg:text-[6.3rem]">Stay close to<br /><em className="text-primary not-italic">the signal.</em></h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">{config.tagline || "The Albanian sound, wherever you are."} Tune in for a steady stream of music, voices and stories from the region.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button onClick={toggle} disabled={loading} className={cn("group flex items-center gap-3 rounded-full px-6 py-3.5 text-sm font-extrabold transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60", playing ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground")} data-testid="button-toggle-player">
              {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
              {loading ? "Connecting" : playing ? "Pause broadcast" : "Listen live"}
            </button>
            <button onClick={share} className="flex items-center gap-2 rounded-full border border-border px-5 py-3.5 text-sm font-bold text-foreground transition hover:border-primary/60 hover:bg-card" data-testid="button-share-station"><Share2 className="h-4 w-4" /> Share station</button>
          </div>
          {error && <p className="mt-4 flex items-center gap-2 text-sm text-accent" data-testid="status-stream-error"><WifiOff className="h-4 w-4" />{error}</p>}
          <div className="mt-12 flex flex-wrap gap-x-8 gap-y-4 border-t border-border pt-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><Headphones className="h-4 w-4 text-primary" /> Broadcast from Albania</span>
             <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /> Source: {config.sourceType === "browser" ? "Studio console" : config.sourceType || "live"}</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-3 rounded-[2rem] border border-primary/10" />
          <div className="glass relative overflow-hidden rounded-[1.7rem] border border-border p-5 shadow-2xl sm:p-7">
            <div className="absolute right-0 top-0 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <span className="eyebrow text-muted-foreground">On air now</span>
              <span className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest", isLive ? "border-accent/30 bg-accent/10 text-accent" : "border-border text-muted-foreground")} data-testid="status-live"><i className={cn("h-1.5 w-1.5 rounded-full", isLive ? "bg-accent animate-pulse" : "bg-muted-foreground")} />{isLive ? "Live" : "Standby"}</span>
            </div>
            <div className="relative mt-12 flex items-center justify-center">
              <div className={cn("absolute h-56 w-56 rounded-full border border-primary/20", playing && "animate-[ping_3s_ease-out_infinite]")} />
              <button
                type="button"
                onClick={toggle}
                disabled={loading}
                className="group flex h-48 w-48 items-center justify-center rounded-full border border-primary/30 bg-background shadow-[inset_0_0_45px_rgba(224,89,71,.12)] transition hover:scale-[1.02] hover:border-primary/60 disabled:cursor-wait disabled:opacity-75"
                aria-label={playing ? "Pause live broadcast" : "Play live broadcast"}
                data-testid="button-center-player"
              >
                <span className="flex h-36 w-36 items-center justify-center rounded-full border border-accent/20 bg-card text-primary transition group-hover:bg-primary/10">
                  {loading ? <LoaderCircle className="h-10 w-10 animate-spin" /> : playing ? <Pause className="h-12 w-12 fill-current" /> : <Play className="ml-1 h-12 w-12 fill-current" />}
                </span>
              </button>
            </div>
            <div className="relative mt-12 text-center">
              <div className="flex justify-center"><SignalBars active={playing} /></div>
              <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight" data-testid="text-show-name">{config.showName || "USALB RADIO"}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{config.hostName || "USALB Studio"} · {config.genre || "Albanian radio"}</p>
            </div>
            <div className="relative mt-8 flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3">
              <button onClick={() => { setMuted(!muted); if (audioRef.current) audioRef.current.volume = muted ? volume : 0; }} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" data-testid="button-toggle-mute">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
              <input aria-label="Volume" type="range" min="0" max="1" step=".01" value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="h-1 w-full accent-[hsl(var(--primary))]" data-testid="input-volume" />
              <span className="font-mono text-[10px] text-muted-foreground">{Math.round((muted ? 0 : volume) * 100)}%</span>
            </div>
            <div className="relative mt-4 flex items-center justify-between text-[11px] text-muted-foreground"><span className="flex items-center gap-2"><Wifi className="h-3.5 w-3.5 text-accent" /> Stream health stable</span><span>Updated {lastUpdated}</span></div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-8 md:grid-cols-[1fr_auto] md:items-center">
          <div><p className="eyebrow text-primary">The frequency</p><h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">A familiar voice in a noisy world.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">USALB RADIO is made for the commute, the kitchen, the late shift and the long way home. No feed to scroll. Just press play.</p></div>
          <div className="flex gap-8 text-right"><div><p className="font-display text-3xl text-accent">01</p><p className="eyebrow mt-1 text-muted-foreground">station</p></div><div><p className="font-display text-3xl text-accent">AL</p><p className="eyebrow mt-1 text-muted-foreground">everywhere</p></div></div>
        </div>
      </section>
      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8"><span>© USALB RADIO · Albanian broadcast, wherever you are.</span><span className="flex items-center gap-2"><Info className="h-3.5 w-3.5" /> Your one-tap radio home</span></footer>
      <audio ref={audioRef} onPause={() => setPlaying(false)} onPlaying={() => setPlaying(true)} onError={() => { setPlaying(false); setError("The live source is unavailable right now."); }} preload="none" />
    </main>
  );
}