import {
  parseStockfishInfoLine,
  sortEngineLines,
  type EngineAnalysisLine,
  type UciEngineTransport
} from "./engine-analysis.ts";

export type EngineSearchPriority = "interactive" | "batch";

export interface EngineSearchRequest {
  fen: string;
  depth?: number;
  nodes?: number;
  movetimeMs?: number;
  multiPv?: number;
  searchMoves?: string[];
  newGame?: boolean;
  priority?: EngineSearchPriority;
  timeoutMs?: number;
  onUpdate?: (lines: EngineAnalysisLine[]) => void;
  signal?: AbortSignal;
}

export type EngineArbiterStopReason = "aborted" | "superseded" | "cancelled" | "terminated";

export class EngineSearchAbortedError extends Error {
  readonly reason: EngineArbiterStopReason;

  constructor(reason: EngineArbiterStopReason, message?: string) {
    super(message ?? defaultAbortMessage(reason));
    this.name = "AbortError";
    this.reason = reason;
  }
}

export interface UciEngineArbiterOptions {
  defaultDepth?: number;
  defaultMultiPv?: number;
  defaultTimeoutMs?: number;
}

type InitState = "idle" | "starting" | "awaiting_uciok" | "awaiting_readyok" | "ready";

type ActiveStopReason =
  | "none"
  | "superseded"
  | "preempted"
  | "aborted"
  | "timeout"
  | "paused"
  | "cancelled"
  | "terminated";

interface PendingWork {
  request: EngineSearchRequest;
  priority: EngineSearchPriority;
  multiPv: number;
  resolve: (lines: EngineAnalysisLine[]) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  cleanupSignal: (() => void) | null;
}

interface ActiveWork {
  item: PendingWork;
  generation: number;
  multiPv: number;
  stopRequested: boolean;
  stopReason: ActiveStopReason;
  byMultiPv: Map<number, EngineAnalysisLine>;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_DEPTH = 20;
const DEFAULT_MULTI_PV = 1;

export function buildUciGoCommand(
  request: Pick<EngineSearchRequest, "depth" | "nodes" | "movetimeMs" | "searchMoves">,
  defaultDepth = DEFAULT_DEPTH
): string {
  const parts: string[] = ["go"];
  const depth = positiveInt(request.depth);
  const nodes = positiveInt(request.nodes);
  const movetimeMs = positiveInt(request.movetimeMs);

  if (depth !== undefined) {
    parts.push("depth", String(depth));
  }
  if (nodes !== undefined) {
    parts.push("nodes", String(nodes));
  }
  if (movetimeMs !== undefined) {
    parts.push("movetime", String(movetimeMs));
  }
  if (depth === undefined && nodes === undefined && movetimeMs === undefined) {
    parts.push("depth", String(positiveInt(defaultDepth) ?? DEFAULT_DEPTH));
  }

  const searchMoves = normalizeSearchMoves(request.searchMoves);
  if (searchMoves.length > 0) {
    parts.push("searchmoves", ...searchMoves);
  }

  return parts.join(" ");
}

export class UciEngineArbiter {
  private readonly transport: UciEngineTransport;
  private readonly defaultDepth: number;
  private readonly defaultMultiPv: number;
  private readonly defaultTimeoutMs: number | undefined;

  private lifecycleEpoch = 0;
  private initState: InitState = "idle";
  private initPromise: Promise<void> | null = null;
  private resolveInit: (() => void) | null = null;
  private rejectInit: ((error: unknown) => void) | null = null;
  private unsubscribeLine: (() => void) | null = null;

  private appliedMultiPv: number | null = null;
  private nextGeneration = 0;
  private activeWork: ActiveWork | null = null;
  private pendingInteractive: PendingWork | null = null;
  private batchQueue: PendingWork[] = [];
  private paused = false;
  private pumpScheduled = false;
  private idleWaiters: Array<() => void> = [];

  constructor(transport: UciEngineTransport, options: UciEngineArbiterOptions = {}) {
    this.transport = transport;
    this.defaultDepth = positiveInt(options.defaultDepth) ?? DEFAULT_DEPTH;
    this.defaultMultiPv = positiveInt(options.defaultMultiPv) ?? DEFAULT_MULTI_PV;
    this.defaultTimeoutMs = positiveInt(options.defaultTimeoutMs);
  }

  get currentGeneration(): number {
    return this.nextGeneration;
  }

