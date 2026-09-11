// The one place the basemap provider is configured. Default: OpenStreetMap's public
// tiles. Their usage policy requires the browser to identify the app via the Referer
// header; the server's Referrer-Policy (server/src/app.js) and the `referrerPolicy`
// below make sure it is sent, otherwise OSM serves an "Access blocked" 403 tile.
// Set VITE_TILE_URL / VITE_TILE_ATTRIBUTION to switch to a commercial provider
// (MapTiler, Stadia, etc.) without touching the map components.
export const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const TILE_OPTIONS = { url: TILE_URL, attribution: TILE_ATTRIBUTION, referrerPolicy: 'strict-origin-when-cross-origin', maxZoom: 19 }
