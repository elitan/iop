"use client";

import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContractOutputs } from "@/contracts";
import {
  useCreateDatabaseImportJob,
  useDatabaseImportJob,
  useRunDatabaseImportJob,
} from "@/hooks/use-databases";

type WizardStep = "source" | "preflight" | "import";

type DatabaseImportJob = ContractOutputs["databases"]["getImportJob"];
type DatabaseImportCheck = DatabaseImportJob["checkResults"][number];
type DatabaseImportVerifyCheck =
  DatabaseImportJob["verifyResult"]["checks"][number];

interface DatabaseImportWizardProps {
  projectId: string;
  initialTargetName: string;
  onBack: () => void;
  onFinished?: (databaseId: string) => void;
}

const WIZARD_STEPS: Array<{
  id: WizardStep;
  label: string;
}> = [
  { id: "source", label: "Source" },
  { id: "preflight", label: "Preflight" },
  { id: "import", label: "Import" },
];

function getStepIndex(
  job: {
    stage: string;
    databaseId: string | null;
  } | null,
): number {
  if (!job) {
    return 0;
  }
  if (
    job.stage === "preflight" ||
    (job.stage === "failed" && !job.databaseId)
  ) {
    return 1;
  }
  if (
    job.stage === "target" ||
    job.stage === "importing" ||
    job.stage === "imported" ||
    job.stage === "verifying" ||
    job.stage === "completed" ||
    (job.stage === "failed" && job.databaseId)
  ) {
    return 2;
  }
  return 0;
}

