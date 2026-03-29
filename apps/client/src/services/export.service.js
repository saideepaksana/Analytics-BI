import { API_BASE_URL } from "../core/config/env";

/**
 * Triggers a file download by opening the backend export endpoint 
 * in a new window/tab, letting the browser handle the attachment disposition.
 * 
 * @param {string} datasetId 
 * @param {'csv'|'xlsx'|'pdf'} format 
 */
export const downloadDatasetExport = (datasetId, format) => {
  if (!datasetId || !format) return;
  const url = `${API_BASE_URL}/export/${datasetId}/${format}`;
  window.open(url, "_blank");
};
