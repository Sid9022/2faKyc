/**
 * Email templates. Plain text with simple HTML — the Dial2Verify gateway
 * takes the body as a single Msg parameter.
 */

function kycLinkEmail({ buyerName, kycUrl, expiresAt }) {
  const expiry = new Date(expiresAt).toDateString();

  return {
    subject: "Complete your 2Factor KYC verification",
    body:
      `Dear ${buyerName},\n\n` +
      `Thank you for your purchase. To activate your service, please complete your KYC verification using the secure link below:\n\n` +
      `${kycUrl}\n\n` +
      `This link is valid until ${expiry}. You will need:\n` +
      `- Your identity / business documents\n` +
      `- A device with a camera for the live video declaration\n\n` +
      `If you did not make this purchase, please ignore this email.\n\n` +
      `Regards,\n2Factor KYC Team`
  };
}

function kycReminderEmail({ buyerName, kycUrl, reminderNumber, maxReminders }) {
  return {
    subject: `Reminder ${reminderNumber}/${maxReminders}: Your 2Factor KYC is pending`,
    body:
      `Dear ${buyerName},\n\n` +
      `Your KYC verification is still pending. Your service cannot be activated until KYC is complete.\n\n` +
      `Complete it here: ${kycUrl}\n\n` +
      `Regards,\n2Factor KYC Team`
  };
}

function resubmissionEmail({ buyerName, kycUrl, failedItems, remarks }) {
  const itemList = (failedItems || []).map((item) => `- ${item}`).join("\n");

  return {
    subject: "Action needed: some KYC items require correction",
    body:
      `Dear ${buyerName},\n\n` +
      `Our review team checked your KYC submission. The following item(s) need correction:\n\n` +
      `${itemList}\n\n` +
      (remarks ? `Reviewer note: ${remarks}\n\n` : "") +
      `Please open your KYC link and resubmit only the items listed above. Everything already accepted stays accepted.\n\n` +
      `${kycUrl}\n\n` +
      `Regards,\n2Factor KYC Team`
  };
}

function kycApprovedEmail({ buyerName }) {
  return {
    subject: "Your 2Factor KYC has been approved",
    body:
      `Dear ${buyerName},\n\n` +
      `Your KYC verification is complete and approved. Your service is now active.\n\n` +
      `Regards,\n2Factor KYC Team`
  };
}

function kycRejectedEmail({ buyerName, remarks }) {
  return {
    subject: "Update on your 2Factor KYC verification",
    body:
      `Dear ${buyerName},\n\n` +
      `Unfortunately your KYC verification could not be approved.\n\n` +
      (remarks ? `Reason: ${remarks}\n\n` : "") +
      `Please contact support if you believe this is an error.\n\n` +
      `Regards,\n2Factor KYC Team`
  };
}

module.exports = {
  kycLinkEmail,
  kycReminderEmail,
  resubmissionEmail,
  kycApprovedEmail,
  kycRejectedEmail
};
