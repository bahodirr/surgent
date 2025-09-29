interface BaseErrorData {
  url: string;
  userAgent: string;
  timestamp: string;
}

interface ErrorReport extends BaseErrorData {
  message: string;
  stack?: string;
  componentStack?: string;
  errorBoundary?: boolean;
  errorBoundaryProps?: Record<string, unknown>;
  source?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
  level: "error" | "warning" | "info";
  parsedStack?: string;
  category?: "react" | "javascript" | "network" | "user" | "unknown";
}

// Removed legacy ErrorSignature and related internal dedup logic in favor of GlobalErrorDeduplication

type ConsoleMethod = "warn" | "error";
type ConsoleArgs = unknown[];

interface ErrorFilterResult {
  shouldReport: boolean;
  reason?: string;
}

interface ErrorContext {
  message: string;
  stack?: string;
  source?: string;
  url?: string;
  level: "error" | "warning" | "info";
}

// Shared categorization utility (used by both class and immediate interceptors)
const categorize = (message: string): ErrorReport["category"] => {
  if (message.includes("Warning:") || message.includes("React")) return "react";
  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("Failed to load")
  )
    return "network";
  if (
    message.includes("TypeError") ||
    message.includes("ReferenceError") ||
    message.includes("SyntaxError")
  )
    return "javascript";
  return "unknown";
};

// Shared patterns and wrappers
const REACT_WARNING_PATTERN = "Warning:" as const;
const WARNING_PREFIX = "[WARNING]" as const;
const CONSOLE_ERROR_PREFIX = "[CONSOLE ERROR]" as const;
const SOURCE_FILE_PATTERNS: ReadonlyArray<RegExp> = [
  /\.tsx?$/,
  /\.jsx?$/,
  /\/src\//,
];
const VENDOR_PATTERNS: ReadonlyArray<RegExp> = [
  /node_modules/,
  /\.vite/,
  /chunk-/,
  /deps/,
];

type WrappedConsoleFn = ((...args: unknown[]) => void) & {
  __errorReporterWrapped?: boolean;
};
type ConsoleNative = (...args: unknown[]) => void;

const isReactRouterFutureFlagMessage = (message: string): boolean => {
  const futurePatterns = [
    /React Router Future Flag Warning/i,
    /future flag to opt-in early/i,
    /reactrouter\.com.*upgrading.*future/i,
    /v7_\w+.*future flag/i,
  ];
  return futurePatterns.some((p) => p.test(message));
};

const isDeprecatedReactWarningMessage = (message: string): boolean => {
  const deprecatedPatterns = [
    /componentWillReceiveProps/,
    /componentWillMount/,
    /componentWillUpdate/,
    /UNSAFE_componentWill/,
  ];
  return deprecatedPatterns.some((p) => p.test(message));
};

const hasRelevantSourceInStack = (stack?: string): boolean => {
  if (!stack) return false;
  const lines = stack.split("\n");
  const hasSourceFiles = lines.some((line) =>
    SOURCE_FILE_PATTERNS.some((pat) => pat.test(line))
  );
  if (hasSourceFiles) return true;

  const isAllVendor = lines.every(
    (line) =>
      line.trim() === "" ||
      line.includes("Error") ||
      VENDOR_PATTERNS.some((pat) => pat.test(line))
  );
  return !isAllVendor;
};

interface ErrorPrecedence {
  hasSourceCode: boolean;
  isWarning: boolean;
  stackDepth: number;
  timestamp: number;
}

// Shared deduplication system between immediate and class interceptors
class GlobalErrorDeduplication {
  private reportedErrors = new Map<
    string,
    { timestamp: number; precedence: ErrorPrecedence; reported: boolean }
  >();
  private readonly deduplicationWindow = 5000; // 5 seconds
  private readonly cleanupInterval = 60000; // 1 minute
  private lastCleanup = Date.now();

  private calculatePrecedence(context: ErrorContext): ErrorPrecedence {
    const hasSourceCode = this.hasRelevantSourceCode(context.stack);
    const isWarning = context.level === "warning";
    const stackDepth = context.stack ? context.stack.split("\n").length : 0;

    return {
      hasSourceCode,
      isWarning,
      stackDepth,
      timestamp: Date.now(),
    };
  }

