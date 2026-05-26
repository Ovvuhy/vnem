# Security

vnem indexes tools that may connect agents to files, browsers, APIs, wallets, credentials, paid services, and production systems.

The registry is not a security audit. Treat every entry as untrusted until you inspect the upstream source, permissions, install path, and license yourself.

## Install-Pack Guarantees

The vnem install pack is read-only guidance and data:

- no package installation
- no remote code execution
- no daemon
- no background updater
- no credential or secret collection
- no automatic edits to the user's project

Agents using the pack are instructed to ask before installing packages, changing code, sending network requests, or using secrets.

## Reporting Issues

Open a public issue for metadata problems such as stale links, incorrect licenses, outdated trust tiers, or risky install guidance.

Use a private maintainer channel for reports that could expose users, upstream projects, credentials, or active vulnerabilities. Do not post secrets, tokens, exploit payloads, or private user data in public issues.
