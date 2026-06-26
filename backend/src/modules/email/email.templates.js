/**
 * HTML email templates. Email clients need table layouts + inline CSS,
 * so everything is styled inline. Each template returns { subject, body }.
 */

const BRAND = {
  name: "2Factor KYC",
  accent: "#2563eb",
  dark: "#0a0a0a",
  text: "#374151",
  muted: "#6b7280",
  bg: "#f4f5f7",
  cardBg: "#ffffff",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626"
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function button(label, url, color = BRAND.accent) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto;">
      <tr>
        <td style="border-radius:12px;background:${color};">
          <a href="${url}" target="_blank"
             style="display:inline-block;padding:14px 36px;font-family:Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:${BRAND.muted};text-align:center;">
      Button not working? Copy this link into your browser:<br/>
      <a href="${url}" style="color:${BRAND.accent};word-break:break-all;">${url}</a>
    </p>`;
}

function badge(label, color) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 18px;">
      <tr>
        <td style="border-radius:999px;background:${color}1a;padding:6px 18px;">
          <span style="font-family:Segoe UI,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${color};">
            ${escapeHtml(label)}
          </span>
        </td>
      </tr>
    </table>`;
}

function listBox(items, color = BRAND.warning) {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:${BRAND.text};">
          <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${color};margin-right:10px;"></span>
          ${escapeHtml(item)}
        </td>
      </tr>`
    )
    .join("");

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:20px 0;background:${color}0d;border:1px solid ${color}33;border-radius:14px;">
      <tr><td style="padding:16px 22px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
    </table>`;
}

function noteBox(label, text, color = BRAND.warning) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:20px 0;background:${color}0d;border:1px solid ${color}33;border-radius:14px;">
      <tr><td style="padding:16px 22px;">
        <p style="margin:0 0 6px;font-family:Segoe UI,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${color};">
          ${escapeHtml(label)}
        </p>
        <p style="margin:0;font-family:Segoe UI,Arial,sans-serif;font-size:14px;line-height:22px;color:${BRAND.text};">
          ${escapeHtml(text)}
        </p>
      </td></tr>
    </table>`;
}

/**
 * Shared shell: dark branded header, white card, footer.
 */
function layout({ preheader, heading, contentHtml }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
    <tr><td align="center">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:${BRAND.dark};border-radius:20px 20px 0 0;padding:28px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="font-family:Segoe UI,Arial,sans-serif;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                    2Factor<span style="color:${BRAND.accent};">&nbsp;KYC</span>
                  </span>
                </td>
                <td align="right">
                  <span style="font-family:Segoe UI,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">
                    Secure verification
                  </span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body card -->
        <tr>
          <td style="background:${BRAND.cardBg};padding:40px;border-radius:0 0 20px 20px;border:1px solid #e5e7eb;border-top:0;">
            ${contentHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:26px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:${BRAND.muted};">
              This is an automated message from ${BRAND.name}. Please do not reply to this email.
            </p>
            <p style="margin:0;font-family:Segoe UI,Arial,sans-serif;font-size:12px;color:#9ca3af;">
              If you did not expect this email, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>

    </td></tr>
  </table>
</body>
</html>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 16px;font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:24px;color:${BRAND.text};">${text}</p>`;
}

function headingHtml(text) {
  return `<h1 style="margin:0 0 18px;font-family:Segoe UI,Arial,sans-serif;font-size:24px;line-height:32px;font-weight:800;color:${BRAND.dark};text-align:center;letter-spacing:-0.5px;">${escapeHtml(text)}</h1>`;
}

// ---------- Templates ----------

function kycLinkEmail({ buyerName, kycUrl, expiresAt }) {
  const expiry = new Date(expiresAt).toDateString();

  return {
    subject: "Complete your 2Factor KYC verification",
    body: layout({
      preheader: "Complete your KYC to activate your 2Factor service.",
      heading: "Complete your KYC verification",
      contentHtml: `
        ${badge("Action required", BRAND.accent)}
        ${headingHtml("Complete your KYC verification")}
        ${paragraph(`Dear <strong>${escapeHtml(buyerName)}</strong>,`)}
        ${paragraph(
          "Thank you for your purchase. To activate your service, please complete your KYC verification using the secure button below."
        )}
        ${button("Start KYC verification", kycUrl)}
        ${paragraph(
          `<strong>Before you start, keep ready:</strong><br/>
           &nbsp;&nbsp;•&nbsp; Your identity / business documents<br/>
           &nbsp;&nbsp;•&nbsp; A device with a camera for the live video declaration`
        )}
        ${noteBox("Link validity", `This secure link is valid until ${expiry}.`, BRAND.accent)}
      `
    })
  };
}

