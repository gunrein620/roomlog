from pathlib import Path
import unittest


VIEWER_HTML = Path(__file__).resolve().parents[1] / "viewer" / "index.html"


class RoomLogViewerIntegrationTests(unittest.TestCase):
    def test_viewer_exposes_roomlog_completion_action(self) -> None:
        source = VIEWER_HTML.read_text(encoding="utf-8")

        self.assertIn('id="connect-roomlog-btn"', source)
        self.assertIn('from "/viewer-assets/roomlog-integration.mjs"', source)
        self.assertIn('fetch("/integration-config",', source)
        self.assertIn("sendRoomLogCompletion", source)
        self.assertIn("RoomLog에 연결", source)


if __name__ == "__main__":
    unittest.main()
