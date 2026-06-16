const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");

const env = require("./env");

/**
 * Live flow logger (development tool).
 *
 * Writes a human-readable trace of every HTTP request and every database
 * operation it triggers to `logs/<FLOW_LOG_FILE>`, correlated by a short
 * request id. Tail it to watch the whole KYC flow with live data:
 *
 *   PowerShell:  Get-Content backend/logs/flow.log -Wait -Tail 50
 *   bash:        tail -f backend/logs/flow.log
 *
 * Forced OFF in production (it would log SQL + args).
 */

const flowContext = new AsyncLocalStorage();

function active() {
  return env.FLOW_LOG_ENABLED && !env.isProduction;
}

let stream = null;

function getStream() {
  if (!active()) return null;
  if (stream) return stream;

  const dir = path.join(process.cwd(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  stream = fs.createWriteStream(path.join(dir, env.FLOW_LOG_FILE), { flags: "a" });

  stream.write(
    `\n\n########## flow log started ${new Date().toISOString()} ##########\n`
  );
  return stream;
}

function write(line) {
  const s = getStream();
  if (s) s.write(line + "\n");
}

function nowIso() {
  return new Date().toISOString();
}

// ---- model name -> physical table name (from Prisma DMMF) ----
const modelTable = {};
(function loadModelMap() {
  try {
    const { Prisma } = require("@prisma/client");
    for (const m of Prisma.dmmf.datamodel.models) {
      modelTable[m.name] = m.dbName || m.name;
    }
  } catch {
    // dmmf unavailable — fall back to the model name
  }
})();

const OP_VERB = {
  create: "INSERT",
  createMany: "INSERT(many)",
  update: "UPDATE",
  updateMany: "UPDATE(many)",
  upsert: "UPSERT",
  delete: "DELETE",
  deleteMany: "DELETE(many)",
  findUnique: "SELECT",
  findUniqueOrThrow: "SELECT",
  findFirst: "SELECT",
  findFirstOrThrow: "SELECT",
  findMany: "SELECT(many)",
  count: "SELECT count",
  aggregate: "SELECT agg",
  groupBy: "SELECT groupBy"
};

const REDACT_KEYS = /pass(word)?|tokenhash|passwordhash/i;

function tableFor(model) {
  if (!model) return "(raw sql)";
  return modelTable[model] || model;
}

function verbFor(operation) {
  return OP_VERB[operation] || operation;
}

function safeStringify(value) {
  try {
    const json = JSON.stringify(value, (key, val) => {
      if (REDACT_KEYS.test(key)) return "***redacted***";
      if (typeof val === "bigint") return val.toString();
      if (typeof val === "string" && val.length > 80) {
        return `${val.slice(0, 77)}...`;
      }
      return val;
    });
    if (!json) return String(value);
    return json.length > 600 ? `${json.slice(0, 597)}...` : json;
  } catch {
    return "[unserializable]";
  }
}

// ---- Express middleware: opens a request context + writes start/end ----
function flowLogMiddleware(req, res, next) {
  if (!active()) return next();

  const ctx = {
    requestId: crypto.randomBytes(3).toString("hex"),
    queryCount: 0,
    start: Date.now()
  };

  flowContext.run(ctx, () => {
    write("");
    write("================================================================");
    write(`>>> REQUEST [${ctx.requestId}] ${req.method} ${req.originalUrl}`);
    write(`    ${nowIso()}  ip=${req.ip || "-"}`);

    res.on("finish", () => {
      const ms = Date.now() - ctx.start;
      write(
        `<<< END     [${ctx.requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode}  (${ms}ms, ${ctx.queryCount} queries)`
      );
    });

    next();
  });
}

function logOp({ model, operation, args, ms, ok, error }) {
  const ctx = flowContext.getStore();
  const id = ctx ? ctx.requestId : "------";
  if (ctx) ctx.queryCount += 1;

  write(
    `   [${id}] ${verbFor(operation).padEnd(13)} ${tableFor(model)}.${operation}  (${ms}ms)${ok ? "" : "  FAILED"}`
  );

  if (args && Object.keys(args).length) {
    write(`   [${id}]    args: ${safeStringify(args)}`);
  }
  if (!ok) {
    write(`   [${id}]    error: ${String(error && error.message).slice(0, 200)}`);
  }
}

// ---- Prisma wiring: raw SQL event + per-operation interceptor ----
function attachQueryLogging(baseClient) {
  if (!active()) return baseClient;

  if (env.FLOW_LOG_SQL) {
    try {
      baseClient.$on("query", (e) => {
        const ctx = flowContext.getStore();
        const id = ctx ? ctx.requestId : "------";
        const sql = String(e.query || "").replace(/\s+/g, " ").trim();
        write(`   [${id}]      sql: ${sql}  (${e.duration}ms)`);
        if (e.params && e.params !== "[]") {
          write(`   [${id}]      params: ${String(e.params).slice(0, 300)}`);
        }
      });
    } catch {
      // query event not emitted with this adapter — model-level log still works
    }
  }

  return baseClient.$extends({
    query: {
      async $allOperations({ model, operation, args, query }) {
        const start = Date.now();
        try {
          const result = await query(args);
          logOp({ model, operation, args, ms: Date.now() - start, ok: true });
          return result;
        } catch (error) {
          logOp({ model, operation, args, ms: Date.now() - start, ok: false, error });
          throw error;
        }
      }
    }
  });
}

module.exports = {
  flowContext,
  flowLogMiddleware,
  attachQueryLogging
};
