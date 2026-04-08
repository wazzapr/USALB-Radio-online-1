import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Radio } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const STREAM_URL = "https://uk4freenew.listen2myradio.com/live.mp3?typeportmount=s1_9311_stream_53436989";

export default function Home() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        setIsLoading(true);
        audioRef.current.play().then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        }).catch((err) => {
          console.error("Playback failed:", err);
          setIsLoading(false);
        });
      }
    }
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume === 0) {
      setIsMuted(true);
    } else if (isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.volume = volume || 0.5;
        setIsMuted(false);
        if (volume === 0) setVolume(0.5);
      } else {
        audioRef.current.volume = 0;
        setIsMuted(true);
      }
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, []);

  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-900/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen opacity-50" />
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-black via-[#0a0a0a] to-[#120000] z-0" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto p-8">
        {/* Player Card */}
        <div className="bg-[#111] border border-red-900/30 rounded-3xl p-8 shadow-[0_0_50px_-12px_rgba(255,0,0,0.2)] backdrop-blur-xl relative overflow-hidden group">
          {/* Subtle animated glow inside card */}
          <div className={cn(
            "absolute -inset-20 bg-gradient-to-tr from-red-600/10 to-transparent blur-2xl opacity-0 transition-opacity duration-1000",
            isPlaying && "opacity-100 animate-pulse-fast"
          )} />
          
          <div className="relative z-10 flex flex-col items-center">
            {/* Live Indicator */}
            <div className="flex items-center gap-2 mb-8 bg-black/50 px-4 py-1.5 rounded-full border border-red-900/50">
              <div className={cn(
                "w-2.5 h-2.5 rounded-full bg-red-600",
                isPlaying ? "animate-pulse shadow-[0_0_10px_rgba(220,38,38,0.8)]" : "opacity-50"
              )} />
              <span className="text-xs font-medium tracking-widest text-red-50 uppercase">
                Live Broadcast
              </span>
            </div>

            {/* Title / Branding */}
            <div className="mb-12 text-center">
              <h1 className="text-5xl font-black tracking-tighter text-white mb-2 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3">
                USALB
                <span className="text-red-600">RADIO</span>
              </h1>
              <p className="text-red-400/80 text-sm tracking-[0.2em] font-light">
                THE BEAT OF THE DIASPORA
              </p>
            </div>

            {/* Visualizer (Fake) */}
            <div className="h-16 flex items-end justify-center gap-1.5 mb-12 w-full px-8">
              {Array.from({ length: 24 }).map((_, i) => (
                <div 
                  key={i}
                  className={cn(
                    "w-1.5 bg-red-600/80 rounded-t-sm transition-all duration-300 origin-bottom",
                    !isPlaying && "h-1"
                  )}
                  style={isPlaying ? {
                    height: `${Math.max(10, Math.random() * 100)}%`,
                    animation: `equalizer ${0.5 + Math.random() * 1}s ease-in-out infinite alternate`,
                    animationDelay: `${Math.random() * -2}s`
                  } : {}}
                />
              ))}
            </div>

            {/* Play Button */}
            <button
              onClick={togglePlay}
              className={cn(
                "w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 relative group/btn mb-12",
                isPlaying 
                  ? "bg-red-700 hover:bg-red-600 text-white shadow-[0_0_40px_rgba(220,38,38,0.5)]" 
                  : "bg-white text-red-700 hover:bg-gray-100 hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.1)]"
              )}
            >
              {isLoading ? (
                <div className="w-10 h-10 border-4 border-current border-t-transparent rounded-full animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-12 h-12 fill-current" />
              ) : (
                <Play className="w-12 h-12 fill-current ml-2" />
              )}
              
              {/* Ripple Effect when playing */}
              {isPlaying && (
                <div className="absolute inset-0 rounded-full border border-red-500 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite] opacity-75" />
              )}
            </button>

            {/* Volume Control */}
            <div className="w-full flex items-center gap-4 bg-black/40 p-4 rounded-2xl border border-white/5">
              <button 
                onClick={toggleMute}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
              </button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={handleVolumeChange}
                className="cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center flex items-center justify-center gap-2 text-gray-500 text-xs">
          <Radio className="w-3 h-3" />
          <span>High Quality Audio Stream</span>
        </div>
      </div>

      <audio 
        ref={audioRef} 
        src={STREAM_URL}
        preload="none"
      />
    </div>
  );
}
