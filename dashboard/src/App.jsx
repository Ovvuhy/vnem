import { Component, useCallback, useEffect, useMemo, useState } from "react";
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
import { DispatchReviewModal } from "./components/DispatchReviewModal.jsx";
import { FindingsMatrix } from "./components/FindingsMatrix.jsx";
import { ImprovementMissionControl } from "./components/ImprovementMissionControl.jsx";
import { Badge } from "./components/PipelinePrimitives.jsx";
import { TargetingConsole } from "./components/TargetingConsole.jsx";
import { ArdOperatorConsole } from "./components/ArdOperatorConsole.jsx";
import { SelfImprovementControlRoom } from "./components/SelfImprovementControlRoom.jsx";
import { VnemCommandCenter } from "./components/VnemCommandCenter.jsx";
import { VnemSystemBrief } from "./components/VnemSystemBrief.jsx";
import { usePipelineExecution } from "./hooks/usePipelineExecution.js";
import { createVnemApiClient, normalizeRequestError } from "./lib/vnemApiClient.js";
import { deriveControlRoomStatus } from "./lib/controlRoomStatus.js";
import { deriveDashboardWorkStatus } from "./lib/dashboardWorkStatus.js";
import { derivePipelineVerdict } from "./lib/pipelineVerdicts.js";
import { CHANGES_BY_ARD_CONFIRMATION, deriveArdChangesCard, summarizeArdChangesAction } from "./lib/ardChangesBranch.js";
import { deriveArdOperatorModel } from "./lib/ardOperatorModel.js";
import { sampleSummary } from "./sampleSummary.js";
import { useTelemetry } from "./hooks/useTelemetry.js";
import { useBuilderHealth } from "./hooks/useBuilderHealth.js";
import { useVnemConnector } from "./hooks/useVnemConnector.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const DEMO_MODE = import.meta.env.DEV && new URLSearchParams(window.location.search).has("mock");
const OFFLINE_MODE = new URLSearchParams(window.location.search).has("offline");
const REAL_LOCAL_ARD_MODE = import.meta.env.DEV && !DEMO_MODE && new URLSearchParams(window.location.search).get("v") === "ard" && ["127.0.0.1", "localhost"].includes(window.location.hostname);
const SIGN_IN_TIMEOUT_MS = 2500;
const LOCAL_DEV_ALLOWED_WALLETS = import.meta.env?.VITE_DASHBOARD_LOCAL_ALLOWED_WALLET ?? "H62Ri1EExddxFKsLMn4nbmbxiCSxNRLtF8igPySLA23B";
const LOCAL_BACKEND_URL = import.meta.env?.VITE_VNEM_APP_SERVER_URL ?? "http://127.0.0.1:9099";

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
    if (REAL_LOCAL_ARD_MODE) {
      setSession({ loading: false, configured: true, authenticated: true, wallet_address: "LocalRealDashboard111111111111111111111111111" });
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
    const response = await fetch("/api/dashboard/summary", { credentials: "include", headers: REAL_LOCAL_ARD_MODE ? { "x-vnem-local-dashboard": "real" } : {} });
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
      setError(normalizeBackendFetchError(cause));
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
          expectedWallets={LOCAL_DEV_ALLOWED_WALLETS}
          backendUrl={LOCAL_BACKEND_URL}
          onSignIn={signIn}
        />
      </main>
    );
  }

  return (
    <main className="dashboard">
      <DashboardErrorBoundary>
        <DashboardShell
          summary={summary}
          status={status}
          error={error}
          telemetry={telemetry}
          walletAddress={session.wallet_address}
          onRefresh={refreshSummary}
          onLogout={logout}
        />
      </DashboardErrorBoundary>
    </main>
  );
}

class DashboardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("VNEM dashboard render error", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return <section className="panel"><div className="inline-error">Dashboard render error: {this.state.error.message ?? String(this.state.error)}</div></section>;
    }
    return this.props.children;
  }
}

