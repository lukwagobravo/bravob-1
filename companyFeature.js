function companyFeature(feature) {
  return (req, res, next) => {
    if (!req.company || req.company.features?.[feature] !== false) return next();
    return res.status(403).json({ message: `Your company account does not have permission to ${feature.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}` });
  };
}

module.exports = companyFeature;
