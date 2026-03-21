export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export const MODE_OPTIONS = [
  {
    value: "new",
    title: "Create New Dataset",
    description: "Start a brand new dataset for this upload.",
  },
  {
    value: "append",
    title: "Append to Existing Data",
    description: "Add this data as new rows to an existing dataset.",
  },
  {
    value: "replace",
    title: "Replace Existing Data",
    description: "Overwrite an existing dataset entirely with this upload.",
  },
];

export const prettyMode = (mode) => {
  if (mode === "append") return "Append";
  if (mode === "replace") return "Replace";
  return "New";
};

export const createUploadId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
