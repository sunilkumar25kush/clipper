import { ApiResponse } from "@clipforge/shared-types";

let memoryAccessToken: string | null = null;
let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

export function setMemoryAccessToken(token: string | null): void {
  memoryAccessToken = token;
}

export function getMemoryAccessToken(): string | null {
  return memoryAccessToken;
}

export class ApiError extends Error {
  public code: string;
  public statusCode: number;
  public details?: Array<{ field?: string; issue: string }>;

  constructor(statusCode: number, code: string, message: string, details?: Array<{ field?: string; issue: string }>) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function getErrorMessage(
  err: unknown,
  fallback = "An unexpected error occurred. Please try again.",
): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  if (
    typeof err === "object" &&
    err !== null &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return (err as { message: string }).message;
  }
  if (typeof err === "string" && err.trim().length > 0) {
    return err;
  }
  return fallback;
}

export async function fetchApi<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : endpoint.startsWith("/") ? endpoint : `/api/v1/${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (memoryAccessToken && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${memoryAccessToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw new ApiError(
      503,
      "SERVICE_UNAVAILABLE",
      "Unable to connect to the backend server. Please verify the API is running.",
    );
  }

  // Handle 401 Unauthorized by attempting session refresh (except on auth/login or auth/refresh itself)
  if (
    response.status === 401 &&
    !endpoint.includes("/auth/login") &&
    !endpoint.includes("/auth/register") &&
    !endpoint.includes("/auth/refresh")
  ) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json()) as ApiResponse<{ accessToken: string }>;
          if (refreshData.data?.accessToken) {
            setMemoryAccessToken(refreshData.data.accessToken);
            refreshQueue.forEach((cb) => cb(refreshData.data!.accessToken));
            refreshQueue = [];
            isRefreshing = false;

            // Retry original request with fresh token
            headers["Authorization"] = `Bearer ${refreshData.data.accessToken}`;
            const retryRes = await fetch(url, {
              ...options,
              headers,
              credentials: "include",
            });
            const retryJson = (await retryRes.json()) as ApiResponse<T>;
            if (!retryRes.ok || !retryJson.success) {
              throw new ApiError(
                retryRes.status,
                retryJson.error?.code || "REQUEST_FAILED",
                retryJson.error?.message || "Request failed",
                retryJson.error?.details,
              );
            }
            return retryJson.data as T;
          }
        }
      } catch {
        // Refresh failed, clear token
        setMemoryAccessToken(null);
      } finally {
        isRefreshing = false;
        refreshQueue.forEach((cb) => cb(null));
        refreshQueue = [];
      }
    } else {
      // Wait for ongoing refresh
      return new Promise<T>((resolve, reject) => {
        refreshQueue.push(async (newToken) => {
          if (!newToken) {
            reject(new ApiError(401, "UNAUTHORIZED", "Session expired"));
            return;
          }
          headers["Authorization"] = `Bearer ${newToken}`;
          try {
            const retryRes = await fetch(url, {
              ...options,
              headers,
              credentials: "include",
            });
            const retryJson = (await retryRes.json()) as ApiResponse<T>;
            if (!retryRes.ok || !retryJson.success) {
              reject(
                new ApiError(
                  retryRes.status,
                  retryJson.error?.code || "REQUEST_FAILED",
                  retryJson.error?.message || "Request failed",
                  retryJson.error?.details,
                ),
              );
            } else {
              resolve(retryJson.data as T);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
    }
  }

  let json: ApiResponse<T>;
  try {
    json = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      response.ok ? "Received invalid response from server." : `Server responded with error status ${response.status}.`,
    );
  }

  if (!response.ok || !json.success) {
    throw new ApiError(
      response.status,
      json.error?.code || "REQUEST_FAILED",
      json.error?.message || "Request failed",
      json.error?.details,
    );
  }

  return json.data as T;
}