function WalletGate({ walletConnected, configured, loading, error, expectedWallets, backendUrl, onSignIn }) {
  return (
    <section className="gate-panel" aria-label="vnem Hermes wallet gate">
      <div className="gate-copy">
        <img className="gate-logo" src={logoUrl} alt="" />
        <div className="product-lock"><LockKeyhole size={18} /> owner access</div>
        <h1>ARD — AI Research Dashboard</h1>
        <p>Connect an allowlisted Solana wallet and sign the dashboard challenge. Local ARD needs the VNEM backend running at {backendUrl}.</p>
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
      <div className="gate-status gate-diagnostics">
        <span>backend: {backendUrl}</span>
        <span>local allowlisted wallets: {formatWalletAllowlist(expectedWallets)}</span>
        <span>launch: npm run ard:dev</span>
        {error ? <span>{ownerGateDiagnostic(error, expectedWallets, backendUrl)}</span> : null}
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
  const apiClient = useMemo(() => createVnemApiClient(), []);
  const builderHealth = useBuilderHealth(apiClient);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [dispatchReview, setDispatchReview] = useState(null);
  const [dispatchStatus, setDispatchStatus] = useState("idle");
  const [dispatchError, setDispatchError] = useState(null);
  const [branchPreview, setBranchPreview] = useState(null);
  const [controlActionStatus, setControlActionStatus] = useState("idle");
  const [controlActionError, setControlActionError] = useState(null);
  const [prepareControlOpen, setPrepareControlOpen] = useState(false);
  const [prepareConfirmText, setPrepareConfirmText] = useState("");
  const [ardPipelineRun, setArdPipelineRun] = useState(null);
  const [ardPipelineStatus, setArdPipelineStatus] = useState("idle");
  const [ardPipelineError, setArdPipelineError] = useState(null);
  const [ardChangesStatus, setArdChangesStatus] = useState(null);
  const [ardChangesActionStatus, setArdChangesActionStatus] = useState("idle");
  const [ardChangesError, setArdChangesError] = useState(null);
  const [ardChangesConfirmation, setArdChangesConfirmation] = useState("");
  const [selectedArdWorkPackageId, setSelectedArdWorkPackageId] = useState(null);
  const ardChangesCard = useMemo(() => deriveArdChangesCard({ status: ardChangesStatus }), [ardChangesStatus]);
  const ardChangesAction = useMemo(() => summarizeArdChangesAction(ardChangesActionStatus), [ardChangesActionStatus]);
  const pipelineExecution = usePipelineExecution(telemetry, summary);
  const rawWorkStatus = useMemo(() => deriveDashboardWorkStatus({ telemetry, summary, execution: pipelineExecution, connector, branchPreview }), [telemetry, summary, pipelineExecution, connector, branchPreview]);
  const workStatus = useMemo(() => normalizeDashboardWorkStatus(rawWorkStatus), [rawWorkStatus]);
  const controlRoom = useMemo(() => deriveControlRoomStatus({ telemetry, summary, execution: pipelineExecution, connector, branchPreview, workStatus, builderHealthState: builderHealth }), [telemetry, summary, pipelineExecution, connector, branchPreview, workStatus, builderHealth]);
  const currentArdPipelineRun = ardPipelineRun ?? telemetry.ardBrowserPipeline ?? null;
  const operatorModel = useMemo(() => deriveArdOperatorModel({
    controlRoom,
    pipelineRun: currentArdPipelineRun,
    pipelineStatus: ardPipelineStatus,
    pipelineError: ardPipelineError,
    ardChangesCard,
    ardChangesAction,
    telemetry,
    workStatus,
    summary,
    builderHealth,
    branchPreview,
    selectedWorkPackageId: selectedArdWorkPackageId
  }), [controlRoom, currentArdPipelineRun, ardPipelineStatus, ardPipelineError, ardChangesCard, ardChangesAction, telemetry, workStatus, summary, builderHealth, branchPreview, selectedArdWorkPackageId]);

  const findings = useMemo(() => {
    const dashboardFindings = (summary?.findings ?? []).map(normalizeFinding);
    const liveFindings = (telemetry.activeIngestions ?? [])
      .filter((ingestion) => ingestion?.staged_dispatch?.file_name || ingestion?.approved_dispatch?.file_name)
      .map(normalizeIngestionFinding);
    const byId = new Map();
    for (const finding of [...liveFindings, ...dashboardFindings]) {
      byId.set(finding.id, finding);
    }
    return [...byId.values()];
  }, [summary?.findings, telemetry.activeIngestions]);
  const originOptions = unique(["all", ...findings.map((finding) => finding.origin.label)]);
  const filtered = useMemo(() => findings.filter((finding) => {
    const text = `${finding.title} ${finding.summary} ${finding.origin.label} ${finding.stage.label} ${finding.verdict.label} ${finding.verdict.reason}`.toLowerCase();
    return (stageFilter === "all" || finding.stage.key === stageFilter) &&
      (riskFilter === "all" || finding.verdict.verdict === riskFilter) &&
      (originFilter === "all" || finding.origin.label === originFilter) &&
      (!query || text.includes(query.toLowerCase()));
  }), [findings, stageFilter, riskFilter, originFilter, query]);

  useEffect(() => {
    connector.refreshStatus();
    connector.fetchPreview();
  }, [connector.refreshStatus, connector.fetchPreview]);

  useEffect(() => {
    if (telemetry.ardBrowserPipeline) {
      setArdPipelineRun(telemetry.ardBrowserPipeline);
    }
  }, [telemetry.ardBrowserPipeline]);

  const refreshArdChangesStatus = useCallback(async () => {
    try {
      const result = await apiClient.ardChangesStatus();
      setArdChangesStatus(result);
      return result;
    } catch (cause) {
      setArdChangesError(normalizeRequestError(cause));
      return null;
    }
  }, [apiClient]);

  useEffect(() => {
    void refreshArdChangesStatus();
  }, [refreshArdChangesStatus]);

  useEffect(() => {
    if (!DEMO_MODE && currentArdPipelineRun === null) {
      apiClient.latestArdPipeline()
        .then((result) => {
          if (result?.pipeline) setArdPipelineRun(result.pipeline);
        })
        .catch(() => null);
    }
  }, [apiClient, currentArdPipelineRun]);

  const runArdPipelineFromBrowser = useCallback(async () => {
    if (ardPipelineStatus === "running") return;
    setArdPipelineStatus("running");
    setArdPipelineError(null);
    try {
      const result = await apiClient.runArdPipeline({
        mission: "ARD Browser Pipeline v1",
        pushMode: "fixture-remote"
      });
      setArdPipelineRun(result);
      await telemetry.refreshTelemetryHistory?.();
      setArdPipelineStatus("completed");
    } catch (cause) {
      setArdPipelineError(normalizeRequestError(cause));
      setArdPipelineStatus("error");
    }
  }, [apiClient, ardPipelineStatus, telemetry]);

  const previewArdChanges = useCallback(async () => {
    if (ardChangesActionStatus === "previewing") return;
    setArdChangesActionStatus("previewing");
    setArdChangesError(null);
    try {
      const result = await apiClient.previewArdChanges({ title: "Changes by ARD dashboard preview", runId: `${currentArdPipelineRun?.runId ?? "dashboard"}-preview`, workPackage: operatorModel.changesByArd.selectedWorkPackage });
      setArdChangesStatus((current) => ({ ...(current ?? {}), lastPreview: result, mode: result.mode, ok: result.ok, displayName: result.displayName, branchName: result.branchName, branchValid: result.branchValid, mainProtected: result.mainProtected }));
      setArdChangesActionStatus("idle");
      await telemetry.refreshTelemetryHistory?.();
    } catch (cause) {
      setArdChangesError(normalizeRequestError(cause));
      setArdChangesActionStatus("error");
    }
  }, [apiClient, ardChangesActionStatus, telemetry, currentArdPipelineRun?.runId, operatorModel.changesByArd.selectedWorkPackage]);

  const prepareArdChanges = useCallback(async () => {
    if (ardChangesActionStatus === "preparing") return;
    setArdChangesActionStatus("preparing");
    setArdChangesError(null);
    try {
      const result = await apiClient.prepareArdChanges({ title: "Changes by ARD dashboard commit", runId: `${currentArdPipelineRun?.runId ?? "dashboard"}-prepare`, workPackage: operatorModel.changesByArd.selectedWorkPackage });
      setArdChangesStatus((current) => ({ ...(current ?? {}), lastPrepared: result, mode: result.mode, ok: result.ok, displayName: result.displayName, branchName: result.branchName, branchValid: result.branchValid, mainProtected: result.mainProtected }));
      setArdChangesActionStatus("idle");
      await telemetry.refreshTelemetryHistory?.();
    } catch (cause) {
      setArdChangesError(normalizeRequestError(cause));
      setArdChangesActionStatus("error");
    }
  }, [apiClient, ardChangesActionStatus, telemetry, currentArdPipelineRun?.runId, operatorModel.changesByArd.selectedWorkPackage]);

  const pushArdChangesBranch = useCallback(async () => {
    if (ardChangesConfirmation !== CHANGES_BY_ARD_CONFIRMATION || ardChangesActionStatus === "pushing") return;
    setArdChangesActionStatus("pushing");
    setArdChangesError(null);
    try {
      const result = await apiClient.pushArdChanges({ confirmation: ardChangesConfirmation });
      setArdChangesStatus((current) => ({ ...(current ?? {}), lastPushed: result, mode: result.mode, ok: result.ok, displayName: result.displayName, branchName: result.branchName, branchValid: result.branchValid, mainProtected: result.mainProtected }));
      setArdChangesConfirmation("");
      setArdChangesActionStatus("idle");
      await telemetry.refreshTelemetryHistory?.();
    } catch (cause) {
      setArdChangesError(normalizeRequestError(cause));
      setArdChangesActionStatus("error");
    }
  }, [apiClient, ardChangesActionStatus, ardChangesConfirmation, telemetry]);

  const openDispatchReview = useCallback(async (finding) => {
    if (!finding?.dispatch?.id || finding.dispatch.status !== "staged_for_review") {
      return;
    }
    setSelectedFinding(finding);
    setDispatchReview(null);
    setDispatchError(null);
    setDispatchStatus("loading");
    try {
      const review = await apiClient.reviewDispatch(finding.dispatch.id);
      setDispatchReview(review);
      setDispatchStatus("ready");
    } catch (cause) {
      setDispatchError(normalizeRequestError(cause));
      setDispatchStatus("error");
    }
  }, [apiClient]);

  const openCandidateReview = useCallback((candidate) => {
    const matchingFinding = findings.find((finding) => finding.id === candidate?.id);
    if (matchingFinding?.dispatch?.status === "staged_for_review") {
      void openDispatchReview(matchingFinding);
      return;
    }
    const fallbackFinding = matchingFinding ?? candidateToFinding(candidate);
    if (!fallbackFinding) return;
    setSelectedFinding(fallbackFinding);
    setDispatchReview({
      markdown: candidateMarkdown(candidate),
      dispatch: { file_name: "candidate-details.md" },
      candidateReview: { id: candidate.id, decisionSet: ["approve-for-giving", "reject-low-signal", "quarantine", "block"] }
    });
    setDispatchError(null);
    setDispatchStatus("ready");
  }, [findings, openDispatchReview]);

  useEffect(() => {
    function handleCandidateReview(event) {
      if (event?.detail) {
        openCandidateReview(event.detail);
      }
    }
    window.addEventListener("vnem:candidate-review", handleCandidateReview);
    return () => window.removeEventListener("vnem:candidate-review", handleCandidateReview);
  }, [openCandidateReview]);

  const closeDispatchReview = useCallback(() => {
    setSelectedFinding(null);
    setDispatchReview(null);
    setDispatchError(null);
    setDispatchStatus("idle");
  }, []);

  const approveSelectedDispatch = useCallback(async () => {
    if (!selectedFinding?.dispatch?.id) return;
    setDispatchStatus("approving");
    setDispatchError(null);
    try {
      await apiClient.approveDispatch(selectedFinding.dispatch.id);
      await telemetry.refreshTelemetryHistory?.();
      closeDispatchReview();
    } catch (cause) {
      setDispatchError(normalizeRequestError(cause));
      setDispatchStatus("ready");
    }
  }, [apiClient, closeDispatchReview, selectedFinding?.dispatch?.id, telemetry]);

  const rejectSelectedDispatch = useCallback(async () => {
    if (!selectedFinding?.dispatch?.id) return;
    setDispatchStatus("rejecting");
    setDispatchError(null);
    try {
      await apiClient.rejectDispatch(selectedFinding.dispatch.id);
      await telemetry.refreshTelemetryHistory?.();
      closeDispatchReview();
    } catch (cause) {
      setDispatchError(normalizeRequestError(cause));
      setDispatchStatus("ready");
    }
  }, [apiClient, closeDispatchReview, selectedFinding?.dispatch?.id, telemetry]);

  const reviewSelectedCandidate = useCallback(async (decision, notes) => {
    const candidateId = dispatchReview?.candidateReview?.id ?? selectedFinding?.id;
    if (!candidateId) return;
    setDispatchStatus("candidate-reviewing");
    setDispatchError(null);
    try {
      const result = await apiClient.reviewCandidate(candidateId, {
        decision,
        notes,
        reviewedBy: "manual-owner"
      });
      if (result?.ok === false) {
        setDispatchError(result);
        setDispatchStatus("ready");
        return;
      }
      await telemetry.refreshTelemetryHistory?.();
      closeDispatchReview();
    } catch (cause) {
      setDispatchError(normalizeRequestError(cause));
      setDispatchStatus("ready");
    }
  }, [apiClient, closeDispatchReview, dispatchReview?.candidateReview?.id, selectedFinding?.id, telemetry]);

  const reviewControlCandidate = useCallback(async (candidate, decision, notes) => {
    const candidateId = candidate?.id;
    if (!candidateId) return;
    setControlActionStatus("reviewing-candidate");
    setControlActionError(null);
    try {
      const result = await apiClient.reviewCandidate(candidateId, {
        decision,
        notes,
        reviewedBy: "manual-owner"
      });
      if (result?.ok === false) {
        setControlActionError(result);
        setControlActionStatus("idle");
        return;
      }
      await telemetry.refreshTelemetryHistory?.();
      setControlActionStatus("idle");
    } catch (cause) {
      setControlActionError(normalizeRequestError(cause));
      setControlActionStatus("idle");
      throw cause;
    }
  }, [apiClient, telemetry]);

  const previewControlBranch = useCallback(async () => {
    if (!controlRoom.branchWorkbench.canPreview || controlActionStatus === "previewing") return;
    setControlActionStatus("previewing");
    setControlActionError(null);
    try {
      const result = await apiClient.previewGivingBranch({
        sourceMissionId: controlRoom.run.runId,
        missionTitle: controlRoom.run.missionTitle,
        branchName: controlRoom.branchWorkbench.branchName,
        baseBranch: controlRoom.branchWorkbench.baseBranch,
        includedCandidates: controlRoom.branchWorkbench.includedCandidates,
        excludedCandidates: controlRoom.branchWorkbench.excludedCandidates,
        validationCommands: controlRoom.branchWorkbench.validationCommands
      });
      setBranchPreview(result);
      setControlActionStatus("idle");
      await telemetry.refreshTelemetryHistory?.();
    } catch (cause) {
      setControlActionError(normalizeRequestError(cause));
      setControlActionStatus("idle");
    }
  }, [apiClient, controlActionStatus, controlRoom.branchWorkbench, controlRoom.run, telemetry]);

  const prepareControlBranch = useCallback(async () => {
    if (prepareConfirmText !== controlRoom.branchWorkbench.branchName && prepareConfirmText !== "prepare-giving-branch") return;
    setControlActionStatus("preparing");
    setControlActionError(null);
    try {
      const result = await apiClient.prepareGivingBranch({
        sourceMissionId: controlRoom.run.runId,
        missionTitle: controlRoom.run.missionTitle,
        branchName: controlRoom.branchWorkbench.branchName,
        baseBranch: controlRoom.branchWorkbench.baseBranch,
        includedCandidates: controlRoom.branchWorkbench.includedCandidates,
        excludedCandidates: controlRoom.branchWorkbench.excludedCandidates,
        validationCommands: controlRoom.branchWorkbench.validationCommands,
        confirm: "prepare-giving-branch"
      });
      setBranchPreview(result);
      setPrepareControlOpen(false);
      setPrepareConfirmText("");
      setControlActionStatus("idle");
      await telemetry.refreshTelemetryHistory?.();
    } catch (cause) {
      setControlActionError(normalizeRequestError(cause));
      setControlActionStatus("idle");
    }
  }, [apiClient, controlRoom.branchWorkbench, controlRoom.run, prepareConfirmText, telemetry]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          <img className="dashboard-logo" src={logoUrl} alt="" />
          <div>
            <p className="eyebrow">ARD — AI Research Dashboard</p>
            <h1>ARD — AI Research Dashboard</h1>
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

      {status === "error" ? <div className="inline-error">{humanize(error)}</div> : null}

      <ArdOperatorConsole
        model={operatorModel}
        onRunPipeline={runArdPipelineFromBrowser}
        pipelineBusy={ardPipelineStatus === "running"}
        pipelineError={ardPipelineError}
        onReviewCandidate={openCandidateReview}
        selectedWorkPackageId={selectedArdWorkPackageId}
        onSelectWorkPackage={setSelectedArdWorkPackageId}
        onPreviewChanges={previewArdChanges}
        onPrepareChanges={prepareArdChanges}
        onPushChanges={pushArdChangesBranch}
        changesBusy={ardChangesActionStatus}
        changesError={ardChangesError}
        changesConfirmation={ardChangesConfirmation}
        onChangesConfirmationChange={setArdChangesConfirmation}
        advancedChildren={
          <>
            <DashboardErrorBoundary label="Advanced dashboard panels">
              <VnemSystemBrief telemetry={telemetry} execution={pipelineExecution} summary={summary} connector={connector} />
              <IntelligenceProviderDiagnostic provider={telemetry.intelligenceProvider} />
              <SelfImprovementControlRoom
                controlRoom={controlRoom}
                pipelineRun={currentArdPipelineRun}
                pipelineStatus={ardPipelineStatus}
                pipelineError={ardPipelineError}
                onRunPipeline={runArdPipelineFromBrowser}
                onAdvance={() => telemetry.refreshTelemetryHistory?.()}
                onReviewCandidate={openCandidateReview}
                onCandidateReviewDecision={reviewControlCandidate}
                onPreviewBranch={previewControlBranch}
                onOpenPrepare={() => setPrepareControlOpen(true)}
                onRefreshBuilderHealth={builderHealth.refresh}
                busy={["previewing", "preparing", "reviewing-candidate"].includes(controlActionStatus) || ardPipelineStatus === "running"}
              />
              {controlActionError ? <div className="inline-error">{controlActionError.message ?? controlActionError.error ?? "Control-room action failed"}</div> : null}
              <AutonomousPipeline telemetry={telemetry} execution={pipelineExecution} />
              <section className="candidate-queue panel" aria-label="Top candidate queue">
                <div className="panel-head compact">
                  <div>
                    <p className="eyebrow">candidate queue</p>
                    <h2>Top 5 to review</h2>
                  </div>
                  <Badge tone={workStatus.triage.branchEligible > 0 ? "ok" : "review"}>{workStatus.triage.branchEligible} branch-eligible</Badge>
                </div>
                <CandidateQueue candidates={workStatus.topCandidates} triage={workStatus.triage} onReviewCandidate={openCandidateReview} />
              </section>
              <VnemCommandCenter
                workStatus={workStatus}
                telemetry={telemetry}
                apiClient={apiClient}
                onBranchPreview={setBranchPreview}
                onBranchPrepared={setBranchPreview}
                onReviewCandidate={openCandidateReview}
              />
            <ImprovementMissionControl telemetry={telemetry} summary={summary} apiClient={apiClient} branchPreview={branchPreview} onBranchPreview={setBranchPreview} />
            <TargetingConsole telemetry={telemetry} execution={pipelineExecution} />
            <section className="workspace-grid details-workspace">
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
                  <FindingsMatrix findings={filtered} loading={status === "loading"} onReviewFinding={openDispatchReview} />
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
            </DashboardErrorBoundary>
          </>
        }
      />

      {prepareControlOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="review-modal prepare-modal" role="dialog" aria-modal="true" aria-label="Prepare Giving branch confirmation">
            <button className="icon-button modal-close" type="button" onClick={() => setPrepareControlOpen(false)} aria-label="Close prepare confirmation">×</button>
            <p className="eyebrow">Giving branch workbench</p>
            <h2>Prepare Giving branch</h2>
            <p>This prepares a review branch only. It does not merge to main and it does not auto-approve candidates.</p>
            <div className="prepare-plan-grid">
              <span>Branch</span><strong>{controlRoom.branchWorkbench.branchName}</strong>
              <span>Base</span><strong>{controlRoom.branchWorkbench.baseBranch}</strong>
              <span>Included</span><strong>{controlRoom.branchWorkbench.includedCandidates.length} candidates</strong>
              <span>Excluded</span><strong>{controlRoom.branchWorkbench.excludedCandidates.length} candidates</strong>
            </div>
            <p className="inline-warning">Exact confirmation is required. Blocked/quarantined candidates and unreviewed needs-review candidates must not be included.</p>
            <label className="confirm-field">
              Type exact branch name or prepare-giving-branch
              <input value={prepareConfirmText} onChange={(event) => setPrepareConfirmText(event.target.value)} placeholder={controlRoom.branchWorkbench.branchName} />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-action" onClick={() => setPrepareControlOpen(false)}>Cancel</button>
              <button type="button" className="primary-action" onClick={prepareControlBranch} disabled={controlActionStatus === "preparing" || (prepareConfirmText !== controlRoom.branchWorkbench.branchName && prepareConfirmText !== "prepare-giving-branch")}>
                {controlActionStatus === "preparing" ? "Preparing and validating..." : "Prepare Giving branch"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DispatchReviewModal
        finding={selectedFinding}
        review={dispatchReview}
        status={dispatchStatus}
        error={dispatchError}
        onClose={closeDispatchReview}
        onApprove={approveSelectedDispatch}
        onReject={rejectSelectedDispatch}
        onCandidateReview={reviewSelectedCandidate}
      />
    </>
  );
}

function CandidateQueue({ candidates, triage = {}, onReviewCandidate }) {
  const safeTriage = {
    total: 0,
    alreadyIndexed: 0,
    missingLicense: 0,
    weakSource: 0,
    duplicateOrLowSignal: 0,
    needsPrimarySource: 0,
    suspiciousPackage: 0,
    blocked: 0,
    quarantined: 0,
    ...triage
  };
  if (candidates.length === 0) {
    return <div className="empty-state">No candidates yet. Start or redeploy a focused mission to give Research AI real work.</div>;
  }
  return (
    <div className="candidate-queue-grid">
      <div className="triage-summary">
        <span><strong>{safeTriage.total}</strong> total</span>
        <span><strong>{safeTriage.alreadyIndexed}</strong> already indexed</span>
        <span><strong>{safeTriage.missingLicense}</strong> missing license</span>
        <span><strong>{safeTriage.weakSource}</strong> weak source</span>
        <span><strong>{safeTriage.duplicateOrLowSignal}</strong> duplicate/low signal</span>
        <span><strong>{safeTriage.needsPrimarySource}</strong> needs primary source</span>
        <span><strong>{safeTriage.suspiciousPackage}</strong> suspicious package</span>
        <span><strong>{safeTriage.blocked + safeTriage.quarantined}</strong> isolated</span>
      </div>
      <div className="top-candidate-list">
        {candidates.map((candidate, index) => (
          <article className="top-candidate-card" key={candidate.id}>
            <div className="candidate-rank">#{index + 1}</div>
            <div className="candidate-main">
              <div className="candidate-title-line">
                <strong>{candidate.title}</strong>
                <Badge tone={candidate.verdictTone}>{candidate.verdictLabel}</Badge>
              </div>
              <p>{candidate.summary}</p>
              <div className="candidate-meta-row">
                <span>{candidate.sourceRoute}</span>
                <span>trust {candidate.trustScore}%</span>
                <span>risk {candidate.threatScore}%</span>
                <span>{candidate.whyNotBranchEligible}</span>
              </div>
              <div className="candidate-reasons">
                {candidate.triageReasons.map((reason) => <span key={`${candidate.id}-${reason.key}-${reason.label}`}>{reason.label}</span>)}
              </div>
            </div>
            <button className="secondary-action" type="button" onClick={() => onReviewCandidate(candidate)}>Review</button>
          </article>
        ))}
      </div>
    </div>
  );
}

function normalizeDashboardWorkStatus(status = {}) {
  const triage = {
    total: 0,
    branchEligible: 0,
    alreadyIndexed: 0,
    missingLicense: 0,
    weakSource: 0,
    duplicateOrLowSignal: 0,
    needsPrimarySource: 0,
    suspiciousPackage: 0,
    blocked: 0,
    quarantined: 0,
    counts: { total: 0, needsReview: 0 },
    ...(status.triage ?? {})
  };
  triage.counts = { total: 0, needsReview: 0, ...(triage.counts ?? {}) };
  return {
    topCandidates: [],
    dataMode: "unknown",
    activeStage: "idle",
    providerStatus: "unknown",
    providerLabel: "unknown provider state",
    backendLive: false,
    mission: { title: "No real ARD state loaded", goal: "Connect the local VNEM backend or run ARD dogfood.", query: "", givingBranch: { requestPayload: { branchName: "changes-by-ard", baseBranch: "main", includedCandidates: [], excludedCandidates: [], validationCommands: [] } } },
    blocker: { reason: "Real ARD state is not loaded yet." },
    nextAction: "Run the local backend/dogfood flow, then reload the real dashboard.",
    research: { state: "unknown", lastEventAgeLabel: "no real research event yet", currentRoute: "unknown" },
    protection: { state: "unknown" },
    giving: { branchStatus: "not prepared", branchName: "changes-by-ard", branchEligible: 0, previewStatus: "not ready", pushStatus: "not pushed", previewAvailable: false, prepareEnabled: false, prepareDisabledReason: "Preview Changes by ARD first." },
    ...status,
    status: { key: "start-research", label: "Start research", detail: "No current work status yet.", tone: "review", ...(status.status ?? {}) },
    mission: { title: "No real ARD state loaded", goal: "Connect the local VNEM backend or run ARD dogfood.", query: "", givingBranch: { requestPayload: { branchName: "changes-by-ard", baseBranch: "main", includedCandidates: [], excludedCandidates: [], validationCommands: [] } }, ...(status.mission ?? {}) },
    blocker: { reason: "Real ARD state is not loaded yet.", ...(status.blocker ?? {}) },
    research: { state: "unknown", lastEventAgeLabel: "no real research event yet", currentRoute: "unknown", ...(status.research ?? {}) },
    protection: { state: "unknown", ...(status.protection ?? {}) },
    giving: { branchStatus: "not prepared", branchName: "changes-by-ard", branchEligible: 0, previewStatus: "not ready", pushStatus: "not pushed", previewAvailable: false, prepareEnabled: false, prepareDisabledReason: "Preview Changes by ARD first.", ...(status.giving ?? {}) },
    triage
  };
}

function ArdChangesCard({ card, action, error, confirmation, onConfirmationChange, onPreview, onPrepare, onPush, busy }) {
  const pushUnlocked = confirmation === card.requiredConfirmation;
  return (
    <section className="panel ard-changes-card" aria-label="Changes by ARD protected branch">
      <div className="panel-head compact">
        <div>
          <p className="eyebrow">protected implementation lane</p>
          <h2>{card.displayName}</h2>
        </div>
        <Badge tone={card.statusLabel === "pushed" ? "ok" : card.statusLabel === "blocked" ? "critical" : "review"}>{card.statusLabel}</Badge>
      </div>
      <p className="muted-text">{card.warningCopy}</p>
      <div className="prepare-plan-grid">
        <span>Display name</span><strong>{card.displayName}</strong>
        <span>Git branch</span><strong>{card.branchName}</strong>
        <span>Main protected</span><strong>{card.mainProtected ? "yes" : "no"}</strong>
        <span>Mode</span><strong>{card.mode}</strong>
        <span>Last preview</span><strong>{card.lastPreview?.runId ?? "not prepared"}</strong>
        <span>Last prepared</span><strong>{card.lastPrepared?.commitHash ? shortHash(card.lastPrepared.commitHash) : "not prepared"}</strong>
        <span>Last pushed</span><strong>{card.lastPushed?.commitHash ? shortHash(card.lastPushed.commitHash) : "not pushed"}</strong>
      </div>
      <div className="control-actions compact-actions">
        <button type="button" className="secondary-action" onClick={onPreview} disabled={busy === "previewing"}>{busy === "previewing" ? action.label : card.buttonLabels.preview}</button>
        <button type="button" className="secondary-action" onClick={onPrepare} disabled={busy === "preparing"}>{busy === "preparing" ? action.label : card.buttonLabels.prepare}</button>
      </div>
      <label className="field-label" htmlFor="ard-changes-confirmation">Exact push confirmation</label>
      <textarea
        id="ard-changes-confirmation"
        className="review-notes"
        rows={2}
        value={confirmation}
        onChange={(event) => onConfirmationChange(event.target.value)}
        placeholder={card.requiredConfirmation}
      />
      <div className="control-actions compact-actions">
        <button type="button" className="primary-action" onClick={onPush} disabled={!pushUnlocked || busy === "pushing"}>{busy === "pushing" ? action.label : card.buttonLabels.push}</button>
        <span className={pushUnlocked ? "ok" : "muted-text"}>{pushUnlocked ? "confirmation matched" : "confirmation required"}</span>
      </div>
      {error ? <div className="inline-error">{error.message ?? error.error ?? "Changes by ARD action failed"}</div> : null}
      <p className="muted-text">No merge is performed here. ARD can push only {card.branchName}; main stays protected.</p>
    </section>
  );
}

function IntelligenceProviderDiagnostic({ provider }) {
  const status = provider?.status ?? "missing_key";
  const active = status === "active";
  const paused = status === "paused_for_backoff";
  const rateLimited = status === "rate_limited" || paused;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!paused) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [paused]);

  const tone = active ? "ok" : rateLimited ? "critical" : "review";
  const badgeText = active ? "Hermes 3 Active" : paused ? "Paused for Backoff" : "Local Fallback Active";
  const model = provider?.model ?? "local-fallback";
  const latestError = provider?.errors?.[0] ?? null;
  const retryRemaining = paused ? formatBackoffRemaining(provider?.retry_until, provider?.retry_after_ms, now) : null;
  const detail = active
    ? "OpenRouter inference is driving Research AI, Protection AI, and Giving AI stages when live cycles run."
    : providerFallbackDetail(status, latestError, provider);

  return (
    <section className={`provider-diagnostic ${active ? "active" : "fallback"}`} aria-label="Intelligence provider">
      <div className="provider-title">
        {active ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
        <div>
          <p className="eyebrow">intelligence provider</p>
          <h2>{active ? "OpenRouter Hermes inference online" : paused ? "OpenRouter backoff queue paused" : "Deterministic fallback online"}</h2>
        </div>
      </div>
      <div className="provider-state">
        <Badge tone={tone}>{badgeText}</Badge>
        <code>{model}</code>
      </div>
      <p>{detail}</p>
      {retryRemaining ? <div className="provider-countdown"><Clock3 size={15} /> resumes in <strong>{retryRemaining}</strong></div> : null}
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
  if (status === "paused_for_backoff") {
    return "OpenRouter asked VNEM to wait before another Hermes 3 inference request. The active intelligence payload remains queued and will continue after the backoff window.";
  }
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
        label="protection verdict"
        value={riskFilter}
        options={[
          ["all", "All"],
          ["allow", "Allow"],
          ["needs-review", "Review"],
          ["quarantine", "Quarantine"],
          ["blocked", "Blocked"]
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
  if (/Failed to fetch|NetworkError|Load failed|ERR_CONNECTION_REFUSED/i.test(message)) {
    return "backend-offline";
  }
  if (/User rejected|rejected|declined|cancel/i.test(message)) {
    return "wallet-signing-cancelled";
  }
  return message;
}

function normalizeBackendFetchError(cause) {
  const message = cause?.message ?? String(cause ?? "backend-offline");
  return /Failed to fetch|NetworkError|Load failed|ERR_CONNECTION_REFUSED/i.test(message) ? "backend-offline" : message;
}

function ownerGateDiagnostic(error, expectedWallets, backendUrl) {
  if (error === "backend-offline") return `Backend offline: ${backendUrl} is not reachable. Run npm run ard:dev or npm run ard:backend.`;
  if (error === "wallet-not-allowlisted") return `Wallet connected but not allowlisted for local dev. Expected one of ${formatWalletAllowlist(expectedWallets)}.`;
  if (error === "wallet-signing-cancelled") return "Wallet request was rejected by the user. Click sign in again and approve the wallet prompt.";
  if (error === "dashboard-auth-not-configured") return "Dashboard auth is not configured. Local ARD dev should provide a local-only auth secret and allowlist.";
  return "Check backend status, wallet connection, and the local allowlist before retrying.";
}

function formatBackoffRemaining(retryUntil, retryAfterMs, now) {
  const parsedRetryUntil = retryUntil ? Date.parse(retryUntil) : NaN;
  const parsedRetryAfter = Number(retryAfterMs);
  const targetMs = Number.isFinite(parsedRetryUntil)
    ? parsedRetryUntil
    : Number.isFinite(parsedRetryAfter)
      ? now + parsedRetryAfter
      : now;
  const remaining = Math.max(0, targetMs - now);
  const seconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${String(rest).padStart(2, "0")}s` : `${seconds}s`;
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

function formatWalletAllowlist(value) {
  const wallets = String(value ?? "")
    .split(",")
    .map((wallet) => wallet.trim())
    .filter(Boolean);
  if (!wallets.length) return "not configured";
  return wallets.map(shortWallet).join(", ");
}

function shortWallet(value) {
  if (!value) return "not signed in";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function shortHash(value) {
  if (!value) return "not prepared";
  return String(value).slice(0, 10);
}

function normalizeIngestionFinding(ingestion) {
  const origin = originDetails(ingestion.source_route);
  const verdict = derivePipelineVerdict(ingestion);
  const risk = riskDetails(verdict);
  const dispatchFile = ingestion.staged_dispatch ?? ingestion.approved_dispatch ?? null;
  return {
    id: ingestion.id,
    title: ingestion.title ?? ingestion.repository?.full_name ?? "Live intelligence dispatch",
    sourceUrl: ingestion.source_url ?? ingestion.repository?.html_url ?? null,
    summary: ingestion.latest_event?.message ?? ingestion.repository?.description ?? "Live intelligence dispatch staged by Giving AI.",
    origin,
    trustScore: verdict.trustScore,
    trustLabel: verdict.trustScore >= 85 ? "Verified Source" : verdict.trustScore >= 60 ? "Needs Review" : "Unverified Lead",
    risk,
    verdict,
    stage: stageDetails(ingestion.status === "completed" ? "approved" : "review", verdict),
    action: ingestion.status === "completed"
      ? { label: "Approved Dispatch", detail: "Dispatch accepted into .vnem/approved/ without executing code" }
      : actionDetails("review", verdict),
    dispatch: {
      id: ingestion.id,
      status: ingestion.status,
      fileName: dispatchFile?.file_name ?? null,
      generatedAt: dispatchFile?.generated_at ?? dispatchFile?.approved_at ?? null
    }
  };
}

function normalizeFinding(finding) {
  const origin = originDetails(finding.source_route);
  const verdict = derivePipelineVerdict(finding);
  const risk = riskDetails(verdict);
  return {
    id: finding.id,
    title: finding.title,
    sourceUrl: finding.source_url,
    summary: finding.signal_summary ?? finding.description ?? "No signal summary provided.",
    origin,
    trustScore: verdict.trustScore,
    trustLabel: verdict.trustScore >= 85 ? "Verified Source" : verdict.trustScore >= 60 ? "Needs Review" : "Unverified Lead",
    risk,
    verdict,
    stage: stageDetails(finding.recommended_action, verdict),
    action: actionDetails(finding.recommended_action, verdict)
  };
}

function candidateToFinding(candidate) {
  if (!candidate) return null;
  return {
    id: candidate.id,
    title: candidate.title,
    sourceUrl: candidate.sourceUrl,
    summary: candidate.summary,
    origin: originDetails(candidate.sourceRoute),
    trustScore: candidate.trustScore,
    trustLabel: candidate.trustScore >= 85 ? "Verified Source" : candidate.trustScore >= 60 ? "Needs Review" : "Unverified Lead",
    risk: { key: candidate.verdict, label: candidate.verdictLabel, detail: `Threat score ${candidate.threatScore}%` },
    verdict: {
      verdict: candidate.verdict,
      label: candidate.verdictLabel,
      shortLabel: candidate.verdictLabel,
      tone: candidate.verdictTone,
      reason: candidate.verdictReason,
      nextAction: candidate.nextAction
    },
    stage: { key: candidate.stage ?? "protection", label: candidate.stage === "giving" ? "Giving AI" : "Protection AI" },
    action: { label: "Candidate details", detail: candidate.nextAction }
  };
}

function candidateMarkdown(candidate) {
  if (!candidate) return "No candidate selected.";
  const reasons = (candidate.triageReasons ?? []).map((reason) => `- ${reason.label}`).join("\n") || "- No extra triage reason detected.";
  return `# Candidate Review: ${candidate.title}\n\n## Research\nSource route: ${candidate.sourceRoute}\nSource URL: ${candidate.sourceUrl ?? "not provided"}\n\n${candidate.summary}\n\n## Protection\nVerdict: ${candidate.verdictLabel}\nTrust score: ${candidate.trustScore}%\nRisk score: ${candidate.threatScore}%\nReason: ${candidate.verdictReason}\n\nTriage reasons:\n${reasons}\n\n## Giving\nBranch eligible: ${candidate.branchEligible ? "yes" : "no"}\nWhy not branch eligible: ${candidate.whyNotBranchEligible}\nNext action: ${candidate.nextAction}\n`;
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

function riskDetails(verdict) {
  return { key: verdict.riskKey, label: verdict.riskLabel, detail: `Threat score ${verdict.threatScore}%` };
}

function stageDetails(action, verdict) {
  if (["blocked", "quarantine"].includes(verdict.verdict)) return { key: "protection", label: "Protection AI" };
  if (["review", "promote", "approved", "watchlist"].includes(action) || verdict.givingEligible) return { key: "giving", label: "Giving AI" };
  return { key: "research", label: "Research AI" };
}

function actionDetails(action, verdict) {
  if (verdict.verdict === "blocked") {
    return { label: "Blocked by Protection AI", detail: "Giving AI cannot apply, install, execute, or stage this item" };
  }
  if (verdict.verdict === "quarantine") {
    return { label: "Quarantined", detail: "Kept for audit/research only; isolated from Giving AI application paths" };
  }
  if (verdict.verdict === "needs-review") {
    return { label: "Maintainer Review Required", detail: "Giving AI may only proceed after source, license, permissions, and install surface are checked" };
  }
  if (action === "approved") {
    return { label: "Approved Dispatch", detail: "Dispatch accepted into .vnem/approved/ without executing code" };
  }
  return { label: "Eligible for Giving AI", detail: "No blocking issue found in current checks; still review before applying risky changes" };
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
