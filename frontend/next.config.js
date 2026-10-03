/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets the Admin dashboard show which build of the website is running (Vercel provides the commit at build time).
  env: { NEXT_PUBLIC_WEB_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA || '' },
};
module.exports = nextConfig;
