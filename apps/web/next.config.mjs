/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow imports from workspace packages in dev + build
  transpilePackages: ["@tu/db", "@tu/razorpay"],
  experimental: {
    // Razorpay webhooks need the raw body — ensure it's preserved
    serverActions: { bodySizeLimit: "1mb" },
  },
  logging: {
    fetches: { fullUrl: false },
  },
};
export default nextConfig;
