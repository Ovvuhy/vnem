import { useCallback, useEffect, useMemo, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  Filter,
  LockKeyhole,
  LogOut,
  Radio,
  RefreshCcw,
  Route,
  Search,
  ShieldCheck,
  Wallet
} from "lucide-react";
import logoUrl from "../../assets/brand/logo.png";
import { AutonomousPipeline } from "./components/AutonomousPipeline.jsx";
import { FindingsMatrix } from "./components/FindingsMatrix.jsx";
import { Badge } from "./components/PipelinePrimitives.jsx";
import { TargetingConsole } from "./components/TargetingConsole.jsx";
import { usePipelineExecution } from "./hooks/usePipelineExecution.js";
import { sampleSummary } from "./sampleSummary.js";
import { useTelemetry } from "./hooks/useTelemetry.js";
import { useVnemConnector } from "./hooks/useVnemConnector.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEMO_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).has("mock");
const OFFLINE_MODE = new URLSearchParams(window.location.search).has("offline");
const SIGN_IN_TIMEOUT_MS = 2500;

export default function App() {
  const wallet = useWallet();
  const telemetry = useTelemetry();
  const [session, setSession] = useState({ loading: true, authenticated: false });
  const [summary, setSummary] = useState(DEMO_MODE ? sampleSummary : null);
  const [status, setStatus] = useState(DEMO_MODE ? "ready" : "loading");
  const [error, setError] = useState(null);

  const refreshSession = useCallback(async () => {
    if (DEMO_MODE) {
      setSession({ loading: false, authenticated: true, wallet_address: "DemoWallet111111111111111111111111111111111" });
      return;
    }
    if (OFFLINE_MODE) {
      setSession({ loading: false, configured: true, authenticated: false });
      return;
    }
    const response = await fetch("/api/auth/session", { credentials: "include" });
    if (!response.ok) {
      setSession({ loading: false, configured: true, authenticated: false });
      return;
    }
    const body = await response.json();
    setSession({ loading: false, ...body });
  }, []);

  const refreshSummary = useCallback(async () => {
    if (DEMO_MODE) {
      setSummary(sampleSummary);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    setError(null);
    const response = await fetch("/api/dashboard/summary", { credentials: "include" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus("error");
      setError(body.error ?? "dashboard-summary-unavailable");
      return;
    }
    setSummary(body);
    setStatus("ready");
  }, []);

  useEffect(() => {
    refreshSession().catch((cause) => {
      setSession({ loading: false, authenticated: false });
      setError(cause.message);
    });
  }, [refreshSession]);

  useEffect(() => {
    if (session.authenticated) {
      refreshSummary().catch((cause) => {
        setStatus("error");
        setError(cause.message);
      });
    } else if (!session.loading && !DEMO_MODE) {
      setStatus("gate");
    }
  }, [session.authenticated, session.loading, refreshSummary]);

  async function signIn() {
    try {
      if (!wallet.publicKey) {
        throw new Error("connect-wallet-first");
      }
      if (!wallet.signMessage && !wallet.wallet?.adapter?.signIn) {
        throw new Error("wallet-does-not-support-message-signing");
      }

      setError(null);
      setStatus("signing");
      const walletAddress = wallet.publicKey.toBase58();
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ wallet_address: walletAddress })
      });
      const challenge = await responseJson(nonceResponse, "login-challenge-failed");

      let signed = null;
      if (wallet.signMessage) {
        const signature = await wallet.signMessage(textEncoder.encode(challenge.message));
        signed = {
          signature: bs58.encode(signature),
          message: challenge.message
        };
      }
      if (!signed && wallet.wallet?.adapter?.signIn) {
        signed = await trySignIn(wallet.wallet.adapter, challenge);
      }
      if (!signed) {
        throw new Error("wallet-signing-cancelled");
      }

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          challenge: challenge.challenge,
          wallet_address: walletAddress,
          signature: signed.signature,
          message: signed.message
        })
      });
      const verify = await responseJson(verifyResponse, "wallet-verification-failed");
      setSession({ loading: false, ...verify });
    } catch (cause) {
      setStatus("gate");
      setError(signInError(cause));
    }
  }

  async function logout() {
    if (!DEMO_MODE) {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    }
    setSession({ loading: false, authenticated: false });
    setSummary(null);
    setStatus("gate");
  }

  if (!session.authenticated) {
    return (
      <main className="dashboard gate-screen">
        <WalletGate
          walletConnected={Boolean(wallet.publicKey)}
          configured={session.configured}
          loading={session.loading || status === "signing"}
          error={error}
          onSignIn={signIn}
        />
      </main>
    );
  }

  return (
    <main className="dashboard">
      <DashboardShell
        summary={summary}
        status={status}
        error={error}
        telemetry={telemetry}
        walletAddress={session.wallet_address}
        onRefresh={refreshSummary}
        onLogout={logout}
      />
    </main>
  );
}

