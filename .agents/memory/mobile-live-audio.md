---
name: Mobile live audio compatibility
description: Browser compatibility constraint for the live radio listener.
---

iOS Safari and many in-app phone browsers cannot reliably play the broadcaster's WebM/Opus chunks through MediaSource. Keep a browser-neutral PCM fallback for listeners, while retaining WebM/Opus for browsers that support it.

**Why:** The radio's primary audience listens from phones, and the old listener path surfaced a browser requirement instead of playing audio on Safari.

**How to apply:** When changing the live relay or player, preserve the format negotiation/filtering between webm and PCM listeners, keep volume/mute controls connected to both playback paths, and create/resume the PCM AudioContext directly from the user's tap before waiting for the WebSocket.

The browser Live Desk is intended for live shows while the control-room page is open; it cannot provide unattended 24/7 programming after that computer is closed. A real always-on source/encoder is required for continuous broadcasting, with the public player using the stable proxied stream path when configured.