  get activeGeneration(): number | null {
    return this.activeWork?.generation ?? null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isRunning(): boolean {
    return this.activeWork !== null;
  }

  analyze(request: EngineSearchRequest): Promise<EngineAnalysisLine[]> {
    if (request.signal?.aborted) {
      return Promise.reject(new EngineSearchAbortedError("aborted"));
    }

    const priority: EngineSearchPriority = request.priority ?? "interactive";
    const multiPv = positiveInt(request.multiPv) ?? this.defaultMultiPv;

    return new Promise<EngineAnalysisLine[]>((resolve, reject) => {
      const item: PendingWork = {
        request,
        priority,
        multiPv,
        resolve,
        reject,
        settled: false,
        cleanupSignal: null
      };

      if (request.signal) {
        const onAbort = () => this.handleItemAborted(item);
        request.signal.addEventListener("abort", onAbort, { once: true });
        item.cleanupSignal = () => {
          request.signal?.removeEventListener("abort", onAbort);
        };
      }

      if (priority === "interactive") {
        this.enqueueInteractive(item);
      } else {
        this.batchQueue.push(item);
      }

      this.ensureInitializedAndPump();
    });
  }

  async pause(): Promise<void> {
    this.paused = true;
    const work = this.activeWork;
    if (!work) {
      return;
    }

    if (!work.stopRequested) {
      this.requestStopActive("paused");
    }

    await this.waitForActiveIdle();
  }

  resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    if (this.hasPendingWork()) {
      this.ensureInitializedAndPump();
    }
  }

  async stopCurrent(): Promise<void> {
    const work = this.activeWork;
    if (!work) {
      return;
    }

    this.rejectWork(work.item, new EngineSearchAbortedError("cancelled"));
    if (!work.stopRequested) {
      this.requestStopActive("cancelled");
    } else {
      work.stopReason = "cancelled";
    }

    await this.waitForActiveIdle();
  }

  async cancelAll(): Promise<void> {
    this.rejectPendingQueues(new EngineSearchAbortedError("cancelled"));

    const work = this.activeWork;
    if (!work) {
      return;
    }

    this.rejectWork(work.item, new EngineSearchAbortedError("cancelled"));
    if (!work.stopRequested) {
      this.requestStopActive("cancelled");
    } else {
      work.stopReason = "cancelled";
    }

    await this.waitForActiveIdle();
  }

  terminate(): void {
    const terminatedError = new EngineSearchAbortedError("terminated");
    this.lifecycleEpoch += 1;
    this.paused = false;
    this.pumpScheduled = false;
    this.appliedMultiPv = null;

    this.rejectPendingQueues(terminatedError);

    if (this.activeWork) {
      const work = this.activeWork;
      this.clearWorkTimeout(work);
      this.activeWork = null;
      this.rejectWork(work.item, terminatedError);
      this.notifyIdleWaiters();
    }

    if (this.rejectInit) {
      const rejectInit = this.rejectInit;
      this.clearInitState();
      rejectInit(terminatedError);
    } else {
      this.clearInitState();
    }

    this.detachLineListener();
    this.transport.terminate();
  }

  private enqueueInteractive(item: PendingWork): void {
    if (this.pendingInteractive) {
      const previous = this.pendingInteractive;
      this.pendingInteractive = null;
      this.rejectWork(previous, new EngineSearchAbortedError("superseded"));
    }

    this.pendingInteractive = item;

    const active = this.activeWork;
    if (!active) {
      return;
    }

    if (active.item.priority === "batch") {
      if (!active.stopRequested) {
        this.requestStopActive("preempted");
      }
      return;
    }

    // Active work is interactive: supersede it with the newer interactive request.
    if (active.stopReason !== "timeout") {
      this.rejectWork(active.item, new EngineSearchAbortedError("superseded"));
      if (!active.stopRequested) {
        this.requestStopActive("superseded");
      } else {
        active.stopReason = "superseded";
      }
    }
  }

  private handleItemAborted(item: PendingWork): void {
    if (item.settled) {
      return;
    }

    const abortError = new EngineSearchAbortedError("aborted");

    if (this.pendingInteractive === item) {
      this.pendingInteractive = null;
      this.rejectWork(item, abortError);
      return;
    }

    const queuedIndex = this.batchQueue.indexOf(item);
    if (queuedIndex !== -1) {
      this.batchQueue.splice(queuedIndex, 1);
      this.rejectWork(item, abortError);
      return;
    }

    if (this.activeWork?.item === item) {
      const work = this.activeWork;
      this.rejectWork(item, abortError);
      if (!work.stopRequested) {
        this.requestStopActive("aborted");
      } else {
        work.stopReason = "aborted";
      }
    }
  }

  private ensureInitializedAndPump(): void {
    if (this.paused) {
      return;
    }

    if (this.initState === "ready") {
      this.schedulePump();
      return;
    }

    const epoch = this.lifecycleEpoch;
    this.ensureInitialized().then(
      () => {
        if (epoch === this.lifecycleEpoch) {
          this.schedulePump();
        }
      },
      (error) => {
        if (epoch === this.lifecycleEpoch) {
          this.rejectPendingQueues(error);
        }
      }
    );
  }

