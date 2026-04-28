"""BotSee CLI client.

Thin wrapper around the botsee.py CLI that runs commands as subprocesses
and parses their JSON stdout. Only read-only methods are implemented for
Phase 1 (migration of existing analyses).
"""

import json
import os
import subprocess
from typing import Optional


class BotSeeError(Exception):
    """Raised when the botsee CLI returns a non-zero exit or invalid JSON."""


class BotSeeClient:
    """Subprocess wrapper around the BotSee CLI."""

    def __init__(self, cli_path: Optional[str] = None):
        self.cli_path = (
            cli_path
            or os.environ.get("BOTSEE_CLI_PATH")
            or "/Users/zkhan/botsee-skill/skills/botsee/botsee.py"
        )
        if not os.path.exists(self.cli_path):
            raise BotSeeError(f"BotSee CLI not found at {self.cli_path}")

    def _run(self, *args: str, timeout: int = 120) -> dict:
        """Run a BotSee command and return parsed JSON output."""
        cmd = ["python3", self.cli_path, *args]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            raise BotSeeError(
                f"Command timed out after {timeout}s: {' '.join(args)}"
            ) from e

        if result.returncode != 0:
            raise BotSeeError(
                f"BotSee command failed (exit {result.returncode}): "
                f"{' '.join(args)}\nStderr: {result.stderr}"
            )

        # Some commands print non-JSON noise before/after JSON body.
        # We attempt to parse directly first, then fall back to locating
        # the first JSON object/array in the output.
        stdout = result.stdout.strip()
        try:
            return json.loads(stdout)
        except json.JSONDecodeError:
            # Try to find the first '{' or '[' and parse from there
            for start_char in ("{", "["):
                idx = stdout.find(start_char)
                if idx != -1:
                    try:
                        return json.loads(stdout[idx:])
                    except json.JSONDecodeError:
                        continue
            raise BotSeeError(
                f"Could not parse JSON from BotSee CLI output.\n"
                f"Command: {' '.join(args)}\n"
                f"Output (first 500 chars): {stdout[:500]}"
            )

    # ---- Read-only methods (Phase 1) ----

    def get_site(self, site_uuid: str) -> dict:
        return self._run("get-site", site_uuid)

    def list_types(self, site_uuid: Optional[str] = None) -> dict:
        args = ["list-types"]
        if site_uuid:
            args.extend(["--site-uuid", site_uuid])
        return self._run(*args)

    def list_personas(self, customer_type_uuid: str) -> dict:
        return self._run("list-personas", customer_type_uuid)

    def list_questions(self, persona_uuid: str) -> dict:
        return self._run("list-questions", persona_uuid)

    def list_analyses(self, site_uuid: Optional[str] = None, limit: int = 10) -> dict:
        args = ["list-analyses", "--limit", str(limit)]
        if site_uuid:
            args.extend(["--site-uuid", site_uuid])
        return self._run(*args)

    def results_competitors(self, analysis_uuid: str) -> dict:
        return self._run("results-competitors", analysis_uuid)

    def results_keywords(self, analysis_uuid: str) -> dict:
        return self._run("results-keywords", analysis_uuid)

    def results_sources(self, analysis_uuid: str) -> dict:
        return self._run("results-sources", analysis_uuid)

    def results_responses(self, analysis_uuid: str) -> dict:
        return self._run("results-responses", analysis_uuid)

    def results_keyword_opportunities(self, analysis_uuid: str) -> dict:
        return self._run("results-keyword-opportunities", analysis_uuid)

    def results_source_opportunities(self, analysis_uuid: str) -> dict:
        return self._run("results-source-opportunities", analysis_uuid)

    # ---- Site management (Phase 2) ----

    def create_site(self, domain: str, types: int = 2, personas: int = 2,
                    questions: int = 5) -> dict:
        """Create a new site and generate content in BotSee."""
        return self._run(
            "create-site", domain,
            "--types", str(types),
            "--personas", str(personas),
            "--questions", str(questions),
        )

    def list_sites(self) -> dict:
        return self._run("list-sites")

    def use_site(self, site_uuid: str) -> dict:
        return self._run("use-site", site_uuid)

    def get_site(self, site_uuid: str) -> dict:
        return self._run("get-site", site_uuid)

    def generate_types(self, site_uuid: str, count: int = 2) -> dict:
        return self._run(
            "generate-types", site_uuid,
            "--count", str(count),
        )

    def generate_personas(self, customer_type_uuid: str, count: int = 2) -> dict:
        return self._run(
            "generate-personas", customer_type_uuid,
            "--count", str(count),
        )

    def generate_questions(self, persona_uuid: str, count: int = 5) -> dict:
        return self._run(
            "generate-questions", persona_uuid,
            "--count", str(count),
        )

    def run_analysis(self, site_uuid: str = None, models: str = None) -> dict:
        args = []
        if site_uuid:
            args.append(site_uuid)
        if models:
            args.extend(["--models", models])
        return self._run("analyze", *args)

    def list_analyses(self, site_uuid: str = None, limit: int = 10) -> dict:
        args = ["list-analyses", "--limit", str(limit)]
        if site_uuid:
            args.extend(["--site-uuid", site_uuid])
        return self._run(*args)

    def get_analysis(self, analysis_uuid: str) -> dict:
        return self._run("get-question-results", analysis_uuid)
