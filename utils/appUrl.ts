// Public base URL used in links sent to users (emails). Set APP_BASE_URL in
// each environment, e.g. https://api.example.com; locally it falls back to
// this server's own address.
export function appBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    console.warn("APP_BASE_URL is not set; email links will point at localhost");
  }
  return `http://localhost:${process.env.PORT || 4001}`;
}
