import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Open-source Whisper runs through ONNX Runtime's native Node bindings; keep them out of the bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
  // Audio clips are posted to /api/voice-answers. Keep the ceiling generous but bounded.
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
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
    ];
  },
};

export default nextConfig;
