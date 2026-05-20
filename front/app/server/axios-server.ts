import "server-only";

import axios, { InternalAxiosRequestConfig } from "axios";
import { cookies } from "next/headers";

const isDev = process.env.NODE_ENV === "development";
const rawApiBaseUrl = (
  isDev
    ? process.env.NEXT_PUBLIC_API_URL_DEV || "http://localhost:8000"
    : process.env.NEXT_PUBLIC_API_URL
)?.trim();

if (!rawApiBaseUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required in production.");
}

if (!/^https?:\/\//i.test(rawApiBaseUrl)) {
  throw new Error("NEXT_PUBLIC_API_URL must start with http:// or https://.");
}

const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");

function parseAuthStorageToken(raw: string | undefined): string | null {
  if (!raw) return null;

  const candidates = [raw];
  try {
    candidates.push(decodeURIComponent(raw));
  } catch {
    // ignore
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as { state?: { token?: string | null } };
      const token = parsed?.state?.token?.trim();
      if (token) return token;
    } catch {
      // ignore
    }
  }

  return null;
}

export const apiServer = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiServer.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const cookieStore = await cookies();
      const accessToken = cookieStore.get("accessToken")?.value?.trim();
      const authStorageRaw = cookieStore.get("auth-storage")?.value;
      const authStorageToken = parseAuthStorageToken(authStorageRaw);
      const token = accessToken || authStorageToken;

      if (token) {
        config.headers.set("Authorization", `Bearer ${token}`);
      }
    } catch (error) {
      console.error("[Server Axios Interceptor] token injection failed:", error);
    }

    return config;
  },
  (error) => Promise.reject(error),
);

