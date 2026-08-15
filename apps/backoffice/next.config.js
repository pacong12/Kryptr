//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile the workspace UI package (TS source) into the app bundle.
  transpilePackages: ['@kryptr/shared-ui'],
};

module.exports = nextConfig;
