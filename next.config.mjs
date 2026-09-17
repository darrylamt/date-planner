/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },

  /*
   * The consumer web is gone: planning happens in the app, and this site keeps
   * only shared plans and the admin.
   *
   * Redirects rather than deletions, because these paths are in browser
   * histories and in at least one round of shared links. A 404 tells somebody
   * the product is broken; landing on the page that hands them the app tells
   * them where it went. Permanent, because it is.
   */
  async redirects() {
    return [
      { source: "/plan/new", destination: "/get", permanent: true },
      { source: "/plan/example", destination: "/get", permanent: true },
      { source: "/plans", destination: "/get", permanent: true },
    ];
  },
};

export default nextConfig;
