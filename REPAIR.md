# Aura implementation verification and repair

## Repository evidence

Before this repair, `E:\spotify rea\music-app` was clean on `main`, tracking the requested Aura GitHub repository. `git fetch` and `git ls-remote` confirmed both local and remote HEAD were `fa57c2c998ff862f16976e9312f59247d80ba73c`. The log contained two commits: `ecd663a` and `fa57c2c`. Prior changes were committed and pushed, not stranded on another branch.

The parent `E:\spotify rea` has a separate broken/incomplete Git checkout pointing to `morluto/rea`. It is not the Aura repository. It has been left untouched. Open the existing `music-app` folder as the IDE project to avoid confusing the repositories.

GitHub reported default branch `main`, no Pages site, no homepage URL and no recorded deployments/actions runs. No hosting configuration was present in the checkout. These observations do not exclude a separately configured external host. No deployed URL was supplied, so a production source comparison or redeployment cannot be verified yet.

## Actual findings

- The YouTube controller, services/lyrics/diagnostic handlers, manifest, icon and Node asset routes already existed. They were not missing from the inspected commit. `catalog-api.mjs` is intentionally the Audius adapter; YouTube is implemented in `youtube-api.mjs` and routed by `server.mjs`.
- The source selector advertised YouTube even without a server key. Switching source only filtered old results, and still made unrelated Audius requests. Configuration and error states were insufficiently explicit.
- YouTube `play()` returned before a playing event, and cue readiness was not awaited. Older iframe events could advance an unrelated audio queue. Script startup failure left state that prevented a clean retry. These lifecycle boundaries now await readiness/playing, enforce timeouts, reject stale operations and ignore events after source changes.
- Static resources had no explicit cache revalidation headers. The service worker used its original cache namespace and did not immediately activate updates. Resources now require revalidation; the v2 worker fetches fresh shell assets, activates and claims clients. It only removes older Aura shell caches, never IndexedDB or user music.
- The Node server bound to loopback even in production. It now honors HOST and defaults to all interfaces under NODE_ENV=production. A health route and X-Aura-Revision expose the running backend revision so hosts can be compared with GitHub.
- A static host returning HTML for API routes previously produced an opaque JSON parse failure. The app now explains the missing Node backend. Music services and diagnostics show backend identity; status information is no longer rendered as nonfunctional menu actions. The profile button has an explicit local-profile handler, and lyrics is labeled unavailable.
- Adding a newly discovered song through the playlist-library picker saved the playlist reference without always persisting the corresponding track. Both are now saved.

## Deployment

This application requires a Node web service. Uploading the HTML/JS/CSS to GitHub Pages or a static-only host cannot execute `/api/search`, `/api/discover`, `/api/stream/*` or YouTube routes.

Run locally with `npm start` from this folder. Open http://localhost:5173 and inspect Music services or GET `/api/health`. The returned revision should match the commit used to start the server. Restart the server after pulling updates; Git pushes alone do not restart an already running Node process.

`render.yaml` supplies a Node web-service configuration for branch main with `npm run check`, `npm start`, production binding and `/api/health`. It has not been deployed to an authenticated hosting account. A free host may sleep and add cold-start latency. For another Node host, use the same start command, supported Node version, injected PORT and HOST=0.0.0.0. Serve the frontend and APIs from the same origin. Configure YOUTUBE_API_KEY on the server to enable official discovery; do not place keys in HTML or commit .env. Spotify remains disabled without approved developer access/account authorization. No restrictions or provider advertisements are bypassed.

To verify a production release: check `/api/health`, compare its revision with `git rev-parse HEAD`, and request `/manifest.webmanifest`, `/icon.svg`, `/playback.js` and `/api/providers`. A frontend-only deployment is not a successful release. The live URL/hosting account is still required to perform these checks remotely.

## Performance and tests

The existing 30-second bounded metadata cache and in-flight sharing are retained. Source-specific search now makes zero upstream catalog calls for local-only searches and avoids Audius calls for YouTube-only searches. Stream availability remains freshly checked; no protected audio is prefetched, proxied or cached. A new live sample measured cold search 2309 ms, repeat search 6 ms, authorization/local redirect 351 ms, and official redirect chain/first bytes 1680 ms. This is not a controlled before/after startup benchmark; external network latency still dominates cold streaming.

`npm run check` and `npm test` verify all scripts and nine tests, including production HTTP asset/MIME/cache contracts, disabled-provider routes, source-specific requests, and real-event YouTube lifecycle behavior with mocks. `npm run test:browser` exercises Chrome startup, public Audius playback, imported audio, pause/seek/next/previous/automatic next, queues, playlists, reload persistence, navigation, Media Session metadata, mobile width, provider/lyrics/diagnostic controls, rapid typing, slow responses, failures and offline shell reload without deleting user data.

Optional `AURA_LIVE_YOUTUBE=1` adds an actual official IFrame attempt using the YouTube documentation demo video. Discovery still requires a real server API key. The test reports the actual playback result separately; it must not be counted as successful playback if YouTube returns an error. No physical lock-screen, notification, Bluetooth or incoming-call behavior is certified by these browser tests.

Final run: all nine tests passed and the Chrome checks passed. The actual YouTube documentation demo reached `playing: true` with advancing time after cue-readiness handling was added. Earlier attempts returned a provider error before that change; the readiness ordering was a concrete lifecycle problem. This verifies the official embedded playback path, not live key-backed discovery, every catalog video or every device. The final browser run used an explicitly named imported fixture for playlist membership so live catalog timing cannot change which song the test chooses.
