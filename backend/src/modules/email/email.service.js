const prisma = require("../../config/prisma");
const env = require("../../config/env");
const { sha256, maskEmail } = require("../../utils/crypto.util");

/**
 * Sends email through the Dial2Verify HTTP gateway directly from Node
 * (native fetch) — no PHP microservice needed. The gateway takes
 * Subject / From / To / Msg as query parameters.
 *
 * When EMAIL_ENABLED=false (default in dev), emails are logged with
 * status "simulated" instead of hitting the provider.
 */

async function callProvider({ to, subject, body }) {
  const url = new URL(env.EMAIL_PROVIDER_URL);
  url.searchParams.set("Subject", subject);
  url.searchParams.set("From", env.EMAIL_FROM);
  url.searchParams.set("To", to);
  url.searchParams.set("Msg", body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal
    });

    const text = await response.text();

    return {
      ok: response.ok,
      statusCode: response.status,
      responseBody: text.slice(0, 2000)
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire-and-record email send. Never throws — a failed email must not
 * break the KYC workflow; failures are visible in email_logs.
 */
async function sendKycEmail({ kycId, emailType, to, subject, body }) {
  const log = await prisma.emailLog.create({
    data: {
      kycId: kycId || null,
      emailType,
      recipientHash: sha256(String(to).toLowerCase()),
      recipientMasked: maskEmail(to),
      subject,
      status: "queued"
    }
  });

  if (!env.EMAIL_ENABLED) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: "simulated",
        sentAt: new Date(),
        providerResponse: { note: "EMAIL_ENABLED=false — not sent", bodyPreview: body.slice(0, 500) }
      }
    });

    console.log(`[email] SIMULATED ${emailType} -> ${maskEmail(to)}: ${subject}`);
    return { success: true, simulated: true, emailLogId: log.id };
  }

  try {
    const result = await callProvider({ to, subject, body });

    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: result.ok ? "sent" : "failed",
        sentAt: result.ok ? new Date() : null,
        attemptCount: { increment: 1 },
        providerResponse: {
          statusCode: result.statusCode,
          body: result.responseBody
        },
        error: result.ok ? null : `Provider returned HTTP ${result.statusCode}`
      }
    });

    return { success: result.ok, emailLogId: log.id };
  } catch (error) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        attemptCount: { increment: 1 },
        error: String(error.message || error).slice(0, 500)
      }
    });

    console.error(`[email] FAILED ${emailType} -> ${maskEmail(to)}:`, error.message);
    return { success: false, emailLogId: log.id };
  }
}

async function listEmailLogs(filters = {}) {
  const where = {};
  if (filters.kycId) where.kycId = filters.kycId;
  if (filters.status) where.status = filters.status;
  if (filters.emailType) where.emailType = filters.emailType;

  return prisma.emailLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 100, 500)
  });
}

module.exports = {
  sendKycEmail,
  listEmailLogs
};
