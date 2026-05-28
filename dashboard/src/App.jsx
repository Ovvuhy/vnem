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
  RefreshCcw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet
} from "lucide-react";
import { sampleSummary } from "./sampleSummary.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEMO_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).has("mock");
const OFFLINE_MODE = new URLSearchParams(window.location.search).has("offline");
const SIGN_IN_TIMEOUT_MS = 2500;

export default function App() {
  const wallet = useWallet();
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
        <img className="gate-logo" src="/assets/logo.png" alt="" />
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

function DashboardShell({ summary, status, error, walletAddress, onRefresh, onLogout }) {
  const [routeFilter, setRouteFilter] = useState("all");
  const [trustFilter, setTrustFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [query, setQuery] = useState("");

  const findings = summary?.findings ?? [];
  const routes = unique(["all", ...findings.map((finding) => finding.source_route)]);
  const trustTiers = unique(["all", ...findings.map((finding) => finding.suggested_trust_tier)]);
  const actions = unique(["all", ...findings.map((finding) => finding.recommended_action)]);
  const filtered = useMemo(() => findings.filter((finding) => {
    const text = `${finding.title} ${finding.signal_summary ?? ""} ${(finding.risk_flags ?? []).join(" ")}`.toLowerCase();
    return (routeFilter === "all" || finding.source_route === routeFilter) &&
      (trustFilter === "all" || finding.suggested_trust_tier === trustFilter) &&
      (actionFilter === "all" || finding.recommended_action === actionFilter) &&
      (!query || text.includes(query.toLowerCase()));
  }), [findings, routeFilter, trustFilter, actionFilter, query]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          <img className="dashboard-logo" src="/assets/logo.png" alt="" />
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
        <Kpi icon={Clock3} label="last sync" value={formatDateTime(summary?.generated_at)} />
        <Kpi icon={Search} label="candidates today" value={summary?.aggregates?.today ?? 0} />
        <Kpi icon={AlertTriangle} label="watchlist" value={summary?.aggregates?.by_action?.watchlist ?? 0} />
        <Kpi icon={Route} label="route errors" value={summary?.errors?.length ?? 0} tone={(summary?.errors?.length ?? 0) > 0 ? "warn" : "ok"} />
        <Kpi icon={Sparkles} label="brain" value={summary?.timers?.brain?.service_result ?? "unknown"} tone={summary?.timers?.brain?.service_result === "success" ? "ok" : "warn"} />
      </section>

      {status === "error" ? <div className="inline-error">{humanize(error)}</div> : null}

      <section className="workspace-grid">
        <div className="main-column">
          <section className="panel findings-panel" aria-label="Findings">
            <div className="panel-head">
              <div>
                <p className="eyebrow">findings</p>
                <h2>Agentic signals</h2>
              </div>
              <div className="search-box">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="filter findings" />
              </div>
            </div>
            <div className="filters" aria-label="Finding filters">
              <SelectFilter icon={Filter} label="route" value={routeFilter} options={routes} onChange={setRouteFilter} />
              <SelectFilter label="trust" value={trustFilter} options={trustTiers} onChange={setTrustFilter} />
              <SelectFilter label="action" value={actionFilter} options={actions} onChange={setActionFilter} />
            </div>
            <FindingsTable findings={filtered} loading={status === "loading"} />
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
            <p>{summary?.digest?.excerpt ?? "No digest available yet."}</p>
            <ul>
              {(summary?.digest?.maintainer_actions ?? []).slice(0, 4).map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          </section>
        </aside>
      </section>
    </>
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

function SelectFilter({ icon: Icon, label, value, options, onChange }) {
  return (
    <label className="filter-control">
      {Icon ? <Icon size={14} /> : null}
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function FindingsTable({ findings, loading }) {
  if (loading) {
    return <div className="empty-state">Loading Hermes summary.</div>;
  }
  if (findings.length === 0) {
    return <div className="empty-state">No findings match the active filters.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Signal</th>
            <th>Route</th>
            <th>Trust</th>
            <th>Action</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => (
            <tr key={finding.id}>
              <td data-label="Signal">
                <a className="finding-link" href={finding.source_url ?? "#"} target="_blank" rel="noreferrer">
                  {finding.title}
                  {finding.source_url ? <ExternalLink size={13} /> : null}
                </a>
                <p>{finding.signal_summary ?? finding.description}</p>
              </td>
              <td data-label="Route"><Badge>{finding.source_route}</Badge></td>
              <td data-label="Trust"><Badge tone={finding.suggested_trust_tier}>{finding.suggested_trust_tier}</Badge></td>
              <td data-label="Action"><Badge tone={finding.recommended_action}>{finding.recommended_action}</Badge></td>
              <td data-label="Risk">
                <div className="risk-list">
                  {(finding.risk_flags ?? []).length > 0
                    ? finding.risk_flags.map((flag) => <Badge key={flag} tone="risk">{flag}</Badge>)
                    : <span className="muted">none</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
            <span>{source.candidates ?? 0} candidates · {source.errors ?? 0} errors</span>
          </div>
          <Badge tone={source.status}>{source.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function Badge({ children, tone }) {
  return <span className={`badge ${tone ?? ""}`}>{children}</span>;
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

function shortWallet(value) {
  if (!value) return "not signed in";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function humanize(value) {
  return String(value ?? "unknown").replace(/-/g, " ");
}
