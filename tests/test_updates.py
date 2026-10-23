import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("engine", Path(__file__).parents[1] / "backend/engine.py")
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


class UpdateTests(unittest.TestCase):
    @patch.object(engine.shutil, "which", return_value="/usr/bin/gh")
    @patch("platform.machine", return_value="x86_64")
    def test_release_check_and_numeric_versions(self, *_):
        data = {"tagName": "v0.10.0", "body": "Changes", "isPrerelease": False,
                "assets": [{"name": engine.UPDATE_ASSET}, {"name": engine.UPDATE_ASSET + ".sha256"}]}
        with patch.object(engine.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(data))) as run:
            self.assertTrue(engine.release_info({})["available"])
            self.assertNotIn("auth", run.call_args.args[0])
        data["assets"] = []
        with patch.object(engine.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(data))):
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
            directory = Path(temporary) / "print-arch"
            directory.mkdir()
            target = directory / "print-arch"
            target.write_bytes(b"original")
            binary = b"\x7fELF\x02" + b"\0" * 13 + b"\x3e\x00" + b"fixture"
            valid = False
            def download(args, **kwargs):
                dest = Path(args[args.index("--dir") + 1])
                (dest / engine.UPDATE_ASSET).write_bytes(binary)
                (dest / (engine.UPDATE_ASSET + ".sha256")).write_text(hashlib.sha256(binary if valid else b"tampered").hexdigest())
                return subprocess.CompletedProcess(args, 0)
            with patch.dict(os.environ, {"XDG_DATA_HOME": temporary, "PRINT_ARCH_EXECUTABLE": str(target)}), patch.object(engine.subprocess, "run", side_effect=download), patch.object(engine.shutil, "which", return_value="/usr/bin/gh"):
                with self.assertRaisesRegex(ValueError, "checksum"):
                    engine.install_update({"version": "0.3.0"})
                self.assertEqual(target.read_bytes(), b"original")
                valid = True
                self.assertEqual(engine.install_update({"version": "0.3.0"})["installed"], "0.3.0")
                self.assertEqual(target.read_bytes(), binary)
                self.assertEqual(target.stat().st_mode & 0o777, 0o755)
                self.assertEqual(list(directory.glob(".update-*")), [])
