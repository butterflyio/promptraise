/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    resolveAlias: {
      '@': require('path').resolve(__dirname, 'src'),
    },
  },
};

module.exports = nextConfig;
