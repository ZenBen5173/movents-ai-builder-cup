import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  // vercel.com/api/blob: Marketing page uploads go straight to the Blob store.
  `connect-src 'self' https://vercel.com${dev ? " ws:" : ""}`,
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "exceljs", "nodemailer", "postgres"],
  // The poster renderer reads these at runtime; make sure Vercel ships them.
  outputFileTracingIncludes: {
    "/api/creatives/[id]/image": [
      "./node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff",
      "./node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-500-normal.woff",
      "./node_modules/@fontsource/space-mono/files/space-mono-latin-700-normal.woff",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
