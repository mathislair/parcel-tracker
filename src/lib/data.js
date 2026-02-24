// Interpolate between two GPS points
export function interpolate(p1, p2, t) {
  return {
    lat: p1.lat + (p2.lat - p1.lat) * t,
    lng: p1.lng + (p2.lng - p1.lng) * t,
  };
}

// Bearing in degrees
export function bearing(p1, p2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const dLng = toRad(p2.lng - p1.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(p2.lat));
  const x = Math.cos(toRad(p1.lat)) * Math.sin(toRad(p2.lat)) -
    Math.sin(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Generate a realistic-ish route from ~2km away to the user's position
// with some turns to look like real streets
export function generateRoute(userLat, userLng) {
  const offsetLat = (Math.random() - 0.5) * 0.008 + 0.015;
  const offsetLng = (Math.random() - 0.5) * 0.008 + 0.015;

  const start = { lat: userLat + offsetLat, lng: userLng - offsetLng };
  const end = { lat: userLat, lng: userLng };

  // Create waypoints with small random offsets for realism
  const steps = 25;
  const route = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const base = interpolate(start, end, t);
    // Add slight S-curve wobble to simulate streets
    const wobble = Math.sin(t * Math.PI * 3) * 0.0015 * (1 - t);
    route.push({
      lat: base.lat + wobble * (i % 2 === 0 ? 1 : -0.5),
      lng: base.lng + wobble * (i % 2 === 0 ? -0.5 : 1),
    });
  }
  // Make sure last point is exact destination
  route[route.length - 1] = end;
  return route;
}

export async function fetchRoadRoute(start, end) {
  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    `${start.lng},${start.lat};${end.lng},${end.lat}` +
    "?overview=full&geometries=geojson";
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const data = await res.json();
  const coords = data?.routes?.[0]?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  return coords.map(([lng, lat]) => ({ lat, lng }));
}

export const driver = {
  name: 'Karim B.',
  initials: 'KB',
  vehicle: 'Renault Kangoo blanc',
  plate: 'FG-429-MH',
  phone: '06 ** ** 84 12',
  rating: 4.8,
  deliveries: 2847,
};

export const parcel = {
  id: 'LP-839-201-847',
  from: 'Amazon EU',
  description: 'MacBook Air M4 — Gris sidéral',
  weight: '1.8 kg',
  recipient: 'Mathieu Dupont',
  address: '26 boulevard Maxime Gorki, Villejuif',
  instructions: 'Code porte : 4829A — 3ème étage droite',
};

export function formatETA(seconds) {
  if (seconds <= 0) return "Arrivée !";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m < 1) return `${s}s`;
  return `${m} min`;
}

export function distanceMeters(p1, p2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
