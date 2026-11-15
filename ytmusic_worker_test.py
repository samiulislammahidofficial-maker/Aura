import unittest
from ytmusic_worker import track, collection


class MetadataTests(unittest.TestCase):
    def test_album_string_and_dictionary_forms(self):
        base = {"videoId": "abcdefghijk", "title": "Test", "artists": [{"name": "Artist"}], "duration": "3:04"}
        for album in ["Album", {"name": "Album"}]:
            song = track({**base, "album": album})
            self.assertEqual(song["album"], "Album")
            self.assertEqual(song["duration"], 184)
            self.assertEqual(song["availability"], "embed-unverified")
            self.assertNotIn("stream", song)

    def test_unavailable_or_missing_video(self):
        self.assertIsNone(track({"title": "No video"}))
        self.assertFalse(track({"videoId": "abcdefghijk", "isAvailable": False})["playable"])

    def test_collections_preserve_provider(self):
        self.assertEqual(collection({"browseId": "MPREtest", "title": "Album", "resultType": "album"})["provider"], "youtube")


if __name__ == "__main__":
    unittest.main()
