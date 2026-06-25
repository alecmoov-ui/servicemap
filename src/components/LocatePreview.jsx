import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'

const pin = L.divIcon({
  className: 'moov-pin',
  html: '<div class="pin-dot" style="background:#e0701a"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

// Keeps the map centered on the station and fitted to its radius circle. Also
// fixes Leaflet's sizing when the map mounts inside a modal.
function Fit({ lat, lng, radiusMi }) {
  const map = useMap()
  useEffect(() => {
    setTimeout(() => map.invalidateSize(), 0)
    if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return
    const circle = L.circle([lat, lng], { radius: (radiusMi || 25) * 1609.34 })
    map.fitBounds(circle.getBounds(), { padding: [20, 20] })
  }, [lat, lng, radiusMi, map])
  return null
}

// Live preview of a single station's coverage: pin + radius circle.
export default function LocatePreview({ lat, lng, radiusMi }) {
  const has = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
  return (
    <div className="locate-preview">
      {!has && <div className="locate-empty">Enter an address and click <b>Locate</b> to preview the coverage circle.</div>}
      <MapContainer center={has ? [lat, lng] : [39.5, -98.35]} zoom={has ? 9 : 4} className="locate-map" scrollWheelZoom={false}>
        <TileLayer attribution="&copy; OpenStreetMap" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {has && (
          <>
            <Marker position={[lat, lng]} icon={pin} />
            <Circle center={[lat, lng]} radius={(radiusMi || 25) * 1609.34}
              pathOptions={{ color: '#e0701a', weight: 1, fillColor: '#e0701a', fillOpacity: 0.12 }} />
          </>
        )}
        <Fit lat={lat} lng={lng} radiusMi={radiusMi} />
      </MapContainer>
    </div>
  )
}
