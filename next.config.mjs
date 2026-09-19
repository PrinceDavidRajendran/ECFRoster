/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep pdfkit out of the webpack bundle so its .afm font-metric files
  // (loaded from disk at runtime) resolve correctly on the server.
  experimental: {
    serverComponentsExternalPackages: ["pdfkit"],
  },
};

export default nextConfig;
