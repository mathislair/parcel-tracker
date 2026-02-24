<script>
  import { onMount, onDestroy } from "svelte";
  import { fly, fade, slide } from "svelte/transition";
  import TrackingMap from "./lib/TrackingMap.svelte";
  import ChatPanel from "./lib/ChatPanel.svelte";
  import IncomingCall from "./lib/IncomingCall.svelte";
  import {
    generateRoute,
    fetchRoadRoute,
    interpolate,
    distanceMeters,
    driver,
    parcel,
    formatETA,
  } from "./lib/data.js";
  import { buildSchedule, driverAutoReplies } from "./lib/events.js";

  // Geo + route
  let userPos = null;
  let route = [];
  let driverPos = null;
  let geoError = false;
  let trafficPoints = [];

  // Simulation
  let started = false;
  let delivered = false;
  let arriving = false;
  let progress = 0;
  let etaSeconds = 0;
  let totalDuration = 180;
  let extraDelay = 0;
  let interval;
  let startTime;
  let paused = false;
  let pauseUntil = 0;

  // Events — time-based schedule
  let schedule = [];

  // Chat
  let chatOpen = false;
  let messages = [];
  let msgIdCounter = 0;

  // Call
  let showCall = false;
  let callReason = "";

  // Toast notifications
  let toasts = [];
  let toastId = 0;
  let draggingToastId = null;
  let dragStart = { x: 0, y: 0 };
  let dragOrigin = { x: 0, y: 0 };

  // Computed
  $: distLeft =
    driverPos && userPos ? Math.round(distanceMeters(driverPos, userPos)) : 0;
  $: etaText = formatETA(etaSeconds);
  $: doneSteps = delivered ? 5 : arriving ? 4 : started ? 3 : 2;

  const steps = [
    { label: "Confirmée", icon: "check" },
    { label: "Au dépôt", icon: "check" },
    { label: "En route", icon: "truck" },
    { label: "Imminente", icon: "flag" },
    { label: "Livré", icon: "home" },
  ];

  // --- Location ---
  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject("no_geo");
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject("denied"),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }

  async function geocodeAddress(address) {
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(address);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  }

  function createStartPos(destPos) {
    const offsetLat = (Math.random() - 0.5) * 0.012 + 0.02;
    const offsetLng = (Math.random() - 0.5) * 0.012 + 0.02;
    return { lat: destPos.lat + offsetLat, lng: destPos.lng - offsetLng };
  }

  // --- Simulation ---
  function getDriverPosAtProgress(t) {
    if (route.length < 2) return route[0] || null;
    const segs = route.length - 1;
    const f = t * segs;
    const idx = Math.min(Math.floor(f), segs - 1);
    return interpolate(route[idx], route[idx + 1], f - idx);
  }

  function tick() {
    const now = Date.now();

    // If paused (driver stopped for delay/call event)
    if (paused && now < pauseUntil) return;
    if (paused && now >= pauseUntil) paused = false;

    const elapsed = (now - startTime) / 1000;
    const effectiveDuration = totalDuration + extraDelay;
    progress = Math.min(elapsed / effectiveDuration, 1);
    etaSeconds = Math.max(0, effectiveDuration - elapsed);

    driverPos = getDriverPosAtProgress(progress);

    // Fire scheduled events based on elapsed seconds
    fireScheduledEvents(elapsed);

    if (progress > 0.85 && !arriving) {
      arriving = true;
    }

    if (progress >= 1 && !delivered) {
      delivered = true;
      clearInterval(interval);
      addDriverMessage("Votre colis a été déposé. Bonne journée ! 😊");
      pushToast("Colis livré !", "success");
    }
  }

  function startSimulation() {
    started = true;
    startTime = Date.now();
    if (schedule.length === 0) {
      schedule = buildSchedule(totalDuration);
    }
    interval = setInterval(tick, 80);
  }

  function buildTrafficPointsFromSchedule() {
    if (!route || route.length < 2) return [];
    return schedule
      .filter((ev) => ev.type === "delay")
      .map((ev) => {
        const delayProgress = ev.progress ?? 0.35;
        const delayPos = getDriverPosAtProgress(delayProgress);
        if (!delayPos) return null;
        return {
          id: ev.id,
          position: delayPos,
          text: ev.text,
          delayAdded: ev.delayAdded || 0,
        };
      })
      .filter(Boolean);
  }

  // --- Events (time-based) ---
  function fireScheduledEvents(elapsed) {
    for (const ev of schedule) {
      if (ev.fired) continue;
      if (elapsed < ev.at) continue;
      // Don't fire if currently in a call
      if (showCall) continue;

      ev.fired = true;

      if (ev.type === "message") {
        addDriverMessage(ev.text, "message");
        pushToast("Nouveau message du livreur", "info");
      } else if (ev.type === "delay") {
        addDriverMessage(ev.text, "delay");
        const delayProgress = ev.progress ?? progress;
        const delayPos = getDriverPosAtProgress(delayProgress);
        if (delayPos && !trafficPoints.some((p) => p.id === ev.id)) {
          trafficPoints = [
            ...trafficPoints,
            {
              id: ev.id,
              position: delayPos,
              text: ev.text,
              delayAdded: ev.delayAdded || 0,
            },
          ];
        }
        extraDelay += ev.delayAdded || 30;
        paused = true;
        pauseUntil = Date.now() + 4000;
        pushToast("Le livreur signale un retard", "warning");
      } else if (ev.type === "call") {
        callReason = ev.reason || "";
        showCall = true;
        paused = true;
        pauseUntil = Date.now() + 30000;
      }

      // Only fire one event per tick to space them out
      break;
    }
  }

  // --- Chat ---
  function addDriverMessage(text, type = "message") {
    messages = [
      ...messages,
      {
        id: ++msgIdCounter,
        from: "driver",
        text,
        type,
        timestamp: Date.now(),
        read: chatOpen,
      },
    ];
  }

  function addUserMessage(text) {
    messages = [
      ...messages,
      {
        id: ++msgIdCounter,
        from: "user",
        text,
        type: "message",
        timestamp: Date.now(),
        read: true,
      },
    ];
  }

  function handleSend(e) {
    const { text } = e.detail;
    addUserMessage(text);

    // Driver auto-reply after 1-3s
    const delay = 1000 + Math.random() * 2000;
    setTimeout(() => {
      const match = driverAutoReplies.find((r) => r.match.test(text));
      if (match) addDriverMessage(match.reply);
    }, delay);
  }

  function handleChatToggle(e) {
    chatOpen = e.detail.open;
  }

  // --- Call ---
  function handleCallEnd(e) {
    showCall = false;
    paused = false;
    pauseUntil = 0;

    if (e.detail.accepted) {
      addDriverMessage("(Appel terminé — " + e.detail.duration + "s)");
    } else {
      addDriverMessage(
        "Vous n'avez pas répondu. N'hésitez pas à me rappeler si besoin !",
      );
    }
  }

  function initiateCall() {
    callReason = "Vous appelez le livreur";
    showCall = true;
    paused = true;
    pauseUntil = Date.now() + 30000;
  }

  // --- Toast ---
  function pushToast(text, type = "info") {
    const id = ++toastId;
    toasts = [...toasts, { id, text, type, offsetX: 0, offsetY: 0 }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 4000);
  }

  function dismissToast(id) {
    toasts = toasts.filter((t) => t.id !== id);
  }

  function updateToastOffset(id, offsetX, offsetY) {
    toasts = toasts.map((t) => (t.id === id ? { ...t, offsetX, offsetY } : t));
  }

  function handleToastPointerDown(toast, e) {
    if (e.button !== 0) return;
    draggingToastId = toast.id;
    dragStart = { x: e.clientX, y: e.clientY };
    dragOrigin = { x: toast.offsetX || 0, y: toast.offsetY || 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handleToastPointerMove(toast, e) {
    if (draggingToastId !== toast.id) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    updateToastOffset(toast.id, dragOrigin.x + dx, dragOrigin.y + dy);
  }

  function handleToastPointerUp(toast, e) {
    if (draggingToastId !== toast.id) return;
    draggingToastId = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleToastTouchStart(toast, e) {
    const touch = e.touches[0];
    if (!touch) return;
    draggingToastId = toast.id;
    dragStart = { x: touch.clientX, y: touch.clientY };
    dragOrigin = { x: toast.offsetX || 0, y: toast.offsetY || 0 };
  }

  function handleToastTouchMove(toast, e) {
    if (draggingToastId !== toast.id) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - dragStart.x;
    const dy = touch.clientY - dragStart.y;
    updateToastOffset(toast.id, dragOrigin.x + dx, dragOrigin.y + dy);
  }

  function handleToastTouchEnd(toast) {
    if (draggingToastId !== toast.id) return;
    draggingToastId = null;
  }

  // --- Lifecycle ---
  onMount(async () => {
    try {
      const destPos = await geocodeAddress(parcel.address);
      userPos = destPos || (await getUserLocation());
    } catch {
      userPos = { lat: 48.8606, lng: 2.3789 };
      geoError = true;
    }

    const startPos = createStartPos(userPos);
    route = await fetchRoadRoute(startPos, userPos);
    if (!route || route.length < 2) {
      route = generateRoute(userPos.lat, userPos.lng);
    }
    driverPos = route[0];
    etaSeconds = totalDuration;

    schedule = buildSchedule(totalDuration);
    trafficPoints = buildTrafficPointsFromSchedule();

    setTimeout(() => startSimulation(), 1200);
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
</script>

<div class="app">
  <!-- Map -->
  <div class="map-layer">
    <TrackingMap {route} {driverPos} {userPos} {trafficPoints} />
  </div>

  <!-- Top bar -->
  <div class="top-bar">
    <div class="top-left">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
        />
      </svg>
      <span class="top-title">Suivi en direct</span>
    </div>
    <div class="live-badge">
      <span class="live-dot"></span>
      LIVE
    </div>
  </div>

  <!-- Toast notifications -->
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div
        class="toast-wrapper"
        in:fly={{ y: -20, duration: 250 }}
        out:fade={{ duration: 200 }}
      >
        <div
          class="toast toast-{toast.type}"
          class:dragging={draggingToastId === toast.id}
          style="transform: translate({toast.offsetX}px, {toast.offsetY}px);"
          on:pointerdown={(e) => handleToastPointerDown(toast, e)}
          on:pointermove={(e) => handleToastPointerMove(toast, e)}
          on:pointerup={(e) => handleToastPointerUp(toast, e)}
          on:pointercancel={(e) => handleToastPointerUp(toast, e)}
          on:touchstart|preventDefault={(e) => handleToastTouchStart(toast, e)}
          on:touchmove|preventDefault={(e) => handleToastTouchMove(toast, e)}
          on:touchend|preventDefault={() => handleToastTouchEnd(toast)}
          on:touchcancel|preventDefault={() => handleToastTouchEnd(toast)}
        >
          {#if toast.type === "warning"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" /><polyline
                points="12 6 12 12 16 14"
              />
            </svg>
          {:else if toast.type === "success"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10b981"
              stroke-width="2.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          {:else if toast.type === "call"}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366f1"
              stroke-width="2"
            >
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3"
              />
            </svg>
          {:else}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3b82f6"
              stroke-width="2"
            >
              <path
                d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
              />
            </svg>
          {/if}
          <span>{toast.text}</span>
          <button
            class="toast-close"
            on:click|stopPropagation={() => dismissToast(toast.id)}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>
      </div>
    {/each}
  </div>

  <!-- Bottom Panel -->
  <div class="bottom-panel">
    <!-- ETA -->
    {#if !delivered}
      <div class="eta-section" in:fade>
        {#if arriving}
          <div class="eta-arriving">
            <span class="arriving-dot"></span>
            Arrivée imminente
          </div>
        {:else}
          <div class="eta-row">
            <span class="eta-number">{etaText}</span>
            <span class="eta-label">estimé</span>
          </div>
        {/if}
        <div class="eta-dist">
          {distLeft > 1000
            ? (distLeft / 1000).toFixed(1) + " km"
            : distLeft + " m"}
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: {progress * 100}%"></div>
          <div class="progress-thumb" style="left: {progress * 100}%"></div>
        </div>
      </div>
    {:else}
      <div class="delivered-section" in:fly={{ y: 20 }}>
        <div class="delivered-check">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            stroke-width="2.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <span class="delivered-title">Colis livré !</span>
          <span class="delivered-sub">Déposé au {parcel.address}</span>
        </div>
      </div>
    {/if}

    <!-- Driver -->
    <div class="driver-row">
      <div class="driver-avatar">
        {driver.initials}
        <span class="online-dot"></span>
      </div>
      <div class="driver-info">
        <span class="driver-name">{driver.name}</span>
        <span class="driver-meta">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="#f59e0b"
            stroke="none"
          >
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"
            />
          </svg>
          {driver.rating} · {driver.deliveries} livraisons
        </span>
        <span class="driver-vehicle">{driver.vehicle} · {driver.plate}</span>
      </div>
      <div class="driver-btns">
        <button
          class="icon-btn call-icon"
          on:click={initiateCall}
          aria-label="Appeler"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
            />
          </svg>
        </button>
        <button
          class="icon-btn msg-icon"
          on:click={() => (chatOpen = true)}
          aria-label="Message"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
            />
          </svg>
          {#if messages.filter((m) => m.from === "driver" && !m.read).length > 0}
            <span class="btn-badge"></span>
          {/if}
        </button>
      </div>
    </div>

    <!-- Parcel -->
    <div class="parcel-row">
      <div class="parcel-icon">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          stroke-width="1.5"
        >
          <path
            d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"
          />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line
            x1="12"
            y1="22.08"
            x2="12"
            y2="12"
          />
        </svg>
      </div>
      <div class="parcel-info">
        <span class="parcel-desc">{parcel.description}</span>
        <span class="parcel-sub">{parcel.from} · {parcel.id}</span>
      </div>
    </div>

    <!-- Instructions -->
    <div class="instructions-row">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#92400e"
        stroke-width="2"
      >
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle
          cx="12"
          cy="10"
          r="3"
        />
      </svg>
      <span>{parcel.address}</span>
    </div>

    <!-- Timeline -->
    <div class="timeline-row">
      {#each steps as step, i}
        <div
          class="tl"
          class:done={i < doneSteps}
          class:now={i === doneSteps - 1 && !delivered}
          class:wait={i >= doneSteps}
        >
          <div class="tl-dot">
            {#if i < doneSteps}
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                stroke-width="4"><polyline points="20 6 9 17 4 12" /></svg
              >
            {/if}
          </div>
          {#if i < steps.length - 1}
            <div class="tl-bar" class:filled={i < doneSteps - 1}></div>
          {/if}
        </div>
      {/each}
    </div>
    <div class="tl-names">
      {#each steps as step, i}
        <span class:active={i === doneSteps - 1 && !delivered}
          >{step.label}</span
        >
      {/each}
    </div>

    {#if geoError}
      <p class="geo-hint">Position approx. (géolocalisation refusée)</p>
    {/if}
  </div>

  <!-- Chat -->
  <ChatPanel
    bind:open={chatOpen}
    {messages}
    driverName={driver.name}
    on:send={handleSend}
    on:toggle={handleChatToggle}
  />

  <!-- Incoming Call -->
  <IncomingCall
    show={showCall}
    driverName={driver.name}
    reason={callReason}
    on:end={handleCallEnd}
  />
</div>

<style>
  .app {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #f0f4f8;
  }

  .map-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  /* Top bar */
  .top-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.97) 60%,
      rgba(255, 255, 255, 0)
    );
    pointer-events: none;
  }

  .top-left {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #0f172a;
  }

  .top-title {
    font-weight: 700;
    font-size: 15px;
    letter-spacing: -0.3px;
  }

  .live-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #ef4444;
    background: white;
    padding: 5px 12px;
    border-radius: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    letter-spacing: 0.8px;
    pointer-events: auto;
  }

  .live-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #ef4444;
    animation: blink 1.5s ease-in-out infinite;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  /* Toasts */
  .toast-container {
    position: fixed;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 450;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    background: white;
    padding: 10px 18px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    color: #1e293b;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
    pointer-events: auto;
    border-left: 3px solid #3b82f6;
    cursor: grab;
    user-select: none;
    touch-action: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }

  .toast-wrapper {
    pointer-events: auto;
  }

  .toast.dragging {
    cursor: grabbing;
  }

  .toast-close {
    margin-left: 6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: #f1f5f9;
    color: #64748b;
    font-size: 14px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .toast-close:hover {
    background: #e2e8f0;
    color: #1e293b;
  }

  .toast-warning {
    border-left-color: #f59e0b;
  }
  .toast-success {
    border-left-color: #10b981;
  }
  .toast-call {
    border-left-color: #6366f1;
  }

  /* Bottom panel */
  .bottom-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 100;
    background: white;
    border-radius: 24px 24px 0 0;
    padding: 10px 20px 28px;
    box-shadow: 0 -4px 30px rgba(0, 0, 0, 0.1);
    max-height: 60vh;
    overflow-y: auto;
  }

  .bottom-panel::before {
    content: "";
    display: block;
    width: 36px;
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    margin: 4px auto 14px;
  }

  /* ETA */
  .eta-section {
    text-align: center;
    margin-bottom: 16px;
  }

  .eta-row {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
  }

  .eta-number {
    font-size: 44px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -2px;
    font-family: "JetBrains Mono", monospace;
    line-height: 1;
  }

  .eta-label {
    font-size: 16px;
    color: #94a3b8;
    font-weight: 500;
  }

  .eta-arriving {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 20px;
    font-weight: 800;
    color: #f59e0b;
    animation: arrPulse 1.2s ease-in-out infinite;
  }

  .arriving-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #f59e0b;
    animation: blink 0.8s ease-in-out infinite;
  }

  @keyframes arrPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.6;
    }
  }

  .eta-dist {
    font-size: 13px;
    color: #64748b;
    margin: 4px 0 12px;
  }

  .progress-track {
    position: relative;
    height: 4px;
    background: #f1f5f9;
    border-radius: 2px;
    max-width: 300px;
    margin: 0 auto;
  }

  .progress-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #6366f1);
    border-radius: 2px;
    transition: width 0.15s linear;
  }

  .progress-thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    background: white;
    border: 3px solid #3b82f6;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    transition: left 0.15s linear;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  }

  /* Delivered */
  .delivered-section {
    display: flex;
    align-items: center;
    gap: 14px;
    justify-content: center;
    margin-bottom: 16px;
  }

  .delivered-check {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #10b981;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes popIn {
    0% {
      transform: scale(0);
    }
    100% {
      transform: scale(1);
    }
  }

  .delivered-title {
    display: block;
    font-size: 20px;
    font-weight: 800;
    color: #10b981;
    letter-spacing: -0.3px;
  }

  .delivered-sub {
    display: block;
    font-size: 13px;
    color: #64748b;
  }

  /* Driver */
  .driver-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: #f8fafc;
    border: 1px solid #f1f5f9;
    border-radius: 14px;
    margin-bottom: 10px;
  }

  .driver-avatar {
    position: relative;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }

  .online-dot {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #10b981;
    border: 2px solid white;
  }

  .driver-info {
    flex: 1;
    min-width: 0;
  }

  .driver-name {
    display: block;
    font-weight: 700;
    font-size: 14px;
    color: #0f172a;
  }

  .driver-meta {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    color: #64748b;
  }

  .driver-vehicle {
    display: block;
    font-size: 11px;
    color: #94a3b8;
  }

  .driver-btns {
    display: flex;
    gap: 8px;
  }

  .icon-btn {
    all: unset;
    cursor: pointer;
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: white;
    border: 1px solid #e8ecf1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #334155;
    transition: all 0.15s;
  }

  .icon-btn:hover {
    border-color: #3b82f6;
    color: #3b82f6;
    background: #eff6ff;
  }

  .call-icon:hover {
    border-color: #10b981;
    color: #10b981;
    background: #ecfdf5;
  }

  .btn-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #ef4444;
    border: 2px solid white;
  }

  /* Parcel */
  .parcel-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .parcel-icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: #eff6ff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .parcel-desc {
    display: block;
    font-size: 13.5px;
    font-weight: 600;
    color: #0f172a;
  }

  .parcel-sub {
    font-size: 12px;
    color: #94a3b8;
  }

  /* Instructions */
  .instructions-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #fefce8;
    border: 1px solid #fde68a;
    border-radius: 8px;
    font-size: 12px;
    color: #92400e;
    font-weight: 500;
    margin-bottom: 14px;
  }

  /* Timeline */
  .timeline-row {
    display: flex;
    align-items: center;
    margin-bottom: 5px;
  }

  .tl {
    display: flex;
    align-items: center;
    flex: 1;
  }

  .tl:last-child {
    flex: 0;
  }

  .tl-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #e8ecf1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.3s;
  }

  .tl.done .tl-dot {
    background: #3b82f6;
  }

  .tl.now .tl-dot {
    background: #3b82f6;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
    animation: nowPulse 2s ease-in-out infinite;
  }

  @keyframes nowPulse {
    0%,
    100% {
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
    }
    50% {
      box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.06);
    }
  }

  .tl.wait .tl-dot {
    background: #f8fafc;
    border: 2px solid #e2e8f0;
  }

  .tl-bar {
    flex: 1;
    height: 2px;
    background: #e8ecf1;
    margin: 0 3px;
  }

  .tl-bar.filled {
    background: #3b82f6;
  }

  .tl-names {
    display: flex;
    justify-content: space-between;
  }

  .tl-names span {
    font-size: 10px;
    color: #94a3b8;
    flex: 1;
    text-align: center;
  }

  .tl-names span:first-child {
    text-align: left;
  }
  .tl-names span:last-child {
    text-align: right;
  }
  .tl-names span.active {
    color: #3b82f6;
    font-weight: 600;
  }

  .geo-hint {
    text-align: center;
    font-size: 10px;
    color: #cbd5e1;
    margin-top: 10px;
    font-style: italic;
  }

  @media (min-width: 768px) {
    .bottom-panel {
      left: 50%;
      transform: translateX(-50%);
      max-width: 420px;
      border-radius: 24px;
      bottom: 20px;
      box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12);
    }
  }
</style>
