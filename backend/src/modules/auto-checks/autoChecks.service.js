const prisma = require("../../config/prisma");

/**
 * Rule-based verification engine. Results are ADVISORY ONLY —
 * they assist the human reviewer and never auto-approve/reject.
 *
 * Runs after buyer submission (and resubmission). Re-running replaces
 * previous results for the KYC.
 */
async function runAutoChecksForKyc(kycId) {
  const kyc = await prisma.kycMaster.findUnique({
    where: { id: kycId },
    include: {
      documentSubmissions: {
        include: {
          files: { where: { isCurrent: true } }
        }
      },
      videoDeclaration: true
    }
  });

  if (!kyc) return [];

  const checks = [];

  // 1. Duplicate file hash — same file uploaded for different documents.
  const hashMap = new Map();

  for (const submission of kyc.documentSubmissions) {
    for (const file of submission.files) {
      if (!file.fileHash) continue;
      if (!hashMap.has(file.fileHash)) hashMap.set(file.fileHash, []);
      hashMap.get(file.fileHash).push({
        documentKey: submission.documentKey,
        documentName: submission.documentName,
        fileSlot: file.fileSlot
      });
    }
  }

  const duplicates = [...hashMap.entries()]
    .filter(([, usages]) => {
      const distinctDocs = new Set(usages.map((u) => u.documentKey));
      return distinctDocs.size > 1;
    })
    .map(([hash, usages]) => ({ hash: hash.slice(0, 12), usages }));

  checks.push({
    checkKey: "duplicate_file_hash",
    passed: duplicates.length === 0,
    details:
      duplicates.length === 0
        ? { message: "No identical file used for multiple documents." }
        : { message: "Same file reused across documents.", duplicates }
  });

  // 2. Required document completeness.
  const requiredDocs = kyc.documentSubmissions.filter((doc) => doc.isRequired);
  const incomplete = requiredDocs.filter(
    (doc) => !["submitted", "accepted"].includes(doc.status)
  );

  checks.push({
    checkKey: "required_documents_complete",
    passed: incomplete.length === 0,
    details:
      incomplete.length === 0
        ? { message: "All required documents are submitted." }
        : {
            message: "Some required documents are not submitted.",
            missing: incomplete.map((doc) => doc.documentName)
          }
  });

  // 2b. PAN card validation (recorded at upload by the external recognizer).
  const panRecords = kyc.documentSubmissions
    .filter((doc) => /pan/i.test(doc.documentKey))
    .flatMap((doc) =>
      doc.files
        .filter((file) => file.metadata?.panValidation)
        .map((file) => ({
          documentName: doc.documentName,
          ...file.metadata.panValidation
        }))
    );

  if (panRecords.length > 0) {
    const anyAccepted = panRecords.some((r) => r.status === "accepted");
    const anyRejected = panRecords.some((r) => r.status === "rejected");
    const anyPanMismatch = panRecords.some((r) => r.panMatchesPurchase === false);
    const anyEntityMismatch = panRecords.some(
      (r) => r.classificationMatchesEntity === false
    );

    let message;
    if (!anyAccepted && anyRejected) {
      message = "External validator rejected a PAN card image.";
    } else if (anyPanMismatch) {
      message =
        "PAN card recognized, but its PAN number does not match the purchase PAN.";
    } else if (anyEntityMismatch) {
      message =
        "PAN card recognized, but its holder type does not match the KYC entity.";
    } else if (anyAccepted) {
      message = "PAN card recognized by the external validator.";
    } else {
      message = "PAN card could not be auto-validated.";
    }

    checks.push({
      checkKey: "pan_card_validation",
      passed: anyAccepted && !anyRejected && !anyPanMismatch && !anyEntityMismatch,
      details: { message, records: panRecords }
    });
  }

  // 3. PAN/entity consistency (validated at intake; recorded for the reviewer).
  checks.push({
    checkKey: "pan_entity_consistency",
    passed: true,
    details: {
      message: `PAN 4th character '${kyc.entityChar}' matches entity type '${kyc.entityType}'.`
    }
  });

  // 4. Video face check — CLIENT-REPORTED, advisory only.
  if (kyc.videoDeclaration) {
    const meta = kyc.videoDeclaration.faceQualityMetadata || {};

    checks.push({
      checkKey: "video_face_check_client_reported",
      passed: kyc.videoDeclaration.faceCheckPassed,
      score:
        typeof meta.faceVisibleRatio === "number"
          ? Math.round(meta.faceVisibleRatio * 100)
          : null,
      details: {
        message:
          "Reported by the buyer's browser (MediaPipe). NOT server-verified — treat as advisory.",
        metadata: meta
      }
    });
  }

  // 5. Declarant name vs buyer name similarity (simple token overlap).
  if (kyc.videoDeclaration) {
    const score = nameSimilarity(
      kyc.videoDeclaration.businessName || "",
      kyc.buyerName || ""
    );

    checks.push({
      checkKey: "business_name_match",
      passed: score >= 60,
      score,
      details: {
        message: `Video declaration business name vs purchase buyer name similarity: ${score}%.`,
        declared: kyc.videoDeclaration.businessName,
        purchase: kyc.buyerName
      }
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.kycAutoCheck.deleteMany({ where: { kycId } });

    for (const check of checks) {
      await tx.kycAutoCheck.create({
        data: {
          kycId,
          checkKey: check.checkKey,
          passed: check.passed,
          score: check.score ?? null,
          details: check.details
        }
      });
    }

    await tx.kycAuditLog.create({
      data: {
        kycId,
        actorType: "system",
        action: "auto_checks_completed",
        metadata: {
          total: checks.length,
          failed: checks.filter((c) => c.passed === false).map((c) => c.checkKey)
        }
      }
    });
  });

  return checks;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(private|pvt|limited|ltd|llp|llc)\.?/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Token-overlap similarity (0-100). Cheap, deterministic, good enough
 * to flag obvious mismatches for the reviewer.
 */
function nameSimilarity(a, b) {
  const tokensA = new Set(normalizeName(a));
  const tokensB = new Set(normalizeName(b));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let common = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) common += 1;
  }

  return Math.round((2 * common * 100) / (tokensA.size + tokensB.size));
}

async function getAutoChecksForKyc(kycId) {
  return prisma.kycAutoCheck.findMany({
    where: { kycId },
    orderBy: { checkKey: "asc" }
  });
}

module.exports = {
  runAutoChecksForKyc,
  getAutoChecksForKyc,
  nameSimilarity
};
