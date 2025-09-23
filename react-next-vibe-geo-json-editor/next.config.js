/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'export',
    images: {
        unoptimized: true,
    },
    // This is important for static exports
    assetPrefix: './',
    basePath: '',
    // Ensure trailing slashes are handled correctly
    trailingSlash: true,
};

module.exports = nextConfig; 