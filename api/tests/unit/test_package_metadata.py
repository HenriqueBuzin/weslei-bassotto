import importlib
import importlib.metadata

import app


def test_package_metadata_fallback(monkeypatch):
    def missing(name):
        raise app.PackageNotFoundError(name)
    monkeypatch.setattr(importlib.metadata, "version", missing)
    reloaded = importlib.reload(app)
    assert reloaded.__version__ == "0.0.0+local"
    assert reloaded.__title__ == "My API"
