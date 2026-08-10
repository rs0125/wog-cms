import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Serve images as-is instead of routing them through Vercel's Image
    // Optimization service.
    //
    // Two reasons. First, that service returned 402
    // (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED) in production while working
    // fine under `next start` locally, which broke the logo in prod only.
    // Second, the quota is shared account-wide with wareongo.com, where it's
    // spent on listing photos that actually benefit from resizing — an internal
    // tool has no business competing for it.
    //
    // Nothing is lost: the only image here is a 2.4KB logo rendered at ~32px.
    unoptimized: true,
  },
};

export default nextConfig;