  private ensureInitialized(): Promise<void> {
    if (this.initState === "ready") {
      return Promise.resolve();
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    const epoch = this.lifecycleEpoch;
    this.initState = "starting";
    this.initPromise = new Promise<void>((resolve, reject) => {
      this.resolveInit = resolve;
      this.rejectInit = reject;
    });

    // Prevent unhandled rejections if callers observe failure through analyze() rejection.
    this.initPromise.catch(() => {});

    void this.runHandshake(epoch);
    return this.initPromise;
  }

  private async runHandshake(epoch: number): Promise<void> {
    try {
      await this.transport.start();
      if (epoch !== this.lifecycleEpoch) {
        return;
      }

      this.detachLineListener();
      this.unsubscribeLine = this.transport.onLine((line) => this.handleLine(epoch, line));
      this.initState = "awaiting_uciok";
      this.transport.send("uci");
    } catch (error) {
      if (epoch !== this.lifecycleEpoch) {
        return;
      }
      this.failInit(error);
    }
  }

  private failInit(error: unknown): void {
    const rejectInit = this.rejectInit;
    this.detachLineListener();
    this.appliedMultiPv = null;
    this.clearInitState();
    rejectInit?.(error);
  }

  private clearInitState(): void {
    this.initState = "idle";
    this.initPromise = null;
    this.resolveInit = null;
    this.rejectInit = null;
  }

  private detachLineListener(): void {
    if (this.unsubscribeLine) {
      const unsubscribe = this.unsubscribeLine;
      this.unsubscribeLine = null;
      unsubscribe();
    }
  }

  private handleLine(epoch: number, rawLine: string): void {
    if (epoch !== this.lifecycleEpoch) {
      return;
    }

    const line = rawLine.trim();
    if (!line) {
      return;
    }

    if (this.initState === "awaiting_uciok") {
      if (line === "uciok") {
        this.initState = "awaiting_readyok";
        try {
          this.transport.send("isready");
        } catch (error) {
          this.failInit(error);
        }
      }
      return;
    }

    if (this.initState === "awaiting_readyok") {
      if (line === "readyok") {
        this.initState = "ready";
        const resolveInit = this.resolveInit;
        this.resolveInit = null;
        this.rejectInit = null;
        resolveInit?.();
        this.schedulePump();
      }
      return;
    }

    if (this.initState !== "ready") {
      return;
    }

    // Never treat readyok as search completion.
    if (line === "readyok") {
      return;
    }

    const work = this.activeWork;
    if (!work) {
      return;
    }

    if (line === "bestmove" || line.startsWith("bestmove ")) {
      this.handleBestmove(work);
      return;
    }

    if (work.stopRequested) {
      return;
    }

    const parsed = parseStockfishInfoLine(line, work.item.request.fen);
    if (!parsed) {
      return;
    }

    work.byMultiPv.set(parsed.multipv, parsed);
    const snapshot = this.currentLines(work);
    work.item.request.onUpdate?.(snapshot);
  }

  private handleBestmove(work: ActiveWork): void {
    if (this.activeWork !== work) {
      return;
    }

    this.clearWorkTimeout(work);
    this.activeWork = null;

    const item = work.item;
    if (work.stopReason === "none" || work.stopReason === "timeout") {
      this.resolveWork(item, this.currentLines(work));
    } else if (work.stopReason === "preempted" || work.stopReason === "paused") {
      if (!item.settled && !item.request.signal?.aborted) {
        if (item.priority === "batch") {
          this.batchQueue.unshift(item);
        } else if (!this.pendingInteractive) {
          this.pendingInteractive = item;
        } else {
          this.rejectWork(item, new EngineSearchAbortedError("superseded"));
        }
      }
    } else if (!item.settled) {
      const reason: EngineArbiterStopReason =
        work.stopReason === "aborted"
          ? "aborted"
          : work.stopReason === "superseded"
            ? "superseded"
            : work.stopReason === "terminated"
              ? "terminated"
              : "cancelled";
      this.rejectWork(item, new EngineSearchAbortedError(reason));
    }

    this.notifyIdleWaiters();
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumpScheduled) {
      return;
    }
    this.pumpScheduled = true;
    const epoch = this.lifecycleEpoch;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      if (epoch !== this.lifecycleEpoch) {
        return;
      }
      this.pump();
    });
  }

  private pump(): void {
    if (this.initState !== "ready" || this.paused || this.activeWork !== null) {
      return;
    }

    const next = this.dequeueNextWork();
    if (!next) {
      return;
    }

    if (next.settled || next.request.signal?.aborted) {
      this.rejectWork(next, new EngineSearchAbortedError("aborted"));
      this.schedulePump();
      return;
    }

    this.startWork(next);
  }

  private dequeueNextWork(): PendingWork | null {
    if (this.pendingInteractive) {
      const next = this.pendingInteractive;
      this.pendingInteractive = null;
      return next;
    }

    return this.batchQueue.shift() ?? null;
  }

  private startWork(item: PendingWork): void {
    const generation = ++this.nextGeneration;
    const work: ActiveWork = {
      item,
      generation,
      multiPv: item.multiPv,
      stopRequested: false,
      stopReason: "none",
      byMultiPv: new Map(),
      timeoutHandle: null
    };

    const timeoutMs = positiveInt(item.request.timeoutMs) ?? this.defaultTimeoutMs;
    if (timeoutMs !== undefined) {
      work.timeoutHandle = setTimeout(() => {
        if (this.activeWork?.generation !== generation || work.stopRequested) {
          return;
        }
        this.requestStopActive("timeout");
      }, timeoutMs);
    }

    this.activeWork = work;

    try {
      if (this.appliedMultiPv !== item.multiPv) {
        this.transport.send(`setoption name MultiPV value ${item.multiPv}`);
        this.appliedMultiPv = item.multiPv;
      }
      if (item.request.newGame === true) {
        this.transport.send("ucinewgame");
      }
      this.transport.send(`position fen ${item.request.fen}`);
      this.transport.send(buildUciGoCommand(item.request, this.defaultDepth));
    } catch (error) {
      if (this.activeWork === work) {
        this.clearWorkTimeout(work);
        this.activeWork = null;
        this.appliedMultiPv = null;
        this.notifyIdleWaiters();
      }
      this.rejectWork(item, error);
      this.schedulePump();
    }
  }

  private requestStopActive(reason: Exclude<ActiveStopReason, "none">): void {
    const work = this.activeWork;
    if (!work || work.stopRequested) {
      return;
    }

    work.stopRequested = true;
    work.stopReason = reason;
    this.clearWorkTimeout(work);

    try {
      this.transport.send("stop");
    } catch (error) {
      if (this.activeWork === work) {
        this.activeWork = null;
        this.appliedMultiPv = null;
        this.rejectWork(work.item, error);
        this.notifyIdleWaiters();
        this.schedulePump();
      }
    }
  }

  private currentLines(work: ActiveWork): EngineAnalysisLine[] {
    return sortEngineLines([...work.byMultiPv.values()]).slice(0, work.multiPv);
  }

  private resolveWork(item: PendingWork, lines: EngineAnalysisLine[]): void {
    if (item.settled) {
      return;
    }
    item.settled = true;
    item.cleanupSignal?.();
    item.cleanupSignal = null;
    item.resolve(lines);
  }

  private rejectWork(item: PendingWork, error: unknown): void {
    if (item.settled) {
      return;
    }
    item.settled = true;
    item.cleanupSignal?.();
    item.cleanupSignal = null;
    item.reject(error);
  }

  private rejectPendingQueues(error: unknown): void {
    if (this.pendingInteractive) {
      const pending = this.pendingInteractive;
      this.pendingInteractive = null;
      this.rejectWork(pending, error);
    }

    if (this.batchQueue.length > 0) {
      const queued = this.batchQueue;
      this.batchQueue = [];
      for (const item of queued) {
        this.rejectWork(item, error);
      }
    }
  }

  private clearWorkTimeout(work: ActiveWork): void {
    if (work.timeoutHandle !== null) {
      clearTimeout(work.timeoutHandle);
      work.timeoutHandle = null;
    }
  }

  private hasPendingWork(): boolean {
    return this.pendingInteractive !== null || this.batchQueue.length > 0;
  }

  private waitForActiveIdle(): Promise<void> {
    if (!this.activeWork) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private notifyIdleWaiters(): void {
    if (this.idleWaiters.length === 0) {
      return;
    }
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) {
      resolve();
    }
  }
}

function positiveInt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeSearchMoves(moves: string[] | undefined): string[] {
  if (!moves || moves.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const move of moves) {
    const uci = move.trim().toLowerCase();
    if (!uci || seen.has(uci)) {
      continue;
    }
    seen.add(uci);
    normalized.push(uci);
  }
  return normalized;
}

function defaultAbortMessage(reason: EngineArbiterStopReason): string {
  switch (reason) {
    case "superseded":
      return "Engine search superseded by a newer interactive request.";
    case "cancelled":
      return "Engine search cancelled.";
    case "terminated":
      return "Engine arbiter terminated.";
    case "aborted":
      return "Engine search aborted.";
  }
}
