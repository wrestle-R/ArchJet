import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location("engine", Path(__file__).parents[1] / "backend/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class UpdateTests(unittest.TestCase):
    @patch("platform.machine", return_value="x86_64")
    def test_release_check_and_numeric_versions(self, *_):
        data = {"tag_name": "v0.10.0", "body": "Changes", "prerelease": False,
                "assets": [{"name": engine.UPDATE_ASSET}, {"name": engine.UPDATE_ASSET + ".sha256"}]}
        def response(*args, **kwargs):
            import io
            return io.BytesIO(json.dumps(data).encode())
        with patch.object(engine.urllib.request, "urlopen", side_effect=response):
            self.assertTrue(engine.release_info({})["available"])
            data["tag_name"] = "v0.3.0"
            self.assertFalse(engine.release_info({})["available"])
            data["tag_name"] = "v0.10.0"
            data["assets"] = []
            with self.assertRaisesRegex(ValueError, "missing"):
                engine.release_info({})

    @patch.object(engine, "release_info", return_value={"available": True, "version": "0.3.0"})
    def test_update_refuses_pending_jobs(self, _):
        with patch.object(engine, "queue_status", return_value=[{"id": "Test-42"}]):
            with self.assertRaisesRegex(ValueError, "pending"):
                engine.install_update({"version": "0.3.0"})

    @patch.object(engine, "release_info", return_value={"available": True, "version": "0.3.0"})
    @patch.object(engine, "queue_status", return_value=[])
    def test_checksum_failure_preserves_installed_binary_and_valid_download_replaces_it(self, *_):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary) / "archjet"
            directory.mkdir()
            target = directory / "archjet"
            target.write_bytes(b"original")
            binary = b"\x7fELF\x02" + b"\0" * 13 + b"\x3e\x00" + b"fixture"
            valid = False
            def download(version, dest):
                (dest / engine.UPDATE_ASSET).write_bytes(binary)
                (dest / (engine.UPDATE_ASSET + ".sha256")).write_text(hashlib.sha256(binary if valid else b"tampered").hexdigest())
                return None
            with patch.dict(os.environ, {"XDG_DATA_HOME": temporary, "ARCHJET_EXECUTABLE": str(target)}), patch.object(engine, "download_release", side_effect=download):
                with self.assertRaisesRegex(ValueError, "checksum"):
                    engine.install_update({"version": "0.3.0"})
                self.assertEqual(target.read_bytes(), b"original")
                valid = True
                self.assertEqual(engine.install_update({"version": "0.3.0"})["installed"], "0.3.0")
                self.assertEqual(target.read_bytes(), binary)
                self.assertEqual(target.stat().st_mode & 0o777, 0o755)
                self.assertEqual(list(directory.glob(".update-*")), [])