function getCheckBadgeClass(status: "ok" | "warning" | "blocked"): string {
  if (status === "ok") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function getVerifyBadgeClass(status: "pass" | "warning" | "failed"): string {
  if (status === "pass") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-red-500/30 bg-red-500/10 text-red-300";
}

function hasBlockedImportChecks(checkResults: DatabaseImportCheck[]): boolean {
  return checkResults.some(function hasBlockedCheck(check) {
    return check.status === "blocked";
  });
}

function getConnectionString(input: {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
  ssl: boolean;
}): string {
  const user = encodeURIComponent(input.username);
  const password = encodeURIComponent(input.password);
  const database = encodeURIComponent(input.database);
  const sslSuffix = input.ssl ? "?sslmode=require" : "";
  return `postgres://${user}:${password}@${input.host}:${input.port}/${database}${sslSuffix}`;
}

function getProgressLabel(
  step: string | null,
  stage: DatabaseImportJob["stage"] | null,
): string {
  if (step === "create-target") {
    return "creating Frost target";
  }
  if (step) {
    return step;
  }
  if (stage === "target") {
    return "creating Frost target";
  }
  if (stage === "importing") {
    return "running import";
  }
  if (stage === "verifying") {
    return "running verify";
  }
  if (stage === "completed") {
    return "done";
  }
  return "idle";
}

function canStartImport(job: DatabaseImportJob | null): boolean {
  if (!job) {
    return false;
  }

  if (hasBlockedImportChecks(job.checkResults)) {
    return false;
  }

  return (
    job.progressStep === null &&
    job.stage !== "importing" &&
    job.stage !== "verifying" &&
    job.stage !== "completed"
  );
}

function getStartImportLabel(job: DatabaseImportJob | null): string {
  if (!job) {
    return "Start import";
  }
  if (job.databaseId) {
    return "Run import again";
  }
  return "Start import";
}

function isAtBottom(element: HTMLTextAreaElement): boolean {
  const distance =
    element.scrollHeight - element.scrollTop - element.clientHeight;
  return distance <= 12;
}

export function DatabaseImportWizard({
  projectId,
  initialTargetName,
  onBack,
  onFinished,
}: DatabaseImportWizardProps): React.ReactElement {
  const [jobId, setJobId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [currentJob, setCurrentJob] = useState<DatabaseImportJob | null>(null);
  const [externalHost, setExternalHost] = useState("127.0.0.1");
  const [stickLogToBottom, setStickLogToBottom] = useState(true);
  const logRef = useRef<HTMLTextAreaElement | null>(null);

  const createJobMutation = useCreateDatabaseImportJob(projectId);
  const jobQuery = useDatabaseImportJob(jobId);
  const runImportMutation = useRunDatabaseImportJob(jobId);

  useEffect(function resolveExternalHost() {
    if (typeof window === "undefined") {
      return;
    }
    if (window.location.hostname) {
      setExternalHost(window.location.hostname);
    }
  }, []);

  const job = jobQuery.data ?? currentJob;

  useEffect(function keepLogAtBottom() {
    if (!stickLogToBottom || !logRef.current) {
      return;
    }
    logRef.current.scrollTop = logRef.current.scrollHeight;
  });

  async function handlePreflightSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    try {
      const result = await createJobMutation.mutateAsync({
        targetName: initialTargetName,
        sourceUrl,
      });
      setJobId(result.id);
      setCurrentJob(result);
      if (result.stage === "failed") {
        toast.error("Preflight found blocked checks");
        return;
      }
      toast.success("Preflight passed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Preflight failed";
      toast.error(message);
    }
  }

  async function handleStartImport(): Promise<void> {
    try {
      const result = await runImportMutation.mutateAsync();
      setCurrentJob(result);
      toast.success("Import started");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start import";
      toast.error(message);
    }
  }

  function handleStartOver(): void {
    setJobId("");
    setCurrentJob(null);
    setSourceUrl("");
    setStickLogToBottom(true);
  }

  const currentStepIndex = getStepIndex(job);
  const hasBlockedChecks = job
    ? hasBlockedImportChecks(job.checkResults)
    : false;
  const canStartImportNow = canStartImport(job);
  const canFinish = job?.stage === "completed" && job.databaseId;
  const showStepSpinner =
    createJobMutation.isPending ||
    runImportMutation.isPending ||
    job?.stage === "target" ||
    job?.stage === "importing" ||
    job?.stage === "verifying";

  const internalConnectionString = job?.targetConnection
    ? getConnectionString({
        username: job.targetConnection.username,
        password: job.targetConnection.password,
        host: job.targetConnection.internalHost,
        port: 5432,
        database: job.targetConnection.database,
        ssl: job.targetConnection.ssl,
      })
    : "";

  const externalConnectionString = job?.targetConnection
    ? getConnectionString({
        username: job.targetConnection.username,
        password: job.targetConnection.password,
        host: externalHost,
        port: job.targetConnection.hostPort,
        database: job.targetConnection.database,
        ssl: job.targetConnection.ssl,
      })
    : "";

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-neutral-400 hover:text-neutral-200"
      >
        Back
      </button>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {WIZARD_STEPS.map(function renderStep(step, index) {
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          return (
            <div
              key={step.id}
              className={`rounded-lg border px-3 py-2 ${
                isCurrent
                  ? "border-blue-500/40 bg-blue-500/10"
                  : "border-neutral-800 bg-neutral-900"
              }`}
            >
              <div className="flex items-center gap-2">
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : isCurrent && showStepSpinner ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                ) : (
                  <Circle
                    className={`h-4 w-4 ${
                      isCurrent ? "text-blue-400" : "text-neutral-600"
                    }`}
                  />
                )}
                <span className="text-xs text-neutral-200">{step.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {!job && (
        <form onSubmit={handlePreflightSubmit} className="space-y-3">
          <div className="space-y-2">
            <label htmlFor="source_url" className="text-xs text-neutral-400">
              Source URL
            </label>
            <Input
              id="source_url"
              value={sourceUrl}
              onChange={function onSourceUrlChange(event) {
                setSourceUrl(event.target.value);
              }}
              placeholder="postgresql://user:pass@host:5432/app"
              required
              className="border-neutral-700 bg-neutral-800 font-mono text-xs text-neutral-100"
            />
          </div>

          <Button type="submit" disabled={createJobMutation.isPending}>
            {createJobMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running preflight
              </>
            ) : (
              "Run preflight"
            )}
          </Button>
        </form>
      )}

      {job && (
        <>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-neutral-100">
                  Source summary
                </p>
                <p className="text-xs text-neutral-500">
                  {job.sourceSummary.host}:{job.sourceSummary.port}/
                  {job.sourceSummary.database}
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-neutral-700 text-neutral-300"
              >
                {job.sourceSummary.serverVersion ?? "version unknown"}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-neutral-400">
              <div>
                <p>Estimated downtime</p>
                <p className="text-neutral-200">
                  {job.sourceSummary.estimatedDowntimeMinutes
                    ? `${job.sourceSummary.estimatedDowntimeMinutes} min`
                    : "unknown"}
                </p>
              </div>
              <div>
                <p>Database size</p>
                <p className="text-neutral-200">
                  {job.sourceSummary.sizeBytes !== null
                    ? `${Math.max(1, Math.round(job.sourceSummary.sizeBytes / (1024 * 1024)))} MB`
                    : "unknown"}
                </p>
              </div>
              <div>
                <p>Tables</p>
                <p className="text-neutral-200">
                  {job.sourceSummary.tableCount ?? "unknown"}
                </p>
              </div>
              <div>
                <p>Write activity</p>
                <p className="text-neutral-200">
                  {job.sourceSummary.writeActivity ?? "unknown"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-neutral-100">
                Preflight checks
              </p>
              {hasBlockedChecks && (
                <div className="flex items-center gap-2 text-xs text-red-300">
                  <AlertTriangle className="h-4 w-4" />
                  Blocked
                </div>
              )}
            </div>
            <div className="mt-3 space-y-2">
              {job.checkResults.map(function renderCheck(
                check: DatabaseImportCheck,
              ) {
                return (
                  <div
                    key={check.key}
                    className="flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-100">{check.label}</p>
                      <p className="text-xs text-neutral-500">
                        {check.message}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={getCheckBadgeClass(check.status)}
                    >
                      {check.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
            {!job.databaseId && (
              <div className="mt-4 flex gap-2">
                {canStartImportNow && (
                  <Button
                    type="button"
                    onClick={handleStartImport}
                    disabled={runImportMutation.isPending}
                  >
                    {runImportMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting import
                      </>
                    ) : (
                      getStartImportLabel(job)
                    )}
                  </Button>
                )}
                <Button type="button" variant="ghost" onClick={handleStartOver}>
                  Start over
                </Button>
              </div>
            )}
          </div>

          {job.errorMessage && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
              {job.errorMessage}
            </div>
          )}

          {job.databaseId && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-neutral-100">
                    Import progress
                  </p>
                  <p className="text-xs text-neutral-500">
                    {getProgressLabel(job.progressStep, job.stage)}
                  </p>
                </div>
                {(job.stage === "target" ||
                  job.stage === "importing" ||
                  job.stage === "verifying") && (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                )}
              </div>
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <p className="text-xs text-neutral-400">
                    External connection
                  </p>
                  <Input
                    readOnly
                    value={externalConnectionString}
                    className="border-neutral-700 bg-neutral-800 font-mono text-[11px] text-neutral-100"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-neutral-400">
                    Internal connection
                  </p>
                  <Input
                    readOnly
                    value={internalConnectionString}
                    className="border-neutral-700 bg-neutral-800 font-mono text-[11px] text-neutral-100"
                  />
                </div>
              </div>
              <textarea
                ref={logRef}
                readOnly
                value={job.logText}
                onScroll={function onLogScroll(event) {
                  setStickLogToBottom(isAtBottom(event.currentTarget));
                }}
                className="mt-3 h-48 w-full rounded-lg border border-neutral-800 bg-neutral-950 p-3 font-mono text-[11px] text-neutral-200 outline-none"
              />
              {job.stage === "failed" && canStartImportNow && (
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={handleStartImport}
                    disabled={runImportMutation.isPending}
                  >
                    {runImportMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Starting import
                      </>
                    ) : (
                      getStartImportLabel(job)
                    )}
                  </Button>
                </div>
              )}
              {job.stage === "completed" && (
                <div className="mt-4 border-t border-neutral-800 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-neutral-100">
                      Import completed
                    </p>
                    <Badge
                      variant="outline"
                      className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    >
                      complete
                    </Badge>
                  </div>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-neutral-400">
                    <li>Pause writes to the old database</li>
                    <li>Stop workers and cron jobs</li>
                    <li>Switch the app to the new connection string</li>
                    <li>Smoke test reads and writes</li>
                  </ul>
                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      onClick={function onOpenDatabase() {
                        const databaseId = job.databaseId;
                        if (canFinish && onFinished && databaseId) {
                          onFinished(databaseId);
                        }
                      }}
                      disabled={!canFinish}
                    >
                      Open database
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleStartOver}
                    >
                      New import
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {job.verifyResult.checks.length > 0 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-sm font-medium text-neutral-100">
                Verify result
              </p>
              <div className="mt-3 space-y-2">
                {job.verifyResult.checks.map(function renderVerifyCheck(
                  check: DatabaseImportVerifyCheck,
                ) {
                  return (
                    <div
                      key={check.key}
                      className="flex items-start justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/60 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-neutral-100">
                          {check.label}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {check.message}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={getVerifyBadgeClass(check.status)}
                      >
                        {check.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
