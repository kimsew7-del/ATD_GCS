# ATD_GCS

Ground Control Station scaffold for `Auto-Tracking-Drone v2`.

## Scope

Current scope is a mock-driven GCS baseline built from the latest interface documents in [`docs/`](/Users/daon/projects/ATD_GCS/docs).

Included:

- telemetry panels for vehicle, tracker, and health
- event log panel
- command panel
- mock WebSocket transport simulating tracker state changes
- transport adapter boundary for real ATD server integration
- local server for development

Not included yet:

- real ATD server handshake validation
- video stream integration
- config editing
- replay tooling

## Run

```bash
python3 scripts/serve.py
```

Then open:

```text
http://127.0.0.1:8080
```

Transport selection:

```text
http://127.0.0.1:8080/?transport=mock
http://127.0.0.1:8080/?transport=real&server=ws://127.0.0.1:9000/ws
```

## Structure

- `app/` static GCS client
- `scripts/serve.py` local static server
- `docs/` integration contracts and implementation baseline
