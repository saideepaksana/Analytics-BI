import axios from "axios";
import { API_BASE_URL } from "../config/env";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export const getRequestErrorMessage = (error, fallbackMessage = "Request failed") => {
  if (!error) return fallbackMessage;
  if (axios.isCancel?.(error)) return "Request cancelled";
  return error.response?.data?.message || error.message || fallbackMessage;
};

export default apiClient;
