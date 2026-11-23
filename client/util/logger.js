var LogLevel = {
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  TRACE: 5,
  0: "NONE",
  1: "ERROR",
  2: "WARN",
  3: "INFO",
  4: "DEBUG",
  5: "TRACE",
};
var logLevelByName = {
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};
var logLevelLabels = {
  0: "",
  1: "ERROR",
  2: "WARN",
  3: "INFO",
  4: "DEBUG",
  5: "TRACE",
};
function describeLogValue(value) {
  try {
    if (typeof value == "string") {
      return value;
    } else if (value instanceof Error) {
      return `${value.name}: ${value.message}`;
    } else if (value == null || typeof value != "object") {
      return String(value);
    } else if (ArrayBuffer.isView(value)) {
      return `${value.constructor?.name ?? "TypedArray"}(${value.byteLength}B)`;
    } else if (Array.isArray(value)) {
      return `Array(${value.length})`;
    } else {
      return `{${Object.keys(value).slice(0, 6).join(",")}}`;
    }
  } catch {
    return "[undescribable]";
  }
}
function formatBreadcrumbMessage(values) {
  let message = "";
  for (const value of values) {
    if (message.length >= 200) {
      break;
    }
    message += message ? ` ${describeLogValue(value)}` : describeLogValue(value);
  }
  if (message.length > 200) {
    return `${message.slice(0, 200)}…`;
  } else {
    return message;
  }
}
var logger = new (class {
  level = 2;
  disabledCategories = new Set();
  enabledCategories = null;
  breadcrumbs = [];
  errorSink = null;
  constructor() {
    this.readUrlParams();
  }
  init() {
    window.__log = {
      level: this.getLevelName(),
      setLevel: (level) => {
        this.setLevel(level);
        window.__log.level = this.getLevelName();
      },
      enable: (category) => {
        this.disabledCategories.delete(category);
        if (this.enabledCategories) {
          this.enabledCategories.add(category);
        }
      },
      disable: (category) => {
        this.disabledCategories.add(category);
        if (this.enabledCategories) {
          this.enabledCategories.delete(category);
        }
      },
      enableAll: () => {
        this.enabledCategories = null;
        this.disabledCategories.clear();
      },
      categories: () => ({
        enabled: this.enabledCategories
          ? Array.from(this.enabledCategories)
          : ["*"],
        disabled: Array.from(this.disabledCategories),
      }),
      help: () => {
        console.log(
          [
            "Logger commands:",
            '  __log.setLevel("debug")     — set global log level (none/error/warn/info/debug/trace)',
            '  __log.enable("Cache")       — enable a category',
            '  __log.disable("Perf")       — disable a category',
            "  __log.enableAll()           — remove all category filters",
            "  __log.categories()          — show current category filters",
            "",
            "URL params: ?logLevel=debug&logCategories=Cache,Renderer",
          ].join("\n"),
        );
      },
    };
  }
  setLevel(level) {
    if (typeof level == "string") {
      const levelNumber = logLevelByName[level.toLowerCase()];
      if (levelNumber !== undefined) {
        this.level = levelNumber;
      }
    } else {
      this.level = level;
    }
  }
  getLevel() {
    return this.level;
  }
  error(category, ...values) {
    this.addBreadcrumb("error", category, values);
    if (this.errorSink) {
      try {
        this.errorSink(category, values);
      } catch {}
    }
    if (this.shouldLog(1, category)) {
      console.error(`[${category}]`, ...values);
    }
  }
  warn(category, ...values) {
    this.addBreadcrumb("warn", category, values);
    if (this.shouldLog(2, category)) {
      console.warn(`[${category}]`, ...values);
    }
  }
  info(category, ...values) {
    this.addBreadcrumb("info", category, values);
    if (this.shouldLog(3, category)) {
      console.log(`[${category}]`, ...values);
    }
  }
  debug(category, ...values) {
    if (this.shouldLog(4, category)) {
      console.log(`[${logLevelLabels[4]}][${category}]`, ...values);
    }
  }
  trace(category, ...values) {
    if (this.shouldLog(5, category)) {
      console.log(`[${logLevelLabels[5]}][${category}]`, ...values);
    }
  }
  isEnabled(level, category) {
    return this.shouldLog(level, category);
  }
  setErrorSink(errorSink) {
    this.errorSink = errorSink;
  }
  getBreadcrumbs() {
    return this.breadcrumbs;
  }
  addBreadcrumb(level, category, values) {
    try {
      if (this.breadcrumbs.length === 30) {
        this.breadcrumbs.shift();
      }
      this.breadcrumbs.push({
        level: level,
        category: category,
        message: formatBreadcrumbMessage(values),
        at: Date.now(),
      });
    } catch {}
  }
  clearBreadcrumbs() {
    this.breadcrumbs.length = 0;
  }
  shouldLog(level, category) {
    if (level > this.level) {
      return false;
    }
    if (category) {
      if (this.disabledCategories.has(category)) {
        return false;
      }
      if (this.enabledCategories && !this.enabledCategories.has(category)) {
        return false;
      }
    }
    return true;
  }
  getLevelName() {
    for (const [name, level] of Object.entries(logLevelByName)) {
      if (level === this.level) {
        return name;
      }
    }
    return "unknown";
  }
  readUrlParams() {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const logLevel = searchParams.get("logLevel");
      if (logLevel) {
        this.setLevel(logLevel);
      }
      const logCategories = searchParams.get("logCategories");
      if (logCategories) {
        this.enabledCategories = new Set(
          logCategories
            .split(",")
            .map((category) => category.trim())
            .filter(Boolean),
        );
      }
    } catch {}
  }
})();
export { LogLevel, logger };
