const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Company = require("../models/Company");
const Dealer = require("../models/Dealer");
const ImpersonationLog = require("../models/ImpersonationLog");
const { tenantContext } = require("./tenantScope");

async function auth(req, res, next) {

  try {

    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "No token provided"
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    const user = await User.findById(decoded.id).populate("assignedRole", "name level permissions companyId isActive");

    if (!user) {
      return res.status(401).json({
        message: "User not found"
      });
    }

    if (user.isActive === false) return res.status(403).json({ message: "This user account is inactive" });
    let company = user.companyId ? await Company.findById(user.companyId) : null;
    if (user.companyId && !company) return res.status(403).json({ message: "Company account not found" });
    const isCompanyManager = Boolean(decoded.companyScopeId);
    if (isCompanyManager) {
      const isOverallAdmin = user.role === "admin" && !user.companyId && !user.dealerId;
      const isRegionalAdmin = user.role === "admin" && !user.companyId && Boolean(user.dealerId);
      if (!isOverallAdmin && !isRegionalAdmin) {
        return res.status(403).json({ message: "Administrator company management access required" });
      }
      const companyFilter = isRegionalAdmin
        ? { _id: decoded.companyScopeId, dealerId: user.dealerId }
        : { _id: decoded.companyScopeId };
      company = await Company.findOne(companyFilter);
      if (!company) return res.status(403).json({ message: "Company is outside your account" });
    }
    const isCompanyScopeReturn = req.path === "/api/platform/company-scope/return";
    if (!isCompanyScopeReturn && company && !company.isActive) return res.status(403).json({ message: "Company account is inactive" });
    if (!isCompanyScopeReturn && company?.expiresAt && new Date(company.expiresAt).getTime() < Date.now()) return res.status(402).json({ message: "Company subscription has expired" });
    const dealer = user.dealerId ? await Dealer.findById(user.dealerId) : null;
    if (user.dealerId && (!dealer || !dealer.isActive)) return res.status(403).json({ message: "Dealer account is inactive" });

    let impersonationLog = null;
    if (decoded.impersonatedBy) {
      const actor = await User.findById(decoded.impersonatedBy);
      const actorIsRootDealer = actor?.role === "admin" && !actor.companyId && !actor.dealerId;
      const actorOwnsCompany = actor?.role === "admin" && !actor.companyId &&
        String(actor.dealerId || "") === String(company?.dealerId || "");
      if (!actor || actor.role !== "admin" || actor.companyId || (!actorIsRootDealer && !actorOwnsCompany) || !company || String(company._id) !== String(decoded.companyId)) {
        return res.status(403).json({ message: "Invalid delegated company session" });
      }
      if (decoded.impersonationLogId) impersonationLog = await ImpersonationLog.findById(decoded.impersonationLogId);
      if (!impersonationLog || impersonationLog.endedAt) return res.status(401).json({ message: "Delegated session has ended" });
    }

    req.user = user._id;
    req.userRecord = user;
    req.role = user.role;
    req.department = user.department;
    req.companyId = isCompanyManager ? company._id : user.companyId || null;
    req.company = company;
    req.dealer = dealer;
    req.dealerId = user.dealerId || null;
    req.isPlatformAdmin = user.role === "admin" && !user.companyId && !user.dealerId;
    req.isDealerAdmin = user.role === "admin" && !user.companyId && Boolean(user.dealerId);
    req.isDealerCompanyManager = isCompanyManager && Boolean(user.dealerId);
    req.isPlatformCompanyManager = isCompanyManager && !user.dealerId;
    req.isCompanyManager = isCompanyManager;
    req.isImpersonating = Boolean(decoded.impersonatedBy);
    req.impersonationActor = decoded.impersonatedBy || null;
    req.impersonationLog = impersonationLog;
    req.permissions = user.assignedRole && user.assignedRole.isActive !== false && String(user.assignedRole.companyId || "") === String(user.companyId || "")
      ? user.assignedRole.permissions || []
      : [];
    if (isCompanyManager && company.primaryAdmin) {
      const companyAdmin = await User.findOne({ _id: company.primaryAdmin, companyId: company._id })
        .populate("assignedRole", "permissions companyId isActive");
      const assignedRole = companyAdmin?.assignedRole;
      if (assignedRole?.isActive !== false && String(assignedRole?.companyId || "") === String(company._id)) {
        req.permissions = assignedRole.permissions || [];
      }
    }

    if (user.dealerId && !req.companyId && !req.isImpersonating && !isCompanyManager) {
      if (!req.isDealerAdmin) return res.status(403).json({ message: "Dealer administrator access required" });
      const allowedDealerRoutes = [
        "/api/account/context",
        "/api/platform/companies",
        "/api/platform/organization-tree",
        "/api/platform/impersonation-logs",
      ];
      const allowed = allowedDealerRoutes.includes(req.path) ||
        /^\/api\/platform\/companies\/[^/]+\/impersonate$/.test(req.path) ||
        /^\/api\/platform\/companies\/[^/]+\/scope$/.test(req.path) ||
        (req.method === "PATCH" && /^\/api\/platform\/companies\/[^/]+$/.test(req.path));
      if (!allowed) return res.status(403).json({ message: "Enter a company workspace to access company data" });
    }

    tenantContext.run({ companyId: req.companyId }, () => next());

  } catch (err) {

    console.error("AUTH ERROR:", err);

    return res.status(401).json({
      message: "Invalid or expired token"
    });

  }
}

module.exports = auth;
