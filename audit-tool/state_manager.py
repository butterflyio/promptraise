"""Simple state manager for audit stages.

Stores state as JSON in dashboards/{slug}/state.json
so audit can resume from any stage.
"""

import json
from pathlib import Path
from typing import Any, Optional


class StateManager:
    def __init__(self, slug: str, dashboards_dir: str):
        self.slug = slug
        self.dashboards_dir = Path(dashboards_dir)
        self.state_file = self.dashboards_dir / slug / "state.json"
        self._state = self._load()

    def _load(self) -> dict:
        if self.state_file.exists():
            try:
                return json.loads(self.state_file.read_text())
            except (json.JSONDecodeError, IOError):
                return {"stages": {}, "data": {}}
        return {"stages": {}, "data": {}}

    def _save(self):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self.state_file.write_text(json.dumps(self._state, indent=2))

    def is_complete(self, stage: str) -> bool:
        return self._state.get("stages", {}).get(stage, False) is True

    def mark_complete(self, stage: str, data: Any = None):
        if "stages" not in self._state:
            self._state["stages"] = {}
        self._state["stages"][stage] = True
        if data is not None:
            if "stage_data" not in self._state:
                self._state["stage_data"] = {}
            self._state["stage_data"][stage] = data
        self._save()

    def get(self, key: str, default: Any = None) -> Any:
        return self._state.get("data", {}).get(key, default)

    def set(self, key: str, value: Any):
        if "data" not in self._state:
            self._state["data"] = {}
        self._state["data"][key] = value
        self._save()

    def reset(self):
        self._state = {"stages": {}, "data": {}}
        self._save()

    def get_stage_data(self, stage: str) -> Optional[Any]:
        return self._state.get("stage_data", {}).get(stage)