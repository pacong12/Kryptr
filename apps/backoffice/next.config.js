//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the workspace packages (TS source) into the app bundle so the
  // Vercel build never depends on their nx-built dist output.
  transpilePackages: ['@kryptr/shared-ui', '@kryptr/shared-types'],
};

module.exports = nextConfig;
