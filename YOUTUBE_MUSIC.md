# YouTube Music discovery with ytmusicapi

If the source stays on “checking availability”, use the Node app at http://localhost:5173 rather than a static preview/Live Server port. The provider check now times out after six seconds, shows a specific backend/setup error, and retries up to three times. Opening **Music services** rechecks it manually; returning to the tab or reconnecting also refreshes status. A previously configured worker that stopped is restarted by the status endpoint. Reload once after updating the code; do not clear IndexedDB or your music library. For a hosted page, check that its `/api/providers` returns JSON, not HTML.

Aura now uses [sigma67/ytmusicapi](https://github.com/sigma67/ytmusicapi), version 1.12.3 (MIT), for public YouTube Music discovery and metadata. This is an **unofficial API**, not the Google YouTube Data API. Public search does not require an API key or account cookies. No authenticated library access, stream extraction, DRM/subscription bypass, lyrics scraping or downloads are implemented.

## Install and run

From this existing music-app directory on Windows:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
npm start
```

On Linux/macOS use `python3 -m venv .venv` and `.venv/bin/python -m pip install -r requirements.txt`. Python 3.10+ is required. Aura automatically selects the project's virtual environment; `YTMUSIC_PYTHON` can override the executable. No global pip installation is required. Open http://localhost:5173 and select YouTube Music, then search. Artists, albums and playlists open metadata screens; tracks are played only through the visible official YouTube IFrame player. Metadata availability does not prove embedding permission: the player can still reject a video or region. Provider advertisements, controls and background restrictions remain in effect.

`YTMUSIC_ENABLED=false` disables the Python integration. If it is unavailable, the existing official YouTube Data API adapter can still be enabled with server-side `YOUTUBE_API_KEY`. Otherwise the source is disabled with a setup explanation. Audius and imported files remain independent of Python availability.

## Architecture and verification

`ytmusic_worker.py` runs a persistent two-thread metadata worker with separate bounded-timeout HTTP sessions. `ytmusic-bridge.mjs` uses JSON-lines IPC, at most eight pending requests and a 20-second deadline, killing stalled workers and allowing a later restart. Search and metadata results use the existing short-lived server cache/deduplication. Only whitelisted search/artist/album/playlist operations are exposed. Raw upstream responses, authentication headers and stream URLs are not returned.

Routes are `/api/youtube/search?q=...`, `/api/youtube/artist/:id`, `/api/youtube/album/:id`, and `/api/youtube/playlist/:id`. Existing saved records and tracks keep their provider boundaries. The UI source selector is enabled from backend capability status, rather than assuming a Google key is required.

Live checks on this machine returned 12 tracks, 6 artists and 9 collections for Oasis Wonderwall. An Oasis artist page returned five tracks and album links; an album page returned 17 tracks. Counts and availability will vary. The browser suite includes an actual keyless YouTube Music search via the UI. Official embedded playback was independently verified in the preceding repair; individual YouTube Music search results may still refuse embedding.

Run `npm run check`, `npm test`, `.venv/Scripts/python.exe -m unittest ytmusic_worker_test.py`, and `npm run test:browser` with the server running. The bridge lifecycle test runs locally when Python dependencies are present, otherwise it reports a skip. Python tests cover album string/object forms, duration, unavailable videos and provider metadata. No real account credentials are used.

## Hosting and limitations

The server now needs both Node and Python for this provider. `Dockerfile` installs both runtimes and the pinned ytmusicapi dependency; `render.yaml` selects the Docker web-service runtime. The container build was not executed here because Docker is unavailable, and no production hosting account was deployed. Node-only installations can continue to use Audius/local files or the official Data API fallback. Python dependencies and virtual environments are excluded from Git; build them on the host or use the container configuration.

ytmusicapi is MIT licensed; installed distributions retain its license. Its unofficial endpoints and parsing can break when YouTube changes its website. Source-code licensing does not grant music redistribution rights or guarantee service availability. Public unauthenticated discovery is the only library functionality enabled here. No cookies, OAuth files or personal YouTube sessions are needed or stored.

References: [unauthenticated usage](https://ytmusicapi.readthedocs.io/en/stable/usage.html), [search response formats](https://ytmusicapi.readthedocs.io/en/stable/reference/search.html), [official playback API](https://developers.google.com/youtube/iframe_api_reference).
