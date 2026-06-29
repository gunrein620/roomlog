"use client";

import { useEffect, useMemo, useState } from "react";

type HealthResponse = {
  status: string;
  service: string;
};

type RequestState =
  | { status: "loading" }
  | { status: "success"; data: HealthResponse }
  | { status: "error"; message: string };

function buildHealthUrl(apiUrl: string) {
  const normalizedUrl = apiUrl.replace(/\/$/, "");

  if (normalizedUrl.endsWith("/api")) {
    return `${normalizedUrl}/health`;
  }

  return `${normalizedUrl}/api/health`;
}

export function HealthCheck() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const healthUrl = useMemo(() => buildHealthUrl(apiUrl), [apiUrl]);
  const [requestState, setRequestState] = useState<RequestState>({
    status: "loading"
  });

  useEffect(() => {
    let isMounted = true;

    async function loadHealth() {
      try {
        const response = await fetch(healthUrl, {
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`Health check failed with ${response.status}`);
        }

        const data = (await response.json()) as HealthResponse;

        if (isMounted) {
          setRequestState({ status: "success", data });
        }
      } catch (error) {
        if (isMounted) {
          setRequestState({
            status: "error",
            message: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }
    }

    void loadHealth();

    return () => {
      isMounted = false;
    };
  }, [healthUrl]);

  return (
    <section className="health-panel" aria-labelledby="health-title">
      <h2 id="health-title">API Health Check</h2>
      <p>Endpoint: {healthUrl}</p>
      {requestState.status === "loading" ? (
        <code className="health-status">Loading...</code>
      ) : null}
      {requestState.status === "success" ? (
        <code className="health-status">
          {JSON.stringify(requestState.data, null, 2)}
        </code>
      ) : null}
      {requestState.status === "error" ? (
        <code className="health-status error">{requestState.message}</code>
      ) : null}
    </section>
  );
}
