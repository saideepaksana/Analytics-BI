import { useCallback, useEffect, useRef, useState } from "react";
import apiClient, { getRequestErrorMessage } from "../core/http/apiClient";
import { getExportDownloadUrl, getExportShareUrl } from "../services/export.service";

const normalizeJobState = (state) => {
  const value = String(state || "").toLowerCase();

  if (value === "waiting" || value === "delayed" || value === "paused" || value === "queued") {
    return "queued";
  }

  if (value === "active" || value === "processing") {
    return "processing";
  }

  if (value === "completed") {
    return "completed";
  }

  if (value === "failed") {
    return "failed";
  }

  if (value === "initiating") {
    return "initiating";
  }

  return null;
};

const triggerBrowserDownload = (url) => {
  if (!url || typeof document === "undefined") {
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

const MAX_STATUS_POLL_FAILURES = 3;

export const useExportStatus = () => {
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [filename, setFilename] = useState("");

  const pollingRef = useRef(null);
  const hasAutoDownloadedRef = useRef(false);
  const pollFailureCountRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    setStatus(null);
    setProgress(0);
    setError(null);
    setJobId(null);
    setDownloadUrl("");
    setShareUrl("");
    setFilename("");
    hasAutoDownloadedRef.current = false;
    pollFailureCountRef.current = 0;
  }, [stopPolling]);

  const download = useCallback(() => {
    if (downloadUrl) {
      triggerBrowserDownload(downloadUrl);
    }
  }, [downloadUrl]);

  const handleCompleted = useCallback((result) => {
    const nextFilename = result?.filename || "";
    const nextDownloadUrl = result?.downloadUrl || (nextFilename ? getExportDownloadUrl(nextFilename) : "");
    const nextShareUrl = result?.shareUrl || (nextFilename ? getExportShareUrl(nextFilename) : "");

    setStatus("completed");
    setProgress(100);
    setError(null);
    setFilename(nextFilename);
    setDownloadUrl(nextDownloadUrl);
    setShareUrl(nextShareUrl);
    stopPolling();

    if (nextDownloadUrl && !hasAutoDownloadedRef.current) {
      hasAutoDownloadedRef.current = true;
      triggerBrowserDownload(nextDownloadUrl);
    }
  }, [stopPolling]);

  const pollStatus = useCallback((id) => {
    stopPolling();

    pollingRef.current = setInterval(async () => {
      try {
        const response = await apiClient.get(`/export/status/${id}`);
        pollFailureCountRef.current = 0;
        const nextStatus = normalizeJobState(response.data?.state);
        const nextProgress = Number(response.data?.progress);

        if (Number.isFinite(nextProgress)) {
          setProgress(nextProgress);
        }

        if (nextStatus === "completed") {
          handleCompleted(response.data?.result);
          return;
        }

        if (nextStatus === "failed") {
          setStatus("failed");
          setError(response.data?.error || "Export failed.");
          stopPolling();
          return;
        }

        if (nextStatus) {
          setStatus(nextStatus);
        }
      } catch (pollError) {
        pollFailureCountRef.current += 1;
        console.error("Export status polling error", pollError);

        if (pollFailureCountRef.current >= MAX_STATUS_POLL_FAILURES) {
          setStatus("failed");
          setError(getRequestErrorMessage(pollError, "Unable to check export status. Please try again."));
          stopPolling();
        }
      }
    }, 2000);
  }, [handleCompleted, stopPolling]);

  const startExport = useCallback(async (type, payload) => {
    reset();
    setStatus("initiating");

    try {
      const response = await apiClient.post(`/export/${type}`, payload);
      const nextJobId = response.data?.jobId || null;

      if (nextJobId) {
        setJobId(nextJobId);
        setStatus("queued");
        pollStatus(nextJobId);
      } else {
        setStatus("failed");
        setError("Export job did not return an ID.");
      }

      return nextJobId;
    } catch (exportError) {
      setStatus("failed");
      setError(getRequestErrorMessage(exportError, "Failed to start export."));
      return null;
    }
  }, [pollStatus, reset]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  return {
    status,
    progress,
    error,
    jobId,
    downloadUrl,
    shareUrl,
    filename,
    startExport,
    download,
    reset,
    isBusy: status === "initiating" || status === "queued" || status === "processing",
    isComplete: status === "completed",
    isFailed: status === "failed",
  };
};

export default useExportStatus;
