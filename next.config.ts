import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /api/estimativa lê o histórico 2018/2022 do disco (fs + process.cwd()); garante que os
  // JSONs entrem no bundle da função na Vercel (~2,2 MB). As demais rotas não mudam.
  outputFileTracingIncludes: {
    "/api/estimativa": ["./public/data/hist/**/*.json"],
  },
};

export default nextConfig;
