"""Public YouTube Music metadata only. JSON-lines IPC; no auth or audio extraction."""
import json
import sys
import threading
import re
from concurrent.futures import ThreadPoolExecutor

import requests
from ytmusicapi import YTMusic


class TimedSession(requests.Session):
    def request(self, *args, **kwargs):
        kwargs.setdefault("timeout", 8)
        return super().request(*args, **kwargs)


local = threading.local()
output_lock = threading.Lock()


def emit(data):
    with output_lock:
        print(json.dumps(data, ensure_ascii=True), flush=True)


def artwork(item):
    return (item.get("thumbnails") or [{}])[-1].get("url", "")


def track(item):
    video_id = item.get("videoId")
    if not isinstance(video_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        return None
    artists = [a for a in (item.get("artists") or []) if isinstance(a, dict)]
    album = item.get("album")
    album_name = album.get("name", "") if isinstance(album, dict) else str(album or "")
    seconds = int(item.get("duration_seconds") or 0)
    if not seconds:
        for part in str(item.get("duration") or "0").split(":"):
            seconds = seconds * 60 + (int(part) if part.isdigit() else 0)
    return {"id": "youtube:" + video_id, "provider": "youtube", "providerId": video_id,
            "title": item.get("title", "Untitled"), "artist": ", ".join(a.get("name", "") for a in artists) or "YouTube Music",
            "artistId": artists[0].get("id") if artists else None,
            "album": album_name, "artwork": artwork(item), "duration": seconds,
            "playable": item.get("isAvailable") is not False, "playbackType": "youtube-embed",
            "restrictions": "Embedding availability is unverified until the official player starts. Ads and background restrictions apply.",
            "availability": "embed-unverified", "permalink": "https://www.youtube.com/watch?v=" + video_id, "hue": 100, "added": 0}


def collection(item):
    browse_id = item.get("browseId")
    return {"id": browse_id, "provider": "youtube", "name": item.get("title") or item.get("artist", "Unknown"),
            "isAlbum": item.get("resultType") == "album", "artwork": artwork(item)}


def run(message):
    request_id = message.get("id")
    try:
        if not hasattr(local, "yt"):
            local.yt = YTMusic(requests_session=TimedSession())
        yt = local.yt
        action, value = message.get("action"), message.get("value", "")
        if action == "search":
            rows = yt.search(value[:160], limit=20)
            data = {"tracks": [], "artists": [], "albums": []}
            seen = set()
            for row in rows:
                kind = row.get("resultType")
                if kind in ("song", "video"):
                    song = track(row)
                    if song and song["id"] not in seen:
                        seen.add(song["id"])
                        data["tracks"].append(song)
                elif kind == "artist" and row.get("browseId"):
                    data["artists"].append(collection(row))
                elif kind in ("album", "playlist") and row.get("browseId"):
                    data["albums"].append(collection(row))
        elif action in ("artist", "album", "playlist"):
            raw = {"artist": yt.get_artist, "album": yt.get_album, "playlist": lambda v: yt.get_playlist(v.removeprefix("VL"), limit=50)}[action](value)
            rows = (raw.get("songs") or {}).get("results", []) if action == "artist" else raw.get("tracks", [])
            songs = [track({**item, "thumbnails": item.get("thumbnails") or raw.get("thumbnails", []), "artists": item.get("artists") or raw.get("artists", [])}) for item in rows]
            data = {"name": raw.get("name") or raw.get("title", "YouTube Music"), "description": raw.get("description", ""), "tracks": [s for s in songs if s], "albums": []}
            if action == "artist":
                for album in (raw.get("albums") or {}).get("results", []):
                    data["albums"].append(collection({**album, "resultType": "album"}))
        else:
            raise ValueError("Unsupported metadata operation")
        emit({"id": request_id, "data": data})
    except Exception:
        # Do not expose upstream headers, cookies or internal tracebacks.
        emit({"id": request_id, "error": "YouTube Music metadata is temporarily unavailable. Retry or use Audius."})


def main():
    emit({"ready": True})
    with ThreadPoolExecutor(max_workers=2) as pool:
        for line in sys.stdin:
            try:
                message = json.loads(line)
                pool.submit(run, message)
            except (ValueError, TypeError):
                emit({"error": "Invalid metadata request"})


if __name__ == "__main__":
    main()
