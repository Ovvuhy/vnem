# jscpd

jscpd is a CLI and Node.js duplicate-code detector. It scans source files and documents for copy-paste clones, supports many languages and formats, and can produce machine-readable reports for local review or CI.

## Best For

- Finding repeated implementations before a simplification pass
- Producing objective clone reports that a coding agent can inspect before editing
- Tracking duplication thresholds in larger repositories

## Review Notes

Trust tier: promising. Official docs, GitHub, and npm metadata were checked on 2026-05-27. Clone detection is a signal, not a design decision: repeated code should only be collapsed when shared behavior is real, tests cover the behavior, and the resulting abstraction remains clearer than the duplication.