  private hasRelevantSourceCode(stack?: string): boolean {
    if (!stack) return false;
    return stack
      .split("\n")
      .some(
        (line) =>
          /\.tsx?$/.test(line) || /\.jsx?$/.test(line) || /\/src\//.test(line)
      );
  }

  private isHigherPrecedence(
    newPrec: ErrorPrecedence,
    existingPrec: ErrorPrecedence
  ): boolean {
    // Prefer errors with source code
    if (newPrec.hasSourceCode !== existingPrec.hasSourceCode) {
      return newPrec.hasSourceCode;
    }

    // For same source code presence, prefer warnings (they often have better stack traces)
    if (newPrec.isWarning !== existingPrec.isWarning) {
      return newPrec.isWarning;
    }

    // Prefer deeper stack traces (more context)
    if (newPrec.stackDepth !== existingPrec.stackDepth) {
      return newPrec.stackDepth > existingPrec.stackDepth;
    }

    // Prefer newer errors
    return newPrec.timestamp > existingPrec.timestamp;
  }

  private generateSignature(context: ErrorContext): string {
    // Normalize message to group all variants of the same error
    let messageCore = context.message
      .replace(/\[CONSOLE ERROR\]|\[WARNING\]/g, "")
      .replace(/^Uncaught Error:\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .replace(/%s.*?\n/g, "") // Remove React formatting
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

    // Extract the core error message for better grouping
    // For "Maximum update depth exceeded" errors, use just that key phrase
    if (messageCore.includes("Maximum update depth exceeded")) {
      messageCore = "Maximum update depth exceeded";
    }
    // For getSnapshot errors
    else if (
      messageCore.includes("The result of getSnapshot should be cached")
    ) {
      messageCore = "The result of getSnapshot should be cached";
    }
    // For React Router caught errors
    else if (messageCore.includes("React Router caught the following error")) {
      messageCore = "React Router caught error";
    }

    // Don't include stack in signature - just the core message
    // This ensures all variants of the same error are grouped together
    return messageCore;
  }

  shouldReport(
    context: ErrorContext,
    immediate = false
  ): { shouldReport: boolean; reason?: string } {
    this.maybeCleanup();

    const signature = this.generateSignature(context);
    const precedence = this.calculatePrecedence(context);
    const existing = this.reportedErrors.get(signature);
    const now = Date.now();

    if (!existing) {
      // For immediate reporting, require source code to avoid vendor-only noise
      if (immediate && !precedence.hasSourceCode) {
        return { shouldReport: false, reason: "no_source_code" };
      }
      // Record and allow reporting
      this.reportedErrors.set(signature, {
        timestamp: now,
        precedence,
        reported: true,
      });
      return { shouldReport: true };
    }

    // Check if this is a better version of the same error
    if (this.isHigherPrecedence(precedence, existing.precedence)) {
      // Only report if significantly better (has source code when existing doesn't)
      if (precedence.hasSourceCode && !existing.precedence.hasSourceCode) {
        existing.precedence = precedence;
        existing.timestamp = now;
        existing.reported = true;
        return { shouldReport: true };
      }
    }

    // Check deduplication window
    if (now - existing.timestamp < this.deduplicationWindow) {
      return { shouldReport: false, reason: "duplicate_in_window" };
    }

    // Enough time has passed, but check source code requirement for immediate
    if (immediate && !precedence.hasSourceCode) {
      return { shouldReport: false, reason: "no_source_code" };
    }

    // Allow reporting after window expires
    existing.timestamp = now;
    existing.precedence = precedence;
    existing.reported = true;
    return { shouldReport: true };
  }

  // Removed deferred best-version reporting; deduplication is synchronous now

  private maybeCleanup() {
    const now = Date.now();
    if (now - this.lastCleanup > this.cleanupInterval) {
      const cutoff = now - 300000; // 5 minutes
      for (const [signature, data] of this.reportedErrors.entries()) {
        if (data.timestamp < cutoff) {
          this.reportedErrors.delete(signature);
        }
      }
      this.lastCleanup = now;
    }
  }
}

// Global instance shared across all interceptors
const globalDeduplication = new GlobalErrorDeduplication();

class ErrorReporter {
  private errorQueue: ErrorReport[] = [];
  private isReporting = false;
  private readonly maxQueueSize = 10;
  private readonly reportingEndpoint = "/api/client-errors";
  private originalConsoleWarn: typeof console.warn | null = null;
  private originalConsoleError: typeof console.error | null = null;
  private isInitialized = false;

