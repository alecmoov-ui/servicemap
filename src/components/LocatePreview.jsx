import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Circle, Polygon, Polyline, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
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

// Keeps the map fitted to every pin's coverage (circle or outline). Also fixes
// Leaflet's sizing when the map mounts inside a modal. Not re-run while drawing.
function Fit({ points, drawing }) {
  const map = useMap()
  const sig = points.map((p) => `${p.lat},${p.lng},${p.radiusMi},${(p.polygon || []).length}`).join(';')
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0)
    if (!points.length || drawing) return
    let bounds = null
    for (const p of points) {
      const b = p.polygon ? L.latLngBounds(p.polygon) : L.latLng(p.lat, p.lng).toBounds((p.radiusMi || 25) * 1609.34 * 2)
      bounds = bounds ? bounds.extend(b) : b
    }
    map.fitBounds(bounds, { padding: [20, 20], animate: false }) // no animation: the modal can unmount mid-flight
  }, [sig, map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Draw mode: each map click adds a corner point. Wheel-zoom on, double-click zoom off.
function Drawer({ draw }) {
  const map = useMapEvents({ click: (e) => draw && draw.onAdd({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  useEffect(() => {
    if (draw) { map.scrollWheelZoom.enable(); map.doubleClickZoom.disable(); map.getContainer().classList.add('drawing') }
    else { map.scrollWheelZoom.disable(); map.doubleClickZoom.enable(); map.getContainer().classList.remove('drawing') }
  }, [!!draw, map]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!draw) return null
  const pts = draw.points
  return (
    <>
      {pts.length >= 3
        ? <Polygon positions={pts} pathOptions={{ color: '#7a1fa2', weight: 2, dashArray: '4 4', fillColor: '#7a1fa2', fillOpacity: 0.15 }} />
        : pts.length >= 2 && <Polyline positions={pts} pathOptions={{ color: '#7a1fa2', weight: 2, dashArray: '4 4' }} />}
      {pts.map((p, i) => (
        <CircleMarker key={i} center={p} radius={i === 0 ? 6 : 4} pathOptions={{ color: '#7a1fa2', fillColor: '#fff', fillOpacity: 1, weight: 2 }} />
      ))}
    </>
  )
}

const valid = (v) => v != null && !Number.isNaN(Number(v))

// Live preview of a station's coverage: the primary pin (orange) + additional service
// areas (blue). Each pin shows its outline polygon when drawn, otherwise its radius
// circle. `draw` = { points: [[lat,lng],...], onAdd(latlng) } turns on draw mode.
export default function LocatePreview({ lat, lng, radiusMi, polygon = null, areas = [], draw = null }) {
  const points = []
  const poly = (p) => (Array.isArray(p) && p.length >= 3 ? p : null)
  if (valid(lat) && valid(lng)) points.push({ lat: Number(lat), lng: Number(lng), radiusMi: radiusMi || 25, polygon: poly(polygon), primary: true })
  for (const a of areas) if (valid(a.lat) && valid(a.lng)) points.push({ lat: Number(a.lat), lng: Number(a.lng), radiusMi: a.radiusMi || 25, polygon: poly(a.polygon), label: a.label })
  const has = points.length > 0
  return (
    <div className="locate-preview">
      {!has && !draw && <div className="locate-empty">Enter an address and click <b>Locate</b> to preview the coverage circle.</div>}
      <MapContainer center={has ? [points[0].lat, points[0].lng] : [39.5, -98.35]} zoom={has ? 9 : 4} className="locate-map" scrollWheelZoom={false}>
        <TileLayer {...TILE_OPTIONS} />
        {points.map((p, i) => {
          const color = p.primary ? '#e0701a' : '#2d6cdf'
          const style = { color, weight: 1, fillColor: color, fillOpacity: 0.12 }
          return (
            <div key={i}>
              <Marker position={[p.lat, p.lng]} icon={p.primary ? pin : areaPin} />
              {p.polygon
                ? <Polygon positions={p.polygon} pathOptions={style} />
                : <Circle center={[p.lat, p.lng]} radius={p.radiusMi * 1609.34} pathOptions={style} />}
            </div>
          )
        })}
        <Drawer draw={draw} />
        <Fit points={points} drawing={!!draw} />
      </MapContainer>
    </div>
  )
}
