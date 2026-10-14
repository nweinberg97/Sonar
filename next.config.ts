import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Open-source Whisper runs through ONNX Runtime's native Node bindings; keep them out of the bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // Audio clips are posted to /api/voice-answers. Keep the ceiling generous but bounded.
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    // Which sites may show the Feedback button's pop-up. Space-separated origins,
    // e.g. "https://app.example.com https://example.com". Default: any site.
    const embedders = (process.env.SONAR_EMBED_ORIGINS || "*").trim() || "*";
    return [
      {
        // The respondent page is the only place that asks for the microphone.
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Nothing but the pop-up may be shown inside another site (stops clickjacking the workspace).
        source: "/((?!e/).*)",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
      {
        source: "/e/:path*",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors 'self' ${embedders}` }],
      },
      {
        source: "/embed.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