  constructor() {
    if (typeof window === "undefined") return; // Skip in SSR

    try {
      // Set up interceptors IMMEDIATELY using property descriptors to intercept even cached references
      this.setupConsoleInterceptors();
      this.setupGlobalErrorHandler();
      this.setupUnhandledRejectionHandler();

      this.isInitialized = true;
    } catch (err) {
      console.error("[ErrorReporter] Failed to initialize:", err);
    }
  }

  private setupGlobalErrorHandler() {
    const originalHandler = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      const errorMessage =
        typeof message === "string" ? message : "Unknown error";

      const context: ErrorContext = {
        message: errorMessage,
        stack: error?.stack,
        source: source || undefined,
        level: "error",
        url: window.location.href,
      };

      const filterResult = this.filterError(context);
      if (!filterResult.shouldReport) {
        // Still call original handler even if we don't report
        if (originalHandler) {
          return originalHandler(message, source, lineno, colno, error);
        }
        return true;
      }

      const payload = this.createErrorPayload({
        message: errorMessage,
        stack: error?.stack,
        parsedStack: this.parseStackTrace(error?.stack),
        source: source || undefined,
        lineno: lineno || undefined,
        colno: colno || undefined,
        error: error,
      });

      this.report(payload);

      // Call original handler if it exists
      if (originalHandler) {
        return originalHandler(message, source, lineno, colno, error);
      }
      return true; // Prevent default browser error handling
    };
  }

  private setupUnhandledRejectionHandler() {
    window.addEventListener("unhandledrejection", (event) => {
      const error = event.reason;
      const errorMessage = error?.message || "Unhandled Promise Rejection";

      const context: ErrorContext = {
        message: errorMessage,
        stack: error?.stack,
        level: "error",
        url: window.location.href,
      };

      const filterResult = this.filterError(context);
      if (!filterResult.shouldReport) return;

      const payload = this.createErrorPayload({
        message: errorMessage,
        stack: error?.stack,
        parsedStack: this.parseStackTrace(error?.stack),
        error: error,
      });

      this.report(payload);
    });
  }

  private createConsoleInterceptor(
    method: ConsoleMethod,
    original: ConsoleNative,
    prefix: string
  ) {
    return (...args: ConsoleArgs) => {
      // Call original first
      original.apply(console, args);

      try {
        const message = formatConsoleArgs(args);
        const stack = new Error().stack;
        const level =
          method === "warn" && message.includes(REACT_WARNING_PATTERN)
            ? "warning"
            : "error";

        const context: ErrorContext = {
          message: `${prefix} ${message}`,
          stack,
          level,
          url: window.location.href,
        };

        const filterResult = this.filterError(context);
        if (!filterResult.shouldReport) return;

        const payload = this.createErrorPayload({
          message: context.message,
          stack,
          parsedStack: this.parseStackTrace(stack),
          level,
        });

        this.report(payload);
      } catch {
        // Fail silently
      }
    };
  }

  private setupConsoleInterceptors() {
    this.originalConsoleWarn = console.warn;
    this.originalConsoleError = console.error;

    const currentWarn = console.warn as WrappedConsoleFn;
    const currentError = console.error as WrappedConsoleFn;
    // If already wrapped by immediate interceptors, do not wrap again
    if (
      currentWarn.__errorReporterWrapped &&
      currentError.__errorReporterWrapped
    ) {
      return;
    }

    console.error = this.createConsoleInterceptor(
      "error",
      this.originalConsoleError!,
      CONSOLE_ERROR_PREFIX
    );
    console.warn = this.createConsoleInterceptor(
      "warn",
      this.originalConsoleWarn!,
      WARNING_PREFIX
    );
  }

