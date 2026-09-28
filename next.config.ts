import type { NextConfig } from "next";

const isGitHubPagesBuild =
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.GITHUB_REPOSITORY === "kesusugar/shibuya-scene";

const nextConfig: NextConfig = {
  // Keep local development at the site root. GitHub Pages serves project sites
  // below the repository name, so its build needs this explicit base path.
  ...(isGitHubPagesBuild
    ? {
        output: "export",
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
