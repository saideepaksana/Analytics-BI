import apiClient from "../core/http/apiClient";

export const getAnnotationsByChart = async (chartId) => {
  const response = await apiClient.get(`/annotations/chart/${chartId}`);
  return response.data.annotations || [];
};

export const getAnnotationsByDashboard = async (dashboardId) => {
  const response = await apiClient.get(`/annotations/dashboard/${dashboardId}`);
  return response.data.annotations || [];
};

export const createAnnotation = async (payload) => {
  const response = await apiClient.post("/annotations", payload);
  return response.data.annotation;
};

export const updateAnnotation = async (id, payload) => {
  const response = await apiClient.put(`/annotations/${id}`, payload);
  return response.data.annotation;
};

export const deleteAnnotation = async (id) => {
  const response = await apiClient.delete(`/annotations/${id}`);
  return response.data;
};
