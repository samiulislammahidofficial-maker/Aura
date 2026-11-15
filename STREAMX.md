# StreamX library integration

The supplied repository's current main branch is **StreamGO**, a Go/MongoDB/Telegram audio server. Its stream endpoint serves stored Telegram audio files using HTTP byte ranges. It is not a hosted YouTube audio API.

The legacy/python branch includes `Api/routers/yt_dlp.py`: it downloads YouTube audio, uploads the file to Telegram, and stores its reference in MongoDB. Its client subsequently streams that stored file. This differs from embedding YouTube or providing an instant unrestricted YouTube Music API. That downloader, cookie support, certificate-check disabling and upload pipeline have not been copied into Aura.

Aura now has an optional StreamX **stored-library adapter**. Configure a running server in ignored `.env`:

```dotenv
STREAMX_API_URL=https://your-server.example/api/
```

Use your instance's actual API base; omit `/api/` if it mounts routes at the origin root. This must be a server URL, not a GitHub repository URL. Restart Aura after changing the configuration. A StreamX audio-library option then appears in the existing source selector. It uses `/search?q=...`, `/tracks`, and `/tracks/:id/stream` on the configured instance. Metadata is normalized for Aura's artwork/player UI; audio is passed through with Range headers for seeking. No iframe is created for StreamX tracks. Audio is not pre-downloaded or stored by Aura.

The current integration supports accessible library endpoints and preserves access failures. It does not create a Telegram bot, provision MongoDB, sign into StreamX, import YouTube tracks, or automatically associate a YouTube search result with a different recording. Configure only a library you are authorized to access and serve. A private instance requiring login needs a separate authenticated integration; putting credentials into the URL is rejected. No server credentials or personal Telegram sessions were provided in this task.

Tests verify metadata normalization, rejection of virtual YouTube references as stored audio, missing-server behavior, audio-byte forwarding, Range seeking and preservation of access failures using a local fixture server. **No live StreamX instance has been supplied or tested.** Existing Audius/local and YouTube discovery/official embedded playback remain intact. This does not yet make arbitrary YouTube Music search results playable as audio-only tracks.

The Chrome test also injects a configured StreamX fixture and a generated WAV file, then verifies real HTML audio playback, artwork, track title and a hidden video panel. This proves the Aura client adapter path with fixtures; it is not evidence of a live StreamX deployment or a YouTube download working.

The StreamX source license is MIT. Its architecture and public route/response contracts were studied; implementation code here was independently written. References: [current README](https://github.com/StreamXProject/StreamXBot/blob/main/README.md), [stream handler](https://github.com/StreamXProject/StreamXBot/blob/main/internal/api/handlers/stream.go), [legacy download pipeline](https://github.com/StreamXProject/StreamXBot/blob/legacy/python/Api/routers/yt_dlp.py).
