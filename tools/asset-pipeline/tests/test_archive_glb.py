"""Regression coverage for first-class archive GLB pipeline ingestion."""
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from asset_pipeline.archive_glb import inspect_glb, read_source_library, inventory, ingest
from asset_pipeline.workspace import StageError


def glb():
    payload = json.dumps({"asset": {"version": "2.0"}, "nodes": [], "meshes": []}).encode("utf-8")
    payload += b" " * ((-len(payload)) % 4)
    return b"glTF" + struct.pack("<IIII", 2, 20 + len(payload), len(payload), 0x4E4F534A) + payload


class ArchiveImportTests(unittest.TestCase):
    def test_accepts_all_138_models_and_ingests_repeatably(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            archive = root / "models.zip"
            donor = glb()
            with ZipFile(archive, "w") as out:
                out.writestr("glb-low-poly-models-building-blocks/", "")
                out.writestr("glb-low-poly-models-building-blocks/README.txt", "metadata")
                for i in range(138):
                    out.writestr(f"glb-low-poly-models-building-blocks/model-{i:03d}.glb", donor)
            sha = hashlib.sha256(archive.read_bytes()).hexdigest()

            class Asset:
                id = "test_archive"
                work = root / "work"
                config_path = root / "asset.json"
                config = {"archive": {"path": str(archive), "sha256": sha}}
                def source(self, name):
                    return Path(name)

            a = Asset()
            a.work.mkdir()
            entries = read_source_library(archive, sha)
            self.assertEqual(len(entries), 138)
            outputs, data = inventory(a, {})
            self.assertEqual(data["models"], 138)
            self.assertEqual(len(outputs), 1)
            self.assertFalse((a.work / "imports").exists())
            outputs, data = ingest(a, {})
            self.assertEqual(data["models"], 138)
            self.assertTrue(data["imported"])
            self.assertEqual(len(outputs), 139)
            index = json.loads((a.work / "imports.json").read_text())
            self.assertEqual(index["count"], 138)
            self.assertEqual(len({p["pipeline_input"] for p in index["entries"]}), 138)
            for p in outputs[:-1]:
                self.assertEqual(p.read_bytes(), donor)
            outputs2, _ = ingest(a, {})
            self.assertEqual(outputs, outputs2)

    def test_rejects_corruption_and_invalid_directories(self):
        with tempfile.TemporaryDirectory() as temp:
            archive = Path(temp) / "bad.zip"
            with ZipFile(archive, "w") as out:
                for i in range(137):
                    out.writestr(f"glb-low-poly-models-building-blocks/{i}.glb", glb())
                out.writestr("../escape.glb", glb())
            sha = hashlib.sha256(archive.read_bytes()).hexdigest()
            with self.assertRaisesRegex(StageError, "unsafe archive member"):
                read_source_library(archive, sha)
            with self.assertRaisesRegex(StageError, "archive hash mismatch"):
                read_source_library(archive, "0" * 64)
            with self.assertRaisesRegex(StageError, "invalid GLB"):
                inspect_glb(b"broken")


if __name__ == "__main__":
    unittest.main()
