const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const prisma = require("../../config/prisma");
const env = require("../../config/env");
const { sha256 } = require("../../utils/crypto.util");

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      name: user.fullName,
      email: user.email
    },
    env.JWT_SECRET,
    {
      expiresIn: env.ACCESS_TOKEN_TTL,
      issuer: "kyc-api",
      audience: "kyc-app"
    }
  );
}

function refreshTokenExpiry() {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expiry;
}

async function issueRefreshToken(userId, requestMeta = {}) {
  const rawToken = crypto.randomBytes(48).toString("hex");

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(rawToken, env.JWT_SECRET),
      expiresAt: refreshTokenExpiry(),
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null
    }
  });

  return rawToken;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role
  };
}

async function login(email, password, requestMeta = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  // Run bcrypt either way so response timing doesn't reveal which emails exist.
  const passwordMatches = await bcrypt.compare(
    String(password || ""),
    user?.passwordHash || "$2a$10$invalidinvalidinvalidinvalidinvalidinvalu"
  );

  if (!user || !passwordMatches || user.status !== "active") {
    await prisma.kycAuditLog.create({
      data: {
        actorType: user ? user.role : "system",
        actorId: user?.id || null,
        action: "login_failed",
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        metadata: { emailMasked: normalizedEmail.slice(0, 2) + "***" }
      }
    });

    return {
      success: false,
      statusCode: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password."
    };
  }

  const refreshToken = await issueRefreshToken(user.id, requestMeta);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  await prisma.kycAuditLog.create({
    data: {
      actorType: user.role,
      actorId: user.id,
      action: "login_succeeded",
      ipAddress: requestMeta.ipAddress || null,
      userAgent: requestMeta.userAgent || null,
      metadata: { role: user.role }
    }
  });

  return {
    success: true,
    message: "Login successful.",
    accessToken: signAccessToken(user),
    refreshToken,
    user: publicUser(user)
  };
}

async function refresh(rawRefreshToken, requestMeta = {}) {
  if (!rawRefreshToken) {
    return {
      success: false,
      statusCode: 400,
      code: "REFRESH_TOKEN_REQUIRED",
      message: "Refresh token is required."
    };
  }

  const tokenHash = sha256(rawRefreshToken, env.JWT_SECRET);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (
    !stored ||
    stored.revokedAt ||
    stored.expiresAt <= new Date() ||
    stored.user.status !== "active"
  ) {
    if (stored && stored.revokedAt) {
      // Replay detected! Revoke all active tokens for this user.
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      console.warn(`[auth] Refresh token reuse detected for user ${stored.userId}. All sessions revoked.`);
    }

    return {
      success: false,
      statusCode: 401,
      code: "INVALID_REFRESH_TOKEN",
      message: "Session expired. Please log in again."
    };
  }

  // Rotate: revoke the old token, issue a new one.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() }
  });

  const newRefreshToken = await issueRefreshToken(stored.userId, requestMeta);

  return {
    success: true,
    accessToken: signAccessToken(stored.user),
    refreshToken: newRefreshToken,
    user: publicUser(stored.user)
  };
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) {
    return { success: true, message: "Logged out." };
  }

  const tokenHash = sha256(rawRefreshToken, env.JWT_SECRET);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  return { success: true, message: "Logged out." };
}

async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || user.status !== "active") {
    return {
      success: false,
      statusCode: 401,
      code: "INVALID_TOKEN",
      message: "User not found or disabled."
    };
  }

  return { success: true, user: publicUser(user) };
}

module.exports = {
  login,
  refresh,
  logout,
  getMe
};
