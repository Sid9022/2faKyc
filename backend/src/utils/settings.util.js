const prisma = require("../config/prisma");

const DEFAULTS = {
  max_reminders: 5,
  reminder_interval_hours: 24,
  consent_version: "v1",
  video_script_version: "v1"
};

async function getSetting(key) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (row) return row.value;
  return DEFAULTS[key] !== undefined ? DEFAULTS[key] : null;
}

async function getAllSettings() {
  const rows = await prisma.appSetting.findMany();
  const result = { ...DEFAULTS };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

async function setSetting(key, value, updatedBy = null) {
  return prisma.appSetting.upsert({
    where: { key },
    update: { value, updatedBy },
    create: { key, value, updatedBy }
  });
}

module.exports = {
  DEFAULTS,
  getSetting,
  getAllSettings,
  setSetting
};
