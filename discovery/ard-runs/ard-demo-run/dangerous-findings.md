# ARD Dangerous Findings

Run: ard-demo-run

Protection AI static review found the following blocked/quarantined candidates. These are excluded from Giving AI implementable work.

## BLOCKED: Malware-like package claims dashboard automation but steals tokens
- Candidate: token-stealing-postinstall-kit
- Source: local://demo/token-stealing-postinstall-kit
- Excluded from Giving: yes
- Signals: malware/virus indicator, credential/token stealing pattern, shell pipe install pattern, postinstall script surface, network exfiltration hint
- Why: Static deterministic metadata review only; not antivirus-grade scanning. Blocked because high-risk malware/credential/execution indicators were detected.
- Manual action: Do not install, execute, or pass to Giving AI. Review provenance in isolation if needed.

