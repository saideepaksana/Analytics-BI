import apiClient from "../core/http/apiClient";

export const uploadDatasetFile = async ({
  file,
  mode,
  uploadId,
  datasetId,
  cancelToken,
  onUploadProgress,
}) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("mode", mode);
  formData.append("uploadId", uploadId);
  if (datasetId?.trim()) {
    formData.append("datasetId", datasetId.trim());
  }

  const response = await apiClient.post("/upload", formData, {
    cancelToken,
    onUploadProgress,
  });

  return response.data;
};
