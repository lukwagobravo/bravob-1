function requirePermission(permission) {
  return (req, res, next) => {
    if (req.isPlatformAdmin || req.isDealerCompanyManager || req.permissions?.includes(permission)) return next();
    return res.status(403).json({ message: `Permission required: ${permission}` });
  };
}

module.exports = requirePermission;
