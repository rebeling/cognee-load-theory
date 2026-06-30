import tomllib
from pathlib import Path


def _project() -> dict:
    pyproject = Path(__file__).parent / "../pyproject.toml"
    return tomllib.loads(pyproject.read_text())["project"]


def get_version() -> str:
    return _project()["version"]


def get_title() -> str:
    return _project()["name"]
