/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Provides granular role and ownership enforcement as Express middleware.
 * Works in tandem with the auth middleware which populates req.user.
 *
 * Roles hierarchy: admin > editor > viewer
 */

/**
 * requireAuth – blocks unauthenticated requests.
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  next();
};

/**
 * requireRole(roles) – returns middleware that only passes users whose role
 * is in the supplied allowlist.
 *
 * @param {string|string[]} roles - allowed role(s)
 */
const requireRole = (roles) => {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${allowed.join(' or ')}`,
        yourRole: req.user.role,
      });
    }
    next();
  };
};

/**
 * requireMinRole – only passes when user has AT LEAST the given role level.
 * Level order (ascending privilege): viewer < editor < admin
 */
const ROLE_LEVELS = { viewer: 0, editor: 1, admin: 2 };

const requireMinRole = (minRole) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  const userLevel = ROLE_LEVELS[req.user.role] ?? -1;
  const requiredLevel = ROLE_LEVELS[minRole] ?? Infinity;
  if (userLevel < requiredLevel) {
    return res.status(403).json({
      message: `Access denied. Minimum required role: ${minRole}`,
      yourRole: req.user.role,
    });
  }
  next();
};

/**
 * canMutate – shorthand for editor-or-above access.
 */
const canMutate = requireMinRole('editor');

/**
 * adminOnly – shorthand for admin-only routes.
 */
const adminOnly = requireRole('admin');

/**
 * Helper: pure function (not middleware) used inside controllers to check
 * if the acting user is allowed to edit/delete a resource.
 *
 * @param {Object} resource  - DB document with a `createdBy` field
 * @param {Object|null} user - req.user
 * @returns {boolean}
 */
const isOwnerOrEditor = (resource, user) => {
  if (!user) return false; // auth required; no anonymous mutations
  if (user.role === 'admin') return true;
  if (user.role === 'editor') return true;
  if (user.role === 'viewer') return false;
  // Default: check ownership
  const createdBy = resource?.createdBy;
  if (!createdBy || createdBy === 'anonymous') return false;
  return createdBy === user.id;
};

module.exports = {
  requireAuth,
  requireRole,
  requireMinRole,
  canMutate,
  adminOnly,
  isOwnerOrEditor,
  ROLE_LEVELS,
};
