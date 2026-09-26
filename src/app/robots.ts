import type { MetadataRoute } from "next";

/**
 * This deployment is a private workspace, not a public site: tell crawlers to
 * stay out. Shareable `/clip/<slug>` links are meant to be sent to people, not
 * indexed.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
