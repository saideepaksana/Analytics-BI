/**
 * Simple authentication middleware that extracts user info from headers
 * In a real app, this would validate JWT tokens, etc.
 */
const authMiddleware = (req, res, next) => {
  const userId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];

  if (userId && userRole) {
    req.user = {
      id: userId,
      role: userRole,
      email: userId // assuming email is the ID
    };
  } else {
    req.user = null;
  }

  next();
};

module.exports = authMiddleware;