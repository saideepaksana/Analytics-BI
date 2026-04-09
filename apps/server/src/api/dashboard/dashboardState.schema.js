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
    layout: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "x", "y", "w", "h"],
        properties: {
          id: { type: "string" },
          x: { type: "number", minimum: 0 },
          y: { type: "number", minimum: 0 },
          w: { type: "number", minimum: 1 },
          h: { type: "number", minimum: 1 },
          chartId: { type: "string" }
        }
      }
    },
    chartRefs: { type: "array", items: { type: "string" } },
    filters: { type: "object" },
    metadata: { type: "object" }
  },
  additionalProperties: true,
};
