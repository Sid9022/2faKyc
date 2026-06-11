const { login, refresh, logout, getMe } = require("./auth.service");
const { getRequestMeta } = require("../../utils/request.util");

async function loginHandler(req, res, next) {
  try {
    const result = await login(
      req.body?.email,
      req.body?.password,
      getRequestMeta(req)
    );

    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function refreshHandler(req, res, next) {
  try {
    const result = await refresh(req.body?.refreshToken, getRequestMeta(req));
    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function logoutHandler(req, res, next) {
  try {
    const result = await logout(req.body?.refreshToken);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

async function meHandler(req, res, next) {
  try {
    const result = await getMe(req.user.id);
    return res.status(result.statusCode || 200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  loginHandler,
  refreshHandler,
  logoutHandler,
  meHandler
};
