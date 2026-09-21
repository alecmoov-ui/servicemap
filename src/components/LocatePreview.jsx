import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import { TILE_OPTIONS } from '../lib/tiles.js'
import L from 'leaflet'

const mk = (color) => L.divIcon({
  className: 'moov-pin',
  html: `<div class="pin-dot" style="background:${color}"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})
const pin = mk('#e0701a')
const areaPin = mk('#2d6cdf')

// Keeps the map centered on the station and fitted to its radius circle. Also
// fixes Leaflet's sizing when the map mounts inside a modal.
function Fit({ points }) {
  const map = useMap()
  const sig = points.map((p) => `${p.lat},${p.lng},${p.radiusMi}`).join(';')
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0)
    if (!points.length) return
    // Bounds sized to each radius, computed from the point (no map-attached circle
    // needed — circle.getBounds() would throw here because it isn't on the map yet).
    let bounds = null
    for (const p of points) {
      const b = L.latLng(p.lat, p.lng).toBounds((p.radiusMi || 25) * 1609.34 * 2)
      bounds = bounds ? bounds.extend(b) : b
    }
    map.fitBounds(bounds, { padding: [20, 20] })
  }, [sig, map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

const valid = (v) => v != null && !Number.isNaN(Number(v))

// Live preview of a station's coverage: the primary pin + radius circle, plus any
// additional service areas (`areas`: [{ lat, lng, radiusMi, label }]) in blue.
export default function LocatePreview({ lat, lng, radiusMi, areas = [] }) {
  const points = []
  if (valid(lat) && valid(lng)) points.push({ lat: Number(lat), lng: Number(lng), radiusMi: radiusMi || 25, primary: true })
  for (const a of areas) if (valid(a.lat) && valid(a.lng)) points.push({ lat: Number(a.lat), lng: Number(a.lng), radiusMi: a.radiusMi || 25, label: a.label })
  const has = points.length > 0
  return (
    <div className="locate-preview">
      {!has && <div className="locate-empty">Enter an address and click <b>Locate</b> to preview the coverage circle.</div>}
      <MapContainer center={has ? [points[0].lat, points[0].lng] : [39.5, -98.35]} zoom={has ? 9 : 4} className="locate-map" scrollWheelZoom={false}>
        <TileLayer {...TILE_OPTIONS} />
        {points.map((p, i) => {
          const color = p.primary ? '#e0701a' : '#2d6cdf'
          return (
            <div key={i}>
              <Marker position={[p.lat, p.lng]} icon={p.primary ? pin : areaPin} />
              <Circle center={[p.lat, p.lng]} radius={p.radiusMi * 1609.34}
                pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.12 }} />
            </div>
          )
        })}
        <Fit points={points} />
      </MapContainer>
    </div>
  )
}
