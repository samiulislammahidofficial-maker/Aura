# Aura provider and performance upgrade

## Findings and changes

The inspected application had no third-party packages. Its 300 ms search debounce already worked, but repeated queries had no cache or in-flight deduplication. Stream startup includes a fresh availability request, a local redirect, then Audius's redirect chain; these network costs dominate cold startup. Queue metadata was rewritten every five seconds along with progress. Repeated renders recreated current artwork. Restored seek position could be applied to a different selected song. Those storage/render/position issues are corrected without replacing the UI or native audio player.

`request-cache.mjs` adds a bounded 100-entry, 30-second server metadata cache and in-flight sharing. Failures are not cached. Each upstream request has a provider timeout. Browser cancellation discards obsolete results; shared server requests intentionally remain alive up to their timeout so another client can receive the same response. Stream availability checks remain fresh, and stream bytes are never proxied/cached. Each enabled search source renders independently as it completes. A failed source does not erase another source's results.

`providers.js` declares search, metadata, playlists, playback and lyrics capabilities and endpoint adapters for Audius, YouTube and local files. Spotify and Jamendo have disabled capabilities. Tracks expose provider IDs, playback type, availability and restrictions. Recording comparisons consider title, artist, duration and version markers; they are suggestions, not an authoritative identity match. The user explicitly chooses a recording. Aura never silently substitutes a stream from another provider.

`playback.js` keeps the same persistent audio element and provides a visible official YouTube IFrame player when configured. Switching source pauses the previous player. YouTube playback is paused on page visibility loss and cannot be resumed while hidden. No ads/controls are removed, no audio extraction is performed, and no YouTube stream is routed to HTMLAudioElement.

The library now stores favorite artists, saved album/collection references, and a bounded 100-track recently-played history. Mood cards perform discovery searches rather than creating empty playlists. Genre exploration and an explicit 'Explore this genre' song action supply related discovery; these are not personalized recommendation models. Lyrics have an unavailable response because no licensed lyrics source is configured.

The manifest and service worker cache only an explicit same-origin application-shell allowlist. No APIs, external images, metadata, or remote music are cached by the worker. Existing user-imported audio remains in IndexedDB. The offline shell and local library were verified after an offline reload. Installation appearance depends on browser/platform support; use HTTPS outside localhost.

## Measurements

These are small live samples on this machine, not controlled global benchmarks:

| Request | Before | After |
| --- | ---: | ---: |
| First search for chill | 2465 ms | 2323 ms |
| Repeated search for chill | 127 ms | 5 ms |
| First trending request | 1604 ms | 1685 ms |
| Repeated trending request | Not measured | 3 ms |

After: stream authorization plus local redirect took 402 ms; the official stream redirect chain plus first audio bytes took 2298 ms. Cold network latency remains significant. The cache primarily improves repeated discovery, and no improvement is claimed for cold trending/startup or buffering under all conditions. See `benchmark-results.json` and rerun `npm run benchmark`. Playback details in the UI expose session-only search latency, playback promise durations, rejected attempts and buffering-event counts; these measurements are not sent to analytics. Audio startup time is measured from the play request through its resolved play promise; video API promises are not equivalent to verified video playback and should not be treated as such.

## Credentials, cost and verification boundaries

- Audius: live discovery and public streaming tested. Optional server `AUDIUS_API_KEY` can associate metadata requests with a developer plan; provider rate limits and track availability still apply.
- YouTube: adapter and IFrame lifecycle tested using fixtures/mocks. No live API key was available, so live search, quota behavior and actual video playback are **not verified**. Set `YOUTUBE_API_KEY` in `.env` after enabling the YouTube Data API v3. Quotas come from the Google project and current provider policy. Search does not provide the full YouTube Music catalog. Channels/playlists link to their official pages; they are not relabeled as licensed audio albums.
- Spotify: deliberately disabled. No approved client credentials, redirect registration or account authorization is present; OAuth/library integration has not been implemented or tested. Do not paste Spotify tokens into browser configuration. SDK playback requires eligible Premium accounts. Developer access and current scopes must be established before building the OAuth flow.
- Jamendo: evaluated against its API terms and left disabled. Requires a client ID, a confirmed noncommercial or separately authorized usage model, and per-track license/attribution review. No Jamendo downloads or caching is implemented.
- Lyrics: disabled/unavailable without a display-permitted source. No lyrics scraping.
- No packages installed. HTMLAudioElement and native service workers suffice; HLS.js, Video.js and Workbox add no demonstrated benefit for the current sources. Existing Chrome DevTools browser tests were extended rather than adding Playwright and a duplicate browser installation.
- No mandatory Aura subscription or advertising SDK. Hosting/network costs depend on deployment; the current server runs locally. Provider paid plans/Spotify Premium are separate. Free source code does not supply commercial music rights.
- Physical lock screens, notifications, headsets, incoming calls and extended background sessions still need device testing. Media Session support is browser/OS-dependent. The PWA is not a native Android background service.

## Tests and run instructions

Run `npm start` from this directory, then open http://localhost:5173. Node 22.9+ is required for the optional env-file flag; verified with Node 26.3.0. No npm installation is needed. To configure YouTube, copy `.env.example` to ignored `.env`, fill the key, and restart. Never commit `.env`.

Run `npm run check`, `npm test`, and `npm run test:browser` (server running). The latter uses generated audio, a temporary Chrome profile, live Audius checks plus reproducible intercepted search fixtures. It covers imports, search, playback, queue transitions, seek, shuffle/repeat state, playlists, persistence, navigation, Media Session metadata, mobile width, rapid typing, provider failure, slow results, and offline shell/local-library reload. Tests deliberately do not claim physical-device or live YouTube/Spotify verification.

## Source review and licensing

[Spotube's current master PluginService](https://github.com/team-spotube/spotube/blob/master/composeApp/src/commonMain/kotlin/org/spotube/spotube/core/zipline/PluginService.kt) separates metadata search/track/album/artist APIs, AudioAPI, LyricsAPI and login/service lifecycle. Its source is AGPL-3.0-or-later: copying/modifying it would require applicable licensing and source-offer obligations, including network-use obligations for modified versions. No Spotube code/assets/plugins were copied; the adapters here are independently written. The built-in extraction path was not ported.

[Prism](https://github.com/Yigder/Prism) informed persistent-player/queue ownership and state restoration as documented in README. No GPL Prism source or native Android dependencies were imported. Spotify is a usability reference, without proprietary assets.

Provider references: [Audius](https://docs.audius.co/api/), [YouTube search](https://developers.google.com/youtube/v3/docs/search/list), [IFrame API](https://developers.google.com/youtube/iframe_api_reference), [YouTube policies](https://developers.google.com/youtube/terms/developer-policies/), [Spotify SDK](https://developer.spotify.com/documentation/web-playback-sdk), [Jamendo terms](https://devportal.jamendo.com/api_terms_of_use).
