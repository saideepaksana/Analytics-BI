module.exports = {
  type: "object",
  properties: {
    dashboardState: { type: "object" },
    version: { type: "number" },
    __v: { type: "number" },
    title: { type: "string" },
    description: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    isFavorite: { type: "boolean" },
    status: { type: "string", enum: ["draft", "published"] },
    layout: { type: "array" },
    chartRefs: { type: "array", items: { type: "string" } },
    filters: { type: "object" },
    metadata: { type: "object" }
  },
  additionalProperties: true,
};
