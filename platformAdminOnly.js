function platformAdminOnly(req, res, next) {
  if (!req.isPlatformAdmin || req.isImpersonating) {
    return res.status(403).json({ message: "Platform administrator access required" });
  }
  next();
}

module.exports = platformAdminOnly;
