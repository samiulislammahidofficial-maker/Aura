# Aura

Optional [StreamX stored audio-library integration](STREAMX.md) is available for a running StreamX/StreamGO server. It uses Aura's own audio player; it is not a replacement YouTube audio extraction service.

YouTube Music now uses the Python **ytmusicapi** provider for keyless public discovery. See [YouTube Music setup](YOUTUBE_MUSIC.md) for installation, endpoints, testing and the updated Node + Python hosting configuration. Playback remains in the official visible YouTube player.

See [implementation verification and repair](REPAIR.md) for repository/hosting evidence, current cache and provider fixes, deployment instructions, and exact verification limits. Aura must run on a Node web service; a static-only deployment cannot supply its API routes.

Aura includes Audius discovery and authorized public streaming alongside the existing imported-audio library. The existing layout, colors, navigation and player are preserved. See [the upgrade report](UPGRADE.md) for provider architecture, YouTube configuration, library/PWA features, measured performance, test scope and remaining credential/licensing requirements.

## Current behavior and root cause

The original app had no catalog API or initial tracks: it only loaded IndexedDB audio files, and search only filtered imported files. Empty browser storage meant an empty library. Playback assumed every track had a Blob. No provider authentication was implemented, so this was missing functionality rather than failed authentication.

Home now loads actual trending tracks. Debounced search returns songs, artists, albums and playlists. Artist names and suggestion chips open detail views. Track artwork, duration and availability come from Audius. Gated/unavailable tracks are labeled metadata only and cannot play. The server rechecks access before using the official stream endpoint. Local favorites and playlists accept public catalog tracks; remote audio and expiring stream URLs are not downloaded or persisted.

## Current architecture

The zero-dependency Node server exposes an allowlisted catalog adapter in `catalog-api.mjs`. The documented Audius public read API works without a credential in current checks. An optional `AUDIUS_API_KEY` stays in the server environment and is used only for metadata requests. Higher limits or provider write operations may require provider credentials/plans. No Spotify/YouTube extraction or restrictions bypass is used.

One persistent HTMLAudioElement plays imported Blobs or authorized remote streams across view navigation. Queue insertion/removal, next/previous, seek, repeat queue, shuffle and automatic advancement are implemented. Buffering is displayed; network errors receive one reload attempt, with manual Play retry for other failures. Stale asynchronous play completions are ignored. Fonts load without blocking startup, preserving the same typeface choices.

IndexedDB version 2 migrates existing libraries and stores the current track, queue/index, position, shuffle/repeat, volume/mute and remote metadata required by the queue. Reload restores paused; a user gesture resumes playback. Progress saves on pause/seek/visibility changes and every five seconds during playback. Browser storage is origin/device-specific and subject to quota/eviction.

## Background playback and limits

Media Session exposes metadata, position, play/pause, stop, seek, next and previous handlers to supporting browser/OS notification, lock-screen and headset controls. Switching views or tab visibility does not intentionally pause authorized audio playback. YouTube video playback requires its visible official player and pauses when the page is hidden. The browser and OS manage audio focus and interruptions; Aura does not force automatic resumption after an interruption.

This is a browser app, with no Android/Kotlin/Gradle project. Media3 ExoPlayer and MediaSessionService cannot run directly here. Native Android service lifecycle, guaranteed locked-screen continuity, Bluetooth behavior and process survival require a native Android implementation. Browser support and power policies determine actual background behavior. Closing/force-killing the browser ends playback. A service worker is not a substitute for a foreground audio service.

No ad SDK, analytics, application-created banner, popup ad or interstitial is included. Provider monetization and availability restrictions are preserved. Catalog content does not confer redistribution rights.

## Current verification

Run `npm.cmd run check`, `npm.cmd test`, then `npm.cmd run test:browser` with the server running. Chrome is required for browser checks; set `CHROME_PATH` if needed. Tests use generated audio and a temporary profile. Live-provider checks depend on network/provider availability.

Verified: syntax checks; availability/normalization, gated/invalid stream rejection and rate-limit tests; real catalog search; artist profiles; album listings; official audio/mpeg stream bytes; real streaming in Chrome; local imports; favorites; playlists; persistence; mobile width; Media Session metadata; seek; next/previous; automatic next; shuffle/repeat state; navigation without stopping playback.

Not physically verified: screen locking, extended background playback, notification actions, Bluetooth headset buttons and incoming-call/audio-focus behavior. These require real device/browser testing.

## Reference and licensing

[Prism](https://github.com/Yigder/Prism) was reviewed for its service-owned ExoPlayer/MediaLibrarySession, PlayerConnection, queue state, saved playback state and search/metadata separation. It is GPL-3.0-or-later. No Prism source, artwork, extractor or dependencies were copied. Aura uses browser/Node APIs and the [documented Audius API](https://docs.audius.co/api/). See also [Media Session](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) and [native Android background playback](https://developer.android.com/media/media3/session/background-playback).

## Run locally

Requires Node.js. No dependency installation is needed. From the music-app directory, run npm.cmd start, then open http://localhost:5173. The server binds to loopback; PORT changes the port and therefore the browser-storage origin. Import audio with Import music. REA toolkit source remains unchanged in ../rea-toolkit.
