<script>
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { bearing } from "./data.js";

  export let route = [];
  export let driverPos = null;
  export let userPos = null;
  export let trafficPoints = [];
  export let statusColor = "#3b82f6";

  let mapEl;
  let map;
  let L;
  let ready = false;
  let driverMarker;
  let userMarker;
  let routeLine;
  let routeGlow;
  let completedLine;
  let completedGlow;
  let trafficLayer;

  function trafficColor(delayAdded) {
    if (delayAdded >= 40) return "#dc2626";
    if (delayAdded >= 35) return "#f97316";
    return "#f59e0b";
  }

  function trafficClass(delayAdded) {
    if (delayAdded >= 40) return "traffic-heavy";
    if (delayAdded >= 35) return "traffic-medium";
    return "traffic-light";
  }

  function findClosestRouteIndex(pos) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < route.length; i++) {
      const dLat = route[i].lat - pos.lat;
      const dLng = route[i].lng - pos.lng;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function init() {
    L = window.L;
    map = L.map(mapEl, {
      zoomControl: false,
      attributionControl: false,
    }).setView([46.8, 2.5], 14);

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 19,
      },
    ).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    ready = true;
  }

  function drawRoute() {
    if (!map || !L || route.length < 2) return;

    // Remove old
    if (routeLine) map.removeLayer(routeLine);
    if (routeGlow) map.removeLayer(routeGlow);

    const coords = route.map((p) => [p.lat, p.lng]);

    routeGlow = L.polyline(coords, {
      color: statusColor,
      weight: 10,
      opacity: 0.08,
    }).addTo(map);

    routeLine = L.polyline(coords, {
      color: statusColor,
      weight: 4,
      opacity: 0.25,
      dashArray: "8 10",
    }).addTo(map);

    const bounds = L.latLngBounds(coords);
    if (userPos) bounds.extend([userPos.lat, userPos.lng]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
  }

  function updateDriver(pos) {
    if (!map || !L || !pos) return;

    if (!driverMarker) {
      const icon = L.divIcon({
        className: "driver-icon",
        html: `
          <div class="driver-marker">
            <div class="driver-pulse"></div>
            <div class="driver-arrow">
              <svg width="36" height="36" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="${statusColor}" stroke="white" stroke-width="3"/>
                <path d="M20 12 L26 24 L20 21 L14 24 Z" fill="white"/>
              </svg>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      driverMarker = L.marker([pos.lat, pos.lng], {
        icon,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      driverMarker.setLatLng([pos.lat, pos.lng]);
    }
  }

  function updateCompleted(pos) {
    if (!map || !L || !pos || route.length < 2) return;

    // Find completed portion of route up to driver
    const completed = [];
    for (const p of route) {
      completed.push([p.lat, p.lng]);
      const d = Math.abs(p.lat - pos.lat) + Math.abs(p.lng - pos.lng);
      if (d < 0.0003) break;
    }
    completed.push([pos.lat, pos.lng]);

    if (completedLine) map.removeLayer(completedLine);
    if (completedGlow) map.removeLayer(completedGlow);

    completedGlow = L.polyline(completed, {
      color: statusColor,
      weight: 10,
      opacity: 0.12,
    }).addTo(map);

    completedLine = L.polyline(completed, {
      color: statusColor,
      weight: 4,
      opacity: 0.8,
    }).addTo(map);
  }

  function updateTraffic(points) {
    if (!map || !L) return;
    if (trafficLayer) map.removeLayer(trafficLayer);
    trafficLayer = L.layerGroup();

    if (!points || points.length === 0) {
      trafficLayer.addTo(map);
      return;
    }

    points.forEach((p) => {
      const delay = p.delayAdded || 0;
      const color = trafficColor(delay);
      const severityClass = trafficClass(delay);

      if (route.length >= 2) {
        const idx = findClosestRouteIndex(p.position);
        const segmentOffsets = [0, 14, 28];
        const segmentRadius = 6;

        segmentOffsets.forEach((offset) => {
          const center = Math.min(route.length - 1, Math.max(0, idx + offset));
          const start = Math.max(0, center - segmentRadius);
          const end = Math.min(route.length, center + segmentRadius + 1);
          const segment = route.slice(start, end).map((pt) => [pt.lat, pt.lng]);

          if (segment.length >= 2) {
            L.polyline(segment, {
              color,
              weight: 14,
              opacity: 0.22,
            }).addTo(trafficLayer);
            L.polyline(segment, {
              color,
              weight: 8,
              opacity: 0.95,
            }).addTo(trafficLayer);
          }
        });
      }

      const icon = L.divIcon({
        className: "traffic-icon",
        html: `<div class="traffic-pin ${severityClass}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([p.position.lat, p.position.lng], {
        icon,
        zIndexOffset: 800,
      }).addTo(trafficLayer);
    });

    trafficLayer.addTo(map);
  }

  function placeUser(pos) {
    if (!map || !L || !pos) return;

    if (!userMarker) {
      const icon = L.divIcon({
        className: "user-icon",
        html: `
          <div class="user-marker">
            <div class="user-ring"></div>
            <div class="user-dot"></div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      userMarker = L.marker([pos.lat, pos.lng], {
        icon,
        zIndexOffset: 900,
      }).addTo(map);
    }
  }

  $: if (ready && route.length) drawRoute();
  $: if (ready && driverPos) {
    updateDriver(driverPos);
    updateCompleted(driverPos);
  }
  $: if (ready && userPos) placeUser(userPos);
  $: if (ready) updateTraffic(trafficPoints);

  onMount(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => init();
    document.head.appendChild(script);
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<div class="map-wrap" bind:this={mapEl}></div>

<style>
  .map-wrap {
    width: 100%;
    height: 100%;
    background: #f0f4f8;
  }

  :global(.driver-icon),
  :global(.user-icon) {
    background: transparent !important;
    border: none !important;
  }

  :global(.driver-marker) {
    position: relative;
    width: 36px;
    height: 36px;
  }

  :global(.driver-pulse) {
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.15);
    animation: driverPing 2s ease-out infinite;
  }

  :global(.driver-arrow) {
    position: relative;
    z-index: 2;
  }

  @keyframes driverPing {
    0% {
      transform: scale(0.7);
      opacity: 1;
    }
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }

  :global(.user-marker) {
    position: relative;
    width: 40px;
    height: 40px;
  }

  :global(.user-ring) {
    position: absolute;
    inset: 4px;
    border-radius: 50%;
    background: rgba(16, 185, 129, 0.1);
    border: 2px solid rgba(16, 185, 129, 0.3);
    animation: userPulse 3s ease-in-out infinite;
  }

  :global(.user-dot) {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: #10b981;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    z-index: 2;
  }

  :global(.traffic-icon) {
    background: transparent !important;
    border: none !important;
  }

  :global(.traffic-marker) {
    display: none;
  }

  :global(.traffic-pin) {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    background: #dc2626;
  }

  :global(.traffic-pin.traffic-medium) {
    background: #f97316;
  }

  :global(.traffic-pin.traffic-light) {
    background: #f59e0b;
  }

  @keyframes userPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.3);
      opacity: 0.6;
    }
  }
</style>
