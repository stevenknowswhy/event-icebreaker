"""Warm Path agent service."""

import os

# The workflow handles public identity hints. Keep framework usage telemetry off
# so even role/model metadata does not leave the service unexpectedly.
os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
