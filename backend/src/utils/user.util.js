const prisma = require("../config/prisma");

/**
 * Resolves user ids (reviewedBy / audit actorId) to display names so the
 * UI can show WHO did each action. Unknown ids (legacy "dev-reviewer",
 * system actors) simply resolve to undefined.
 */
async function buildUserNameMap(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, fullName: true, role: true }
  });

  return new Map(users.map((user) => [user.id, user]));
}

module.exports = {
  buildUserNameMap
};
