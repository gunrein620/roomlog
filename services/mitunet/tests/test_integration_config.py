import os
import unittest
from unittest.mock import patch

from server.integration import integration_config_payload


class IntegrationConfigTests(unittest.TestCase):
    def test_returns_configured_roomlog_origins(self) -> None:
        with patch.dict(
            os.environ,
            {
                "ROOMLOG_ALLOWED_ORIGINS": (
                    "http://localhost:3000, https://roomlog.example,"
                )
            },
            clear=False,
        ):
            self.assertEqual(
                integration_config_payload(),
                {
                    "roomlog_allowed_origins": [
                        "http://localhost:3000",
                        "https://roomlog.example",
                    ]
                },
            )

    def test_defaults_to_both_local_roomlog_origins(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                integration_config_payload(),
                {
                    "roomlog_allowed_origins": [
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                    ]
                },
            )


if __name__ == "__main__":
    unittest.main()
