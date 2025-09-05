# app/__init__.py

from importlib.metadata import PackageNotFoundError, version, metadata

try:
    __version__ = version("myapi")
    _m = metadata("myapi")
    __title__ = _m.get("Name", "My API")
    __description__ = _m.get("Summary", "")
except PackageNotFoundError:
    __version__ = "0.0.0+local"
    __title__ = "My API"
    __description__ = ""

__all__ = ["__version__", "__title__", "__description__"]
