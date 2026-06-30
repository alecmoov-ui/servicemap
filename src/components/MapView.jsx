import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Circle, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { starRating } from '../lib/ratings.js'

// Colored pin icons (no local image assets needed).
function pin(color) {
  return L.divIcon({
    className: 'moov-pin',
    html: `<div class="pin-dot" style="background:${color}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}
const PIN = {
  match: pin('#1f9d55'), // in-range + product match
  station: pin('#7a8aa0'), // other station
  selected: pin('#e0701a'),
  consumer: pin('#2d6cdf'),
}

function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 9)
    } else {
      map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [60, 60], maxZoom: 11 })
    }
  }, [points, map])
  return null
}

export default function MapView({ stations, matches, consumer, selectedId, onSelect, coverageProduct }) {
  const matchIds = new Set(matches.map((m) => m.id))
  // Stations whose coverage circle should be drawn even without a search.
  const coversProduct = (s) => coverageProduct && s.products?.[coverageProduct]
  const focusPoints = consumer
    ? [consumer, ...matches]
    : coverageProduct
      ? stations.filter(coversProduct).map((s) => ({ lat: s.lat, lng: s.lng }))
      : stations.map((s) => ({ lat: s.lat, lng: s.lng }))

  return (
    <MapContainer center={[39.5, -98.35]} zoom={4} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={focusPoints} />

      {stations.map((s) => {
        const isMatch = matchIds.has(s.id)
        const isSel = s.id === selectedId
        const showCircle = isMatch || coversProduct(s)
        return (
          <div key={s.id}>
            {showCircle && (
              <Circle
                center={[s.lat, s.lng]}
                radius={s.serviceRadiusMi * 1609.34}
                pathOptions={
                  isSel
                    ? { color: '#e0701a', weight: 1, fillOpacity: 0.12 }
                    : isMatch
                      ? { color: '#1f9d55', weight: 1, fillOpacity: 0.06 }
                      : { color: '#2d6cdf', weight: 1, fillColor: '#2d6cdf', fillOpacity: 0.05 } // coverage overlay
                }
              />
            )}
            <Marker
              position={[s.lat, s.lng]}
              icon={isSel ? PIN.selected : isMatch ? PIN.match : PIN.station}
              eventHandlers={{ click: () => onSelect?.(s.id) }}
            >
              <Popup>
                <strong>{s.company}</strong>
                <br />
                {s.city}, {s.state} · {s.serviceRadiusMi} mi radius
                <br />
                {starRating(s.perf).toFixed(1)}★ · {s.phone}
                <br />
                <a href={`mailto:${s.email}`}>{s.email}</a>
              </Popup>
            </Marker>
          </div>
        )
      })}

      {consumer && (
        <Marker position={[consumer.lat, consumer.lng]} icon={PIN.consumer}>
          <Popup>
            <strong>Service location</strong>
            <br />
            {consumer.label || consumer.address}
          </Popup>
        </Marker>
      )}
    </MapContainer>
  )
}
