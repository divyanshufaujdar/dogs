import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // transformers.js ships a native onnxruntime binary + model loader that must
  // not be bundled by the server compiler — load it from node_modules at runtime.
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;
