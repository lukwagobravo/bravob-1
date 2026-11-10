const { AsyncLocalStorage } = require("async_hooks");

const tenantContext = new AsyncLocalStorage();

function tenantPlugin(schema) {
  schema.add({
    companyId: {
      type: require("mongoose").Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },
  });

  const currentCompanyId = () => tenantContext.getStore()?.companyId || null;
  schema.pre(/^find/, function scopeFind() {
    const companyId = currentCompanyId();
    if (companyId) this.where({ companyId });
  });
  schema.pre("countDocuments", function scopeCount() {
    const companyId = currentCompanyId();
    if (companyId) this.where({ companyId });
  });
  schema.pre(/^update/, function scopeUpdate() {
    const companyId = currentCompanyId();
    if (companyId) this.where({ companyId });
  });
  schema.pre(/^delete/, function scopeDelete() {
    const companyId = currentCompanyId();
    if (companyId) this.where({ companyId });
  });
  schema.pre("save", function assignTenant() {
    const companyId = currentCompanyId();
    if (companyId) {
      if (this.companyId && String(this.companyId) !== String(companyId)) {
        throw new Error("Record belongs to another company");
      }
      this.companyId = companyId;
    }
  });
  schema.pre("aggregate", function scopeAggregate() {
    const companyId = currentCompanyId();
    if (companyId) this.pipeline().unshift({ $match: { companyId } });
  });
}

module.exports = { tenantContext, tenantPlugin };
