const prisma = require("../src/config/prisma");

async function upsertEntityWithRequirements(entity) {
  const savedEntity = await prisma.entityType.upsert({
    where: { key: entity.key },
    update: {
      label: entity.label,
      panChar: entity.panChar,
      description: entity.description,
      isActive: true
    },
    create: {
      key: entity.key,
      label: entity.label,
      panChar: entity.panChar,
      description: entity.description,
      isActive: true
    }
  });

  for (const requirement of entity.requirements) {
    await prisma.documentRequirement.upsert({
      where: {
        entityTypeId_documentKey: {
          entityTypeId: savedEntity.id,
          documentKey: requirement.documentKey
        }
      },
      update: {
        documentName: requirement.documentName,
        inputMode: requirement.inputMode,
        isRequired: requirement.isRequired,
        needsFront: requirement.needsFront,
        needsBack: requirement.needsBack,
        ocrEnabled: requirement.ocrEnabled,
        sortOrder: requirement.sortOrder,
        isActive: true
      },
      create: {
        entityTypeId: savedEntity.id,
        documentKey: requirement.documentKey,
        documentName: requirement.documentName,
        inputMode: requirement.inputMode,
        isRequired: requirement.isRequired,
        needsFront: requirement.needsFront,
        needsBack: requirement.needsBack,
        ocrEnabled: requirement.ocrEnabled,
        sortOrder: requirement.sortOrder,
        isActive: true
      }
    });
  }
}

async function main() {
  const entities = [
    {
      key: "individual",
      label: "Individual",
      panChar: "P",
      description: "Individual PAN holder",
      requirements: [
        {
          documentKey: "pan_card",
          documentName: "PAN Card",
          inputMode: "live_photo_front",
          isRequired: true,
          needsFront: true,
          needsBack: false,
          ocrEnabled: true,
          sortOrder: 1
        },
        {
          documentKey: "identity_proof",
          documentName: "Aadhaar / Driving Licence / Passport",
          inputMode: "live_photo_front_back",
          isRequired: true,
          needsFront: true,
          needsBack: true,
          ocrEnabled: true,
          sortOrder: 2
        },
        {
          documentKey: "live_video_declaration",
          documentName: "Live Video Declaration",
          inputMode: "live_video",
          isRequired: true,
          needsFront: false,
          needsBack: false,
          ocrEnabled: false,
          sortOrder: 3
        }
      ]
    },
    {
      key: "company",
      label: "Company",
      panChar: "C",
      description: "Company PAN holder",
      requirements: [
        {
          documentKey: "company_pan",
          documentName: "Company PAN Proof",
          inputMode: "upload_or_live_photo",
          isRequired: true,
          needsFront: true,
          needsBack: false,
          ocrEnabled: true,
          sortOrder: 1
        },
        {
          documentKey: "certificate_of_incorporation",
          documentName: "Certificate of Incorporation",
          inputMode: "upload",
          isRequired: true,
          needsFront: false,
          needsBack: false,
          ocrEnabled: true,
          sortOrder: 2
        },
        {
          documentKey: "gst_certificate",
          documentName: "GST Certificate",
          inputMode: "upload",
          isRequired: false,
          needsFront: false,
          needsBack: false,
          ocrEnabled: true,
          sortOrder: 3
        },
        {
          documentKey: "board_resolution",
          documentName: "Board Resolution / Authorization Letter",
          inputMode: "upload",
          isRequired: true,
          needsFront: false,
          needsBack: false,
          ocrEnabled: false,
          sortOrder: 4
        },
        {
          documentKey: "live_video_declaration",
          documentName: "Live Video Declaration",
          inputMode: "live_video",
          isRequired: true,
          needsFront: false,
          needsBack: false,
          ocrEnabled: false,
          sortOrder: 5
        }
      ]
    },
    {
      key: "firm_llp",
      label: "Firm / LLP",
      panChar: "F",
      description: "Firm or LLP PAN holder",
      requirements: [
        {
          documentKey: "firm_llp_pan",
          documentName: "Firm / LLP PAN Proof",
          inputMode: "upload_or_live_photo",
          isRequired: true,
          needsFront: true,
          needsBack: false,
          ocrEnabled: true,
          sortOrder: 1
        },
        {
          documentKey: "gst_certificate",
          documentName: "GST Certificate",
          inputMode: "upload",
          isRequired: false,
          needsFront: false,
          needsBack: false,
          ocrEnabled: true,
          sortOrder: 2
        },
        {
          documentKey: "partnership_deed",
          documentName: "Partnership Deed / LLP Agreement",
          inputMode: "upload",
          isRequired: true,
          needsFront: false,
          needsBack: false,
          ocrEnabled: false,
          sortOrder: 3
        },
        {
          documentKey: "authorization_letter",
          documentName: "Authorization Letter",
          inputMode: "upload",
          isRequired: true,
          needsFront: false,
          needsBack: false,
          ocrEnabled: false,
          sortOrder: 4
        },
        {
          documentKey: "live_video_declaration",
          documentName: "Live Video Declaration",
          inputMode: "live_video",
          isRequired: true,
          needsFront: false,
          needsBack: false,
          ocrEnabled: false,
          sortOrder: 5
        }
      ]
    }
  ];

  for (const entity of entities) {
    await upsertEntityWithRequirements(entity);
  }

  console.log("Default entity types and document requirements seeded successfully.");
}

main()
  .catch((error) => {
    console.error("Seed error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