function kycReminderEmail({
  buyerName,
  kycUrl,
  reminderNumber,
  maxReminders,
  mode = "fresh"
}) {
  // Bug B14: when the reminder fires for a KYC that's mid-resubmission,
  // the generic "complete your KYC" copy is misleading — the buyer
  // has already submitted; they just need to fix a few items. Branch
  // the template on `mode` so the copy matches reality.
  const isResubmission = mode === "resubmission_required";

  const subject = isResubmission
    ? `Reminder ${reminderNumber}/${maxReminders}: Some KYC items need correction`
    : `Reminder ${reminderNumber}/${maxReminders}: Your 2Factor KYC is pending`;

  const preheader = isResubmission
    ? "Your KYC has items that need correction. Click to fix them."
    : "Your KYC verification is still pending.";

  const heading = isResubmission
    ? "A small correction is needed"
    : "Your KYC is still pending";

  const body = isResubmission
    ? "Our review team has flagged some items in your KYC submission that need correction. You can re-submit just those items — anything already accepted stays locked. Click below to fix and re-submit."
    : "Your KYC verification has not been completed yet. Your service cannot be activated until it is done — it only takes a few minutes.";

  const cta = isResubmission ? "Fix and resubmit" : "Complete KYC now";

  return {
    subject,
    body: layout({
      preheader,
      heading,
      contentHtml: `
        ${badge(`Reminder ${reminderNumber} of ${maxReminders}`, BRAND.warning)}
        ${headingHtml(heading)}
        ${paragraph(`Dear <strong>${escapeHtml(buyerName)}</strong>,`)}
        ${paragraph(body)}
        ${button(cta, kycUrl, BRAND.warning)}
      `
    })
  };
}

function resubmissionEmail({ buyerName, kycUrl, failedItems, acceptedItems = [], remarks }) {
  const failed = Array.isArray(failedItems) ? failedItems : [];
  const accepted = Array.isArray(acceptedItems) ? acceptedItems : [];

  // Bug A2: when the reviewer only flagged a subset of items (e.g.
  // documents only, video already accepted), the email used to list
  // only the failed items and leave the buyer to wonder whether the
  // accepted ones were silently rejected. Render the accepted set
  // explicitly so the buyer knows which items are locked.
  const acceptedBlock = accepted.length
    ? `
        ${paragraph(
          "<strong>Already accepted (no action needed from you):</strong>"
        )}
        ${listBox(accepted, BRAND.success)}
      `
    : "";

  return {
    subject: "Action needed: some KYC items require correction",
    body: layout({
      preheader: "Some items in your KYC submission need correction.",
      heading: "Correction needed",
      contentHtml: `
        ${badge("Correction needed", BRAND.warning)}
        ${headingHtml("Some items need a quick fix")}
        ${paragraph(`Dear <strong>${escapeHtml(buyerName)}</strong>,`)}
        ${paragraph(
          "Our review team checked your KYC submission. Items that were already accepted stay locked — only the item(s) below need to be resubmitted:"
        )}
        ${listBox(failed, BRAND.warning)}
        ${acceptedBlock}
        ${remarks ? noteBox("Reviewer note", remarks, BRAND.warning) : ""}
        ${button("Fix and resubmit", kycUrl, BRAND.warning)}
      `
    })
  };
}

function kycApprovedEmail({ buyerName }) {
  return {
    subject: "Your 2Factor KYC has been approved 🎉",
    body: layout({
      preheader: "Your KYC verification is complete and approved.",
      heading: "KYC approved",
      contentHtml: `
        ${badge("Approved", BRAND.success)}
        ${headingHtml("You're verified! 🎉")}
        ${paragraph(`Dear <strong>${escapeHtml(buyerName)}</strong>,`)}
        ${paragraph(
          "Your KYC verification is <strong>complete and approved</strong>. Your 2Factor service is now active and ready to use."
        )}
        ${noteBox(
          "What happens next",
          "No further action is needed from your side. You can start using your service right away.",
          BRAND.success
        )}
      `
    })
  };
}

function kycRejectedEmail({ buyerName, remarks }) {
  return {
    subject: "Update on your 2Factor KYC verification",
    body: layout({
      preheader: "There is an update on your KYC verification.",
      heading: "KYC update",
      contentHtml: `
        ${badge("Not approved", BRAND.danger)}
        ${headingHtml("Your KYC could not be approved")}
        ${paragraph(`Dear <strong>${escapeHtml(buyerName)}</strong>,`)}
        ${paragraph(
          "Unfortunately your KYC verification could not be approved at this time."
        )}
        ${remarks ? noteBox("Reason", remarks, BRAND.danger) : ""}
        ${paragraph(
          "If you believe this is an error, please contact our support team and we will be happy to help."
        )}
      `
    })
  };
}

module.exports = {
  kycLinkEmail,
  kycReminderEmail,
  resubmissionEmail,
  kycApprovedEmail,
  kycRejectedEmail
};