function WalletGate({ walletConnected, configured, loading, error, onSignIn }) {
  return (
    <section className="gate-panel" aria-label="vnem Hermes wallet gate">
      <div className="gate-copy">
        <img className="gate-logo" src={logoUrl} alt="" />
        <div className="product-lock"><LockKeyhole size={18} /> owner access</div>
        <h1>vnem hermes</h1>
        <p>Connect an allowlisted Solana wallet and sign the dashboard challenge.</p>
      </div>
      <div className="gate-actions">
        <WalletMultiButton />
        <button className="primary-action" type="button" onClick={onSignIn} disabled={!walletConnected || loading || configured === false}>
          <ShieldCheck size={18} />
          {loading ? "waiting for signature" : "sign in"}
        </button>
      </div>
      <div className="gate-status">
        <span className={walletConnected ? "ok" : ""}>wallet {walletConnected ? "connected" : "required"}</span>
        <span className={configured !== false ? "ok" : "bad"}>{configured === false ? "allowlist not configured" : "allowlist enforced"}</span>
        {error ? <span className="bad">{humanize(error)}</span> : null}
      </div>
    </section>
  );
}

function DashboardShell({ summary, status, error, telemetry, walletAddress, onRefresh, onLogout }) {
  const [stageFilter, setStageFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [query, setQuery] = useState("");
  const connector = useVnemConnector();
  const pipelineExecution = usePipelineExecution(telemetry, summary);

  const findings = useMemo(() => (summary?.findings ?? []).map(normalizeFinding), [summary?.findings]);
  const originOptions = unique(["all", ...findings.map((finding) => finding.origin.label)]);
  const filtered = useMemo(() => findings.filter((finding) => {
    const text = `${finding.title} ${finding.summary} ${finding.origin.label} ${finding.stage.label}`.toLowerCase();
    return (stageFilter === "all" || finding.stage.key === stageFilter) &&
      (riskFilter === "all" || finding.risk.key === riskFilter) &&
      (originFilter === "all" || finding.origin.label === originFilter) &&
      (!query || text.includes(query.toLowerCase()));
  }), [findings, stageFilter, riskFilter, originFilter, query]);

  useEffect(() => {
    connector.refreshStatus();
    connector.fetchPreview();
  }, [connector.refreshStatus, connector.fetchPreview]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          <img className="dashboard-logo" src={logoUrl} alt="" />
          <div>
            <p className="eyebrow">vnem hermes</p>
            <h1>Owner dashboard</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="wallet-chip"><Wallet size={15} /> {shortWallet(walletAddress)}</span>
          <button type="button" className="icon-button" onClick={onRefresh} aria-label="Refresh dashboard">
            <RefreshCcw size={18} />
          </button>
          <button type="button" className="icon-button" onClick={onLogout} aria-label="Disconnect">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <section className="status-strip" aria-label="Hermes status">
        <Kpi icon={Clock3} label="last sync" value={formatCompactDateTime(summary?.generated_at)} />
        <Kpi icon={Search} label="candidates today" value={summary?.aggregates?.today ?? 0} />
        <Kpi icon={AlertTriangle} label="watchlist" value={summary?.aggregates?.by_action?.watchlist ?? 0} />
        <Kpi icon={ShieldCheck} label="blocked" value={summary?.aggregates?.by_action?.blocked ?? 0} tone={(summary?.aggregates?.by_action?.blocked ?? 0) > 0 ? "warn" : "ok"} />
        <Kpi icon={Route} label="route errors" value={summary?.errors?.length ?? 0} tone={(summary?.errors?.length ?? 0) > 0 ? "warn" : "ok"} />
        <Kpi icon={Radio} label="telemetry" value={telemetry.status === "connected" ? "live" : humanize(telemetry.status ?? "offline")} tone={telemetry.status === "connected" ? "ok" : "warn"} />
      </section>

      <IntelligenceProviderDiagnostic provider={telemetry.intelligenceProvider} />

      {status === "error" ? <div className="inline-error">{humanize(error)}</div> : null}

      <TargetingConsole telemetry={telemetry} execution={pipelineExecution} />
      <AutonomousPipeline telemetry={telemetry} execution={pipelineExecution} />

      <section className="workspace-grid">
        <div className="main-column">
          <section className="panel findings-panel" aria-label="Findings">
            <div className="panel-head">
              <div>
                <p className="eyebrow">intelligence matrix</p>
                <h2>Research findings</h2>
              </div>
              <div className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="search signals, origins, stages" />
              </div>
            </div>
            <FindingFilters
              stageFilter={stageFilter}
              riskFilter={riskFilter}
              originFilter={originFilter}
              originOptions={originOptions}
              onStageFilter={setStageFilter}
              onRiskFilter={setRiskFilter}
              onOriginFilter={setOriginFilter}
            />
            <FindingsMatrix findings={filtered} loading={status === "loading"} />
          </section>

          <section className="panel timeline-panel" aria-label="Runs">
            <div className="panel-head">
              <div>
                <p className="eyebrow">runs</p>
                <h2>Scout timeline</h2>
              </div>
            </div>
            <RunTimeline runs={summary?.runs ?? []} />
          </section>
        </div>

        <aside className="side-column">
          <ConnectorPanel connector={connector} />

          <section className="panel" aria-label="Source health">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">routes</p>
                <h2>Source health</h2>
              </div>
            </div>
            <SourceHealth sources={summary?.source_health ?? []} />
          </section>

          <section className="panel digest-panel" aria-label="Digest">
            <div className="panel-head compact">
              <div>
                <p className="eyebrow">digest</p>
                <h2>Maintainer notes</h2>
              </div>
            </div>
            <MaintainerNotes digest={summary?.digest} />
          </section>
        </aside>
      </section>
    </>
  );
}

function IntelligenceProviderDiagnostic({ provider }) {
  const status = provider?.status ?? "missing_key";
  const active = status === "active";
  const rateLimited = status === "rate_limited";
  const tone = active ? "ok" : rateLimited ? "critical" : "review";
  const badgeText = active ? "Hermes 3 Active" : "Local Fallback Active";
  const model = provider?.model ?? "local-fallback";
  const latestError = provider?.errors?.[0] ?? null;
  const detail = active
    ? "OpenRouter inference is driving Research AI, Protection AI, and Giving AI stages when live cycles run."
    : providerFallbackDetail(status, latestError, provider);

  return (
    <section className={`provider-diagnostic ${active ? "active" : "fallback"}`} aria-label="Intelligence provider">
      <div className="provider-title">
        {active ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
        <div>
          <p className="eyebrow">intelligence provider</p>
          <h2>{active ? "OpenRouter Hermes inference online" : "Deterministic fallback online"}</h2>
        </div>
      </div>
      <div className="provider-state">
        <Badge tone={tone}>{badgeText}</Badge>
        <code>{model}</code>
      </div>
      <p>{detail}</p>
      {!active && latestError ? (
        <div className="provider-error">
          <span>{latestError.code ?? status}</span>
          <strong>{latestError.message ?? "OpenRouter provider fallback is active."}</strong>
          {latestError.retry_after ?? provider?.retry_after ? <em>retry after {latestError.retry_after ?? provider.retry_after}s</em> : null}
        </div>
      ) : null}
    </section>
  );
}

function providerFallbackDetail(status, latestError, provider) {
  if (status === "rate_limited") {
    return `OpenRouter free-tier limit was hit, so VNEM is using local deterministic fallback${latestError?.retry_after ?? provider?.retry_after ? ` until the retry window clears` : ""}.`;
  }
  if (status === "missing_key") {
    return "OPENROUTER_API_KEY is not configured, so VNEM is using local deterministic research, protection, and dispatch logic.";
  }
  return latestError?.message ?? "OpenRouter inference is unavailable for this cycle, so VNEM is using local deterministic fallback.";
}

function MaintainerNotes({ digest }) {
  const excerptBlocks = parseMaintainerBlocks(digest?.excerpt ?? "No digest available yet.");
  const actionBlocks = (digest?.maintainer_actions ?? [])
    .slice(0, 4)
    .flatMap((action) => parseMaintainerBlocks(action));

  return (
    <div className="maintainer-notes">
      <div className="note-blocks">
        {excerptBlocks.map((block, index) => (
          <p className="note-line" key={`excerpt-${index}`}>{renderNoteParts(block, `excerpt-${index}`)}</p>
        ))}
      </div>
      {actionBlocks.length > 0 ? (
        <ul className="note-actions">
          {actionBlocks.map((action, index) => (
            <li key={`action-${index}`}>{renderNoteParts(action, `action-${index}`)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function parseMaintainerBlocks(value) {
  return String(value ?? "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.split(/\s*\|\s*/))
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function renderNoteParts(value, keyPrefix) {
  const pattern = /(https?:\/\/[^\s]+|\bv?\d+(?:\.\d+){1,3}(?:[-+][\w.-]+)?\b|\b[a-f0-9]{8,40}\b)/gi;
  const parts = [];
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > lastIndex) {
      parts.push(<span key={`${keyPrefix}-text-${lastIndex}`}>{value.slice(lastIndex, match.index)}</span>);
    }
    const token = match[0].replace(/[),.;]+$/, "");
    const suffix = match[0].slice(token.length);
    if (/^https?:\/\//i.test(token)) {
      parts.push(
        <a className="note-link" href={token} target="_blank" rel="noreferrer" key={`${keyPrefix}-url-${match.index}`} aria-label={`Open ${linkLabel(token)}`}>
          <ExternalLink size={13} />
          {linkLabel(token)}
        </a>
      );
    } else {
      parts.push(<span className="note-token" key={`${keyPrefix}-token-${match.index}`}>{token}</span>);
    }
    if (suffix) {
      parts.push(<span key={`${keyPrefix}-suffix-${match.index}`}>{suffix}</span>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) {
    parts.push(<span key={`${keyPrefix}-text-end`}>{value.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : value;
}

function linkLabel(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function FindingFilters({ stageFilter, riskFilter, originFilter, originOptions, onStageFilter, onRiskFilter, onOriginFilter }) {
  return (
    <div className="filter-console" aria-label="Finding filters">
      <div className="filter-console-title">
        <Filter size={15} />
        <span>tactical filter block</span>
      </div>
      <SegmentedControl
        label="agent stage"
        value={stageFilter}
        options={[
          ["all", "All"],
          ["research", "Research"],
          ["protection", "Protection"],
          ["giving", "Giving"]
        ]}
        onChange={onStageFilter}
      />
      <SegmentedControl
        label="risk tier"
        value={riskFilter}
        options={[
          ["all", "All"],
          ["low", "Low"],
          ["review", "Review"],
          ["critical", "Critical"]
        ]}
        onChange={onRiskFilter}
      />
      <label className="origin-filter">
        <span>origin source</span>
        <select value={originFilter} onChange={(event) => onOriginFilter(event.target.value)}>
          {originOptions.map((option) => (
            <option key={option} value={option}>{option === "all" ? "All Sources" : option}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className="segmented-control">
      <span>{label}</span>
      <div>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            className={value === key ? "active" : ""}
            onClick={() => onChange(key)}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConnectorPanel({ connector }) {
  const clients = connector.clients ?? [];
  const linkedCount = clients.filter((client) => client.vnem_connection_present).length;

  async function refreshConnectors() {
    await Promise.all([connector.refreshStatus(), connector.fetchPreview()]);
  }

  return (
    <section className="panel connector-panel" aria-label="Local AI client connectors">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">connectors</p>
          <h2>Local clients</h2>
        </div>
        <button type="button" className="icon-button" onClick={refreshConnectors} aria-label="Refresh connector status">
          <RefreshCcw size={17} />
        </button>
      </div>
      <div className="connector-summary">
        <Badge tone={linkedCount > 0 ? "ok" : "review"}>{linkedCount} linked</Badge>
        <Badge tone={connector.isProcessing ? "watchlist" : "ok"}>{connector.isProcessing ? "working" : "ready"}</Badge>
      </div>
      {connector.systemError ? <ConnectorError error={connector.systemError} /> : null}
      <div className="connector-list">
        {clients.length === 0 ? (
          <div className="empty-state">Start the local app server to inspect client connectors.</div>
        ) : clients.map((client) => (
          <ConnectorClientRow
            key={client.id}
            client={client}
            preview={connector.previewData?.[client.id]}
            disabled={connector.isProcessing}
            onToggle={connector.toggleClientLink}
          />
        ))}
      </div>
    </section>
  );
}

function ConnectorClientRow({ client, preview, disabled, onToggle }) {
  const state = connectorState(client);
  const action = connectorAction(client, preview);
  const targetPath = preview?.selected_config_path ?? client.config_files?.find((file) => file.exists)?.path;

  return (
    <div className="connector-row">
      <div className="connector-row-main">
        <strong>{client.display_name ?? client.id}</strong>
        <span>{targetPath ?? "no local config path selected"}</span>
      </div>
      <div className="connector-row-meta">
        <Badge tone={state.tone}>{state.label}</Badge>
        {preview?.preview_status ? <Badge tone={preview.would_change ? "review" : "ok"}>{preview.preview_status}</Badge> : null}
      </div>
      <button
        type="button"
        className="secondary-action connector-action"
        onClick={() => onToggle(client.id, action)}
        disabled={disabled || !action}
      >
        <ShieldCheck size={15} />
        {action ?? "unavailable"}
      </button>
    </div>
  );
}

function ConnectorError({ error }) {
  return (
    <div className="connector-error" role="status">
      <AlertTriangle size={16} />
      <span>{humanize(error.error_code ?? error.error)}</span>
      {error.target_path ? <code>{error.target_path}</code> : null}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }) {
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RunTimeline({ runs }) {
  if (runs.length === 0) return <div className="empty-state">No Hermes candidate reports found.</div>;
  return (
    <div className="timeline">
      {runs.map((run) => (
        <div className="timeline-row" key={`${run.generated_at}-${run.mode}`}>
          <span className={`dot ${run.errors > 0 ? "warn" : ""}`} />
          <div>
            <strong>{run.mode}</strong>
            <span>{formatDateTime(run.generated_at)}</span>
          </div>
          <div>{run.candidates} total</div>
          <div>{run.fresh_candidates} fresh</div>
          <div>{run.errors} errors</div>
        </div>
      ))}
    </div>
  );
}

function SourceHealth({ sources }) {
  if (sources.length === 0) return <div className="empty-state">No source health data.</div>;
  return (
    <div className="source-list">
      {sources.map((source) => (
        <div className="source-row" key={source.route}>
          <span className={`route-state ${source.status}`} />
          <div>
            <strong>{source.route}</strong>
            <span>{source.candidates ?? 0} candidates / {source.errors ?? 0} errors</span>
          </div>
          <Badge tone={source.status}>{source.status}</Badge>
        </div>
      ))}
    </div>
  );
}

async function trySignIn(adapter, challenge) {
  try {
    const output = await withTimeout(
      adapter.signIn(challenge.sign_in_input),
      SIGN_IN_TIMEOUT_MS,
      "wallet-signin-unavailable"
    );
    const signature = output.signature instanceof Uint8Array ? bs58.encode(output.signature) : String(output.signature ?? "");
    const message = output.signedMessage instanceof Uint8Array
      ? textDecoder.decode(output.signedMessage)
      : String(output.signedMessage ?? challenge.message);
    return signature ? { signature, message } : null;
  } catch {
    return null;
  }
}

async function responseJson(response, fallbackError) {
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(response.ok ? "invalid-dashboard-api-response" : fallbackError);
    }
  }
  if (!response.ok) {
    throw new Error(body.error ?? fallbackError);
  }
  return body;
}

function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    })
  ]);
}

function signInError(cause) {
  const message = cause?.message ?? String(cause ?? "wallet-signing-cancelled");
  if (/User rejected|rejected|declined|cancel/i.test(message)) {
    return "wallet-signing-cancelled";
  }
  return message;
}

function formatDateTime(value) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatCompactDateTime(value) {
  if (!value) return "unknown";
  const date = new Date(value);
  const day = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date).replace(",", "");
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return `${day} ${time}`;
}

function shortWallet(value) {
  if (!value) return "not signed in";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function normalizeFinding(finding) {
  const origin = originDetails(finding.source_route);
  const riskScore = finding.repository_review?.risk_score ?? finding.metrics?.repo_risk_score ?? riskScoreFromFlags(finding.risk_flags);
  const trustScore = finding.repository_review?.trust_score ?? finding.metrics?.repo_trust_score ?? trustScoreFromTier(finding.suggested_trust_tier);
  const risk = riskDetails(finding.repository_review?.verdict, riskScore);
  return {
    id: finding.id,
    title: finding.title,
    sourceUrl: finding.source_url,
    summary: finding.signal_summary ?? finding.description ?? "No signal summary provided.",
    origin,
    trustScore: clampPercent(trustScore),
    trustLabel: trustScore >= 85 ? "Verified Source" : trustScore >= 60 ? "Needs Review" : "Unverified Lead",
    risk,
    stage: stageDetails(finding.recommended_action, risk.key),
    action: actionDetails(finding.recommended_action, risk.key)
  };
}

function originDetails(route) {
  const map = {
    "github-search": ["GitHub Scrape", "Repository discovery and source inspection"],
    "github-releases": ["GitHub Release", "Watched repository release feed"],
    "hacker-news": ["Dev Forum Signal", "Community discussion requiring primary-source validation"],
    "npm-search": ["Package Registry", "Package metadata and install-surface scan"],
    "mcp-registry": ["MCP Registry", "Model Context Protocol catalog route"],
    "watch-urls": ["Watch URL", "Maintainer-defined source monitor"],
    "dev-forum": ["OpenAI Dev Forum", "Implementation pattern from developer discussion"],
    "paper-scan": ["ArXiv Paper", "Research literature and benchmark scan"]
  };
  const [label, description] = map[route] ?? [humanize(route ?? "unknown route"), "Unmapped discovery route"];
  return { label, description };
}

function riskDetails(verdict, score) {
  const normalized = String(verdict ?? "").toLowerCase();
  if (normalized === "blocked" || score >= 75) {
    return { key: "critical", label: "CRITICAL / ISOLATED", detail: `Threat score ${clampPercent(score)}%` };
  }
  if (score >= 35) {
    return { key: "review", label: "REVIEW / SANDBOX", detail: `Threat score ${clampPercent(score)}%` };
  }
  return { key: "low", label: "LOW RISK / CLEAN", detail: `Threat score ${clampPercent(score)}%` };
}

function stageDetails(action, riskKey) {
  if (riskKey === "critical") return { key: "protection", label: "Protection AI" };
  if (["review", "promote", "approved"].includes(action)) return { key: "giving", label: "Giving AI" };
  return { key: "research", label: "Research AI" };
}

function actionDetails(action, riskKey) {
  if (riskKey === "critical" || action === "blocked") {
    return { label: "Isolated by Protection AI", detail: "Repository dispatch blocked until manual review" };
  }
  if (action === "watchlist") {
    return { label: "Scanning", detail: "Waiting for primary source or stronger trust signal" };
  }
  if (["promote", "approved", "committed"].includes(action)) {
    return { label: "Committed to Repo", detail: "Dispatch accepted into the simulated repository lane" };
  }
  return { label: "Pending Approval", detail: "Giving AI can package this once maintainer review passes" };
}

function trustScoreFromTier(tier) {
  const map = {
    curated: 97,
    verified: 94,
    promising: 88,
    watchlist: 62,
    unreviewed: 38,
    suspicious: 22,
    blocked: 12
  };
  return map[String(tier ?? "").toLowerCase()] ?? 50;
}

function riskScoreFromFlags(flags = []) {
  return Math.min(100, (flags?.length ?? 0) * 18);
}

function clampPercent(value) {
  const number = Number(value ?? 0);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : 0)));
}

function connectorState(client) {
  if (client.vnem_connection_present) {
    return { label: "linked", tone: "ok" };
  }
  if (client.custom_mcp_hook_present) {
    return { label: "mcp ready", tone: "review" };
  }
  if (client.installed || client.config_profile_present) {
    return { label: "detected", tone: "promising" };
  }
  return { label: "missing", tone: "quiet" };
}

function connectorAction(client, preview) {
  if (!client.installed && !client.config_profile_present) {
    return null;
  }
  if (client.vnem_connection_present) {
    return "rollback";
  }
  if (preview?.would_change !== false) {
    return "apply";
  }
  return null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function humanize(value) {
  return String(value ?? "unknown").replace(/[-_]/g, " ");
}
