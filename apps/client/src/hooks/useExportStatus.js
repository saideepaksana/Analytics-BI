import { useState, useCallback, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../core/config/env";

export const useExportStatus = () => {
    const [status, setStatus] = useState(null); // 'queued', 'processing', 'completed', 'failed'
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [jobId, setJobId] = useState(null);
    const pollingRef = useRef(null);

    const stopPolling = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    }, []);

    const pollStatus = useCallback((id) => {
        stopPolling();
        setJobId(id);
        setStatus("queued");
        setProgress(0);
        setError(null);

        pollingRef.current = setInterval(async () => {
            try {
                const response = await axios.get(`${API_BASE_URL}/export/status/${id}`);
                const { state, progress, result, error } = response.data;

                setProgress(progress);
                
                if (state === "completed") {
                    setStatus("completed");
                    stopPolling();
                    // Auto-trigger download
                    if (result && result.filename) {
                        window.location.href = `${API_BASE_URL}/export/download/${result.filename}`;
                    }
                } else if (state === "failed") {
                    setStatus("failed");
                    setError(error || "Export failed.");
                    stopPolling();
                } else if (state === "active") {
                    setStatus("processing");
                }
            } catch (err) {
                console.error("Polling error", err);
                // Don't stop on single error, might be transient
            }
        }, 2000);
    }, [stopPolling]);

    const startExport = useCallback(async (type, payload) => {
        try {
            setStatus("initiating");
            const response = await axios.post(`${API_BASE_URL}/export/${type}`, payload);
            if (response.data.jobId) {
                pollStatus(response.data.jobId);
            }
            return response.data.jobId;
        } catch (err) {
            setStatus("failed");
            setError(err.response?.data?.error || "Failed to start export.");
            return null;
        }
    }, [pollStatus]);

    return {
        status,
        progress,
        error,
        jobId,
        startExport,
        reset: () => {
            setStatus(null);
            setProgress(0);
            setError(null);
            setJobId(null);
            stopPolling();
        }
    };
};
