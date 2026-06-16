require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const env = require("./env");
const { attachQueryLogging } = require("./flowLogger");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL
});

const base = new PrismaClient({
  adapter,
  // Emit raw-SQL query events only when the dev flow log wants them.
  log:
    env.FLOW_LOG_ENABLED && env.FLOW_LOG_SQL && !env.isProduction
      ? [{ level: "query", emit: "event" }]
      : []
});

// Wraps every DB operation with the live flow logger (no-op when disabled).
const prisma = attachQueryLogging(base);

module.exports = prisma;
