import dotenv from "dotenv";

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.API_PORT || 4000),
  host: process.env.API_HOST || "0.0.0.0",
  corsOrigins: process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:3001"],
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET || "clipforge-dev-access-jwt-secret-min-32-chars-long",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || "clipforge-dev-refresh-jwt-secret-min-32-chars-long",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  cookie: {
    name: process.env.SESSION_COOKIE_NAME || "cf_refresh_token",
    domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    secure: process.env.NODE_ENV === "production",
    sameSite: (process.env.NODE_ENV === "production" ? "strict" : "lax") as "strict" | "lax",
    path: "/",
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER || "r2",
    region: process.env.STORAGE_REGION || "auto",
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
    bucketName: process.env.STORAGE_BUCKET_NAME || "clipforge-media",
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
    presignedUrlTtlSeconds: Number(process.env.STORAGE_PRESIGNED_URL_TTL_SECONDS || 900),
    localUploadDir: process.env.STORAGE_LOCAL_DIR || "./uploads",
  },
};