  private createBaseErrorData(): BaseErrorData {
    return {
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
  }

  private createErrorPayload(
    data: Partial<ErrorReport> & { message: string }
  ): ErrorReport {
    const baseData = this.createBaseErrorData();
    return {
      ...baseData,
      level: (data.level ?? "error") as "error" | "warning" | "info",
      category: categorize(data.message),
      ...data,
    };
  }

  private filterError(context: ErrorContext): ErrorFilterResult {
    const { message, stack, level, source } = context;

    // Skip our own debug messages
    if (message.includes("[ErrorReporter]")) {
      return { shouldReport: false, reason: "internal_debug" };
    }

    // Skip React Router future flag warnings
    if (isReactRouterFutureFlagMessage(message)) {
      return { shouldReport: false, reason: "react_router_future_flag" };
    }

    // Skip deprecated React lifecycle warnings
    if (level === "warning" && isDeprecatedReactWarningMessage(message)) {
      return { shouldReport: false, reason: "deprecated_react_warning" };
    }

    // For uncaught errors, require relevant source code in stack trace
    if (
      level === "error" &&
      message.includes("Uncaught Error") &&
      !hasRelevantSourceInStack(stack)
    ) {
      return { shouldReport: false, reason: "no_relevant_source" };
    }

    // For general errors from vendor code only, skip if no source code involvement
    if (
      level === "error" &&
      source &&
      VENDOR_PATTERNS.some((pattern) => pattern.test(source)) &&
      !hasRelevantSourceInStack(stack)
    ) {
      return { shouldReport: false, reason: "vendor_only_error" };
    }

    // Use global deduplication to handle precedence and avoid duplicates
    const deduplicationResult = globalDeduplication.shouldReport(
      context,
      false
    );
    if (!deduplicationResult.shouldReport)
      return { shouldReport: false, reason: deduplicationResult.reason };

    return { shouldReport: true };
  }

  private parseStackTrace(stack?: string): string {
    if (!stack) return "";

    try {
      const lines = stack.split("\n");
      const parsedLines: string[] = [];

      for (const line of lines) {
        // Skip generic error lines
        if (line.includes("Error") && !line.includes("at ")) continue;

        let parsedLine = line.trim();

        // Look for React component patterns in source files
        const componentMatch = line.match(
          /at (\w+) \(.*?\/src\/(.*?):(\d+):(\d+)\)/
        );
        if (componentMatch) {
          const [, componentName, filePath, lineNum, colNum] = componentMatch;
          parsedLine = `    at ${componentName} (${filePath}:${lineNum}:${colNum})`;
        } else {
          // Look for any patterns in src directory
          const srcMatch = line.match(/at.*?\/src\/(.*?):(\d+):(\d+)/);
          if (srcMatch) {
            const [, filePath, lineNum, colNum] = srcMatch;
            parsedLine = `    at ${filePath}:${lineNum}:${colNum}`;
          } else {
            // Look for function names at the start of lines
            const functionMatch = line.match(/at\s+(\w+)\s+\(/);
            if (functionMatch) {
              parsedLine = line;
            }
          }
        }

        if (parsedLine) {
          parsedLines.push(parsedLine);
        }
      }

      return parsedLines.join("\n");
    } catch {
      return stack; // Return original if parsing fails
    }
  }

  public report(error: ErrorReport): void {
    if (!this.isInitialized || typeof window === "undefined") {
      return;
    }

    try {
      this.errorQueue.push(error);

      // Limit queue size
      if (this.errorQueue.length > this.maxQueueSize) {
        this.errorQueue.shift(); // Remove oldest error
      }

      // Process queue
      this.processQueue();
    } catch (err) {
      // Swallow reporting errors in client
    }
  }

  private async processQueue() {
    if (this.isReporting || this.errorQueue.length === 0) {
      return;
    }

    this.isReporting = true;
    const errorsToReport = [...this.errorQueue];
    this.errorQueue = [];

    try {
      for (const error of errorsToReport) {
        await this.sendError(error);
      }
    } catch (err) {
      // If reporting fails, add errors back to queue
      console.error("[ErrorReporter] Failed to report errors:", err);
      this.errorQueue.unshift(...errorsToReport);
    } finally {
      this.isReporting = false;
    }
  }

  private async sendError(error: ErrorReport) {
    try {
      const response = await fetch(this.reportingEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(error),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to report error: ${response.status} ${response.statusText}`
        );
      }

      const result = (await response.json()) as {
        success: boolean;
        error?: string;
      };

      if (!result.success) {
        throw new Error(result.error || "Unknown error occurred");
      }

      console.log(
        "[ErrorReporter] Error reported successfully:",
        error.message
      );
    } catch (err) {
      console.error("[ErrorReporter] Failed to send error:", err);
      throw err;
    }
  }

  // Cleanup method for proper disposal
  public dispose(): void {
    if (this.originalConsoleWarn) {
      console.warn = this.originalConsoleWarn;
    }
    if (this.originalConsoleError) {
      console.error = this.originalConsoleError;
    }
    this.isInitialized = false;
  }
}

// Early console interceptor utility functions
const formatConsoleArgs = (args: unknown[]): string => {
  return args
    .map((arg) =>
      typeof arg === "string"
        ? arg
        : typeof arg === "object" && arg
        ? JSON.stringify(arg, null, 2)
        : String(arg)
    )
    .join(" ");
};

type ImmediatePayload = Pick<
  ErrorReport,
  "message" | "stack" | "url" | "userAgent" | "timestamp" | "level" | "category"
>;

const createImmediateErrorPayload = (
  message: string,
  level: "warning" | "error"
): ImmediatePayload => ({
  message,
  stack: new Error().stack,
  url: window.location.href,
  userAgent: navigator.userAgent,
  timestamp: new Date().toISOString(),
  level,
  category: categorize(message),
});

// Shared filtering logic for immediate interceptors
const shouldReportImmediate = (context: ErrorContext): boolean => {
  const { message, stack, level } = context;

  // Skip internal debug messages
  if (message.includes("[ErrorReporter]")) return false;

  // Skip React Router future flag warnings
  const futurePatterns = [
    /React Router Future Flag Warning/i,
    /future flag to opt-in early/i,
    /reactrouter\.com.*upgrading.*future/i,
    /v7_\w+.*future flag/i,
  ];
  if (futurePatterns.some((pattern) => pattern.test(message))) return false;

  // Skip deprecated React lifecycle warnings
  const deprecatedPatterns = [
    /componentWillReceiveProps/,
    /componentWillMount/,
    /componentWillUpdate/,
    /UNSAFE_componentWill/,
  ];
  if (
    level === "warning" &&
    deprecatedPatterns.some((pattern) => pattern.test(message))
  )
    return false;

  // For errors without proper source code, skip them
  const hasSourceCode = stack
    ? stack
        .split("\n")
        .some(
          (line) =>
            /\.tsx?$/.test(line) || /\.jsx?$/.test(line) || /\/src\//.test(line)
        )
    : false;

  // Skip uncaught errors without source code
  if (level === "error" && message.includes("Uncaught Error") && !hasSourceCode)
    return false;

  // Skip Maximum update depth errors without source code
  if (message.includes("Maximum update depth exceeded") && !hasSourceCode)
    return false;

  // Use global deduplication with immediate flag
  const deduplicationResult = globalDeduplication.shouldReport(context, true);
  return deduplicationResult.shouldReport;
};

const sendImmediateError = async (payload: ImmediatePayload): Promise<void> => {
  try {
    await fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Fail silently
  }
};

// Intercept console methods IMMEDIATELY before React can cache them
if (typeof window !== "undefined") {
  const originalWarn = console.warn;
  const originalError = console.error;

  // Create shared interceptor logic following DRY principles
  const createImmediateInterceptor = (
    original: ConsoleNative,
    prefix: string,
    defaultLevel: "warning" | "error"
  ) =>
    function (...args: unknown[]) {
      original.apply(console, args);

      try {
        const message = formatConsoleArgs(args);
        const stack = new Error().stack;
        const level = message.includes("Warning:") ? "warning" : defaultLevel;

        const context: ErrorContext = {
          message: `${prefix} ${message}`,
          stack,
          level,
          url: window.location.href,
        };

        if (shouldReportImmediate(context)) {
          const payload = createImmediateErrorPayload(context.message, level);
          sendImmediateError(payload);
        }
      } catch {
        // Fail silently
      }
    };

  console.warn = createImmediateInterceptor(
    originalWarn,
    "[WARNING]",
    "warning"
  ) as WrappedConsoleFn;
  (console.warn as WrappedConsoleFn).__errorReporterWrapped = true;
  console.error = createImmediateInterceptor(
    originalError,
    "[CONSOLE ERROR]",
    "error"
  ) as WrappedConsoleFn;
  (console.error as WrappedConsoleFn).__errorReporterWrapped = true;
}

// Create singleton instance
export const errorReporter = new ErrorReporter();

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    errorReporter.dispose();
  });
}
