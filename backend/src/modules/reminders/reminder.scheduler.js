const prisma = require("../../config/prisma");
const env = require("../../config/env");
const { decryptField } = require("../../utils/crypto.util");
const { getSetting } = require("../../utils/settings.util");
const { createSecureKycLinkForKyc } = require("../kyc-link/kycLink.service");
const { sendKycEmail } = require("../email/email.service");
const { kycReminderEmail } = require("../email/email.templates");

const REMINDABLE_STATUSES = [
  "link_sent",
  "opened",
  "in_progress",
  "resubmission_required"
];

let isRunning = false;

async function processDueReminders() {
  const now = new Date();

  const dueStates = await prisma.reminderState.findMany({
    where: {
      exhausted: false,
      nextDueAt: { lte: now }
    },
    take: 50
  });

  if (dueStates.length === 0) return 0;

  const intervalHours = Number(await getSetting("reminder_interval_hours")) || 24;
  let processed = 0;

  for (const state of dueStates) {
    const kyc = await prisma.kycMaster.findUnique({
      where: { id: state.kycId }
    });

    // KYC finished or no longer remindable — stop tracking it.
    if (!kyc || !REMINDABLE_STATUSES.includes(kyc.overallStatus)) {
      await prisma.reminderState.update({
        where: { id: state.id },
        data: { exhausted: true }
      });
      continue;
    }

    if (state.reminderCount >= state.maxReminders) {
      await prisma.reminderState.update({
        where: { id: state.id },
        data: { exhausted: true }
      });

      await prisma.kycAuditLog.create({
        data: {
          kycId: kyc.id,
          actorType: "system",
          action: "reminder_limit_exhausted",
          metadata: {
            reminderCount: state.reminderCount,
            maxReminders: state.maxReminders,
            note: "Escalation required — buyer never completed KYC."
          }
        }
      });
      continue;
    }

    // The raw token is never stored, so each reminder issues a fresh link
    // (the previous emailed link is revoked — standard magic-link rotation).
    const secureLink = await createSecureKycLinkForKyc(kyc.id, {
      preserveStatus: true,
      requestMeta: {}
    });

    const reminderNumber = state.reminderCount + 1;

    const template = kycReminderEmail({
      buyerName: kyc.buyerName,
      kycUrl: secureLink.buyerKycUrl,
      reminderNumber,
      maxReminders: state.maxReminders
    });

    await sendKycEmail({
      kycId: kyc.id,
      emailType: "kyc_reminder",
      to: decryptField(kyc.buyerEmail),
      subject: template.subject,
      body: template.body
    });

    const nextDueAt = new Date();
    nextDueAt.setHours(nextDueAt.getHours() + intervalHours);

    await prisma.reminderState.update({
      where: { id: state.id },
      data: {
        reminderCount: reminderNumber,
        lastReminderAt: new Date(),
        nextDueAt,
        exhausted: reminderNumber >= state.maxReminders
      }
    });

    await prisma.kycAuditLog.create({
      data: {
        kycId: kyc.id,
        actorType: "system",
        action: "reminder_sent",
        metadata: {
          reminderNumber,
          maxReminders: state.maxReminders
        }
      }
    });

    processed += 1;
  }

  return processed;
}

async function tick() {
  if (isRunning) return;
  isRunning = true;

  try {
    const processed = await processDueReminders();
    if (processed > 0) {
      console.log(`[reminders] Sent ${processed} reminder(s).`);
    }
  } catch (error) {
    console.error("[reminders] Scheduler error:", error.message);
  } finally {
    isRunning = false;
  }
}

let intervalHandle = null;

function startReminderScheduler() {
  if (!env.REMINDER_SCHEDULER_ENABLED) {
    console.log("[reminders] Scheduler disabled (REMINDER_SCHEDULER_ENABLED=false).");
    return;
  }

  // Check every 15 minutes; reminder cadence itself is settings-driven.
  intervalHandle = setInterval(tick, 15 * 60 * 1000);
  intervalHandle.unref();

  // First pass shortly after boot.
  setTimeout(tick, 10 * 1000).unref();

  console.log("[reminders] Scheduler started (every 15 minutes).");
}

function stopReminderScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
  processDueReminders
};
