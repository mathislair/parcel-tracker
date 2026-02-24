<script>
  import { fly, fade } from "svelte/transition";
  import { createEventDispatcher, onMount, onDestroy } from "svelte";

  export let driverName = "Karim B.";
  export let reason = "";
  export let show = false;

  const dispatch = createEventDispatcher();
  let ringInterval;
  let ringOn = true;
  let elapsed = 0;
  let callActive = false;
  let callTimer;
  let ringAudio;
  let callAudio;
  let ringPlaying = false;
  let callPlaying = false;
  let audioUnlocked = false;
  let pendingRingtone = false;
  let pendingCallAudio = false;

  function startRingtone() {
    if (!ringAudio) {
      ringAudio = new Audio(`${import.meta.env.BASE_URL}Skype.mp3`);
      ringAudio.loop = true;
      ringAudio.volume = 0.9;
    }
    if (!ringPlaying) {
      ringPlaying = true;
      ringAudio.currentTime = 0;
      ringAudio.play().catch(() => {
        ringPlaying = false;
        pendingRingtone = true;
      });
    }
  }

  function startCallAudio() {
    if (!callAudio) {
      callAudio = new Audio(`${import.meta.env.BASE_URL}greg.mp3`);
      callAudio.loop = false;
      callAudio.volume = 0.95;
    }
    if (!callPlaying) {
      callPlaying = true;
      callAudio.currentTime = 0;
      callAudio.play().catch(() => {
        callPlaying = false;
        pendingCallAudio = true;
      });
    }
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    if (!ringAudio) {
      ringAudio = new Audio(`${import.meta.env.BASE_URL}Skype.mp3`);
      ringAudio.loop = true;
      ringAudio.volume = 0.9;
    }
    if (!callAudio) {
      callAudio = new Audio(`${import.meta.env.BASE_URL}greg.mp3`);
      callAudio.loop = false;
      callAudio.volume = 0.95;
    }
    ringAudio
      .play()
      .then(() => {
        ringAudio.pause();
        ringAudio.currentTime = 0;
        audioUnlocked = true;
        if (pendingRingtone && show && !callActive) {
          pendingRingtone = false;
          startRingtone();
        }
        if (pendingCallAudio && callActive) {
          pendingCallAudio = false;
          startCallAudio();
        }
      })
      .catch(() => {
        pendingRingtone = true;
        pendingCallAudio = true;
      });
  }

  function stopRingtone() {
    if (ringAudio && ringPlaying) {
      ringAudio.pause();
      ringAudio.currentTime = 0;
    }
    ringPlaying = false;
    pendingRingtone = false;
  }

  function stopCallAudio() {
    if (callAudio && callPlaying) {
      callAudio.pause();
      callAudio.currentTime = 0;
    }
    callPlaying = false;
    pendingCallAudio = false;
  }

  $: if (show && !callActive) {
    ringInterval = setInterval(() => {
      ringOn = !ringOn;
    }, 500);
    startRingtone();
  }

  $: if (!show || callActive) {
    stopRingtone();
  }

  $: if (!show) {
    stopCallAudio();
  }

  function accept() {
    callActive = true;
    clearInterval(ringInterval);
    stopRingtone();
    startCallAudio();
    elapsed = 0;
    callTimer = setInterval(() => {
      elapsed++;
    }, 1000);

    // Auto hang up after 5-12s
    const duration = 5000 + Math.random() * 7000;
    setTimeout(() => hangup(), duration);
  }

  function decline() {
    clearInterval(ringInterval);
    clearInterval(callTimer);
    stopRingtone();
    stopCallAudio();
    dispatch("end", { accepted: false });
  }

  function hangup() {
    clearInterval(callTimer);
    stopRingtone();
    stopCallAudio();
    dispatch("end", { accepted: true, duration: elapsed });
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  onDestroy(() => {
    clearInterval(ringInterval);
    clearInterval(callTimer);
    stopRingtone();
    stopCallAudio();
  });

  onMount(() => {
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
  });
</script>

{#if show}
  <div class="call-overlay" transition:fade={{ duration: 200 }}>
    <div class="call-card" in:fly={{ y: -40, duration: 350 }}>
      {#if !callActive}
        <!-- Ringing -->
        <div class="call-ring-anim">
          <div class="ring-circle r1" class:pulse={ringOn}></div>
          <div class="ring-circle r2" class:pulse={!ringOn}></div>
          <div class="call-avatar">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              stroke-width="2"
            >
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
              />
            </svg>
          </div>
        </div>
        <span class="call-label">Appel entrant</span>
        <span class="call-name">{driverName}</span>
        {#if reason}
          <span class="call-reason">{reason}</span>
        {/if}
        {#if !audioUnlocked}
          <button class="sound-unlock" on:click={unlockAudio}>
            Activer le son
          </button>
        {/if}
        <div class="call-actions">
          <button
            class="call-btn decline"
            on:click={decline}
            aria-label="Refuser l'appel"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" /><line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              />
            </svg>
          </button>
          <button
            class="call-btn accept"
            on:click={accept}
            aria-label="Accepter l'appel"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              stroke-width="2"
            >
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"
              />
            </svg>
          </button>
        </div>
      {:else}
        <!-- In call -->
        <div class="incall-avatar">
          <div class="incall-waves">
            <span class="wave w1"></span>
            <span class="wave w2"></span>
            <span class="wave w3"></span>
          </div>
          <div class="call-avatar active">KB</div>
        </div>
        <span class="call-name">{driverName}</span>
        <span class="call-timer">{fmtTime(elapsed)}</span>
        <div class="call-actions">
          <button
            class="call-btn hangup"
            on:click={hangup}
            aria-label="Raccrocher"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              stroke-width="2"
            >
              <path
                d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3"
              />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .call-overlay {
    position: fixed;
    inset: 0;
    z-index: 500;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .call-card {
    background: #0f172a;
    border-radius: 28px;
    padding: 40px 48px;
    text-align: center;
    min-width: 300px;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
  }

  /* Ring animation */
  .call-ring-anim {
    position: relative;
    width: 90px;
    height: 90px;
    margin: 0 auto 20px;
  }

  .ring-circle {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid #10b981;
    opacity: 0;
    transition: all 0.3s;
  }

  .ring-circle.pulse {
    opacity: 0.3;
    animation: ringPulse 1s ease-out;
  }

  .r1 {
    inset: -8px;
  }
  .r2 {
    inset: -20px;
  }

  @keyframes ringPulse {
    0% {
      transform: scale(0.8);
      opacity: 0.5;
    }
    100% {
      transform: scale(1.2);
      opacity: 0;
    }
  }

  .call-avatar {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 70px;
    height: 70px;
    border-radius: 50%;
    background: #10b981;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: avatarPulse 1.5s ease-in-out infinite;
  }

  .call-avatar.active {
    position: relative;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    font-size: 22px;
    font-weight: 700;
    color: white;
    animation: none;
  }

  @keyframes avatarPulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.3);
    }
    50% {
      box-shadow: 0 0 0 15px rgba(16, 185, 129, 0);
    }
  }

  .call-label {
    display: block;
    font-size: 13px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .call-name {
    display: block;
    font-size: 22px;
    font-weight: 700;
    color: white;
    margin-bottom: 4px;
  }

  .call-reason {
    display: block;
    font-size: 13px;
    color: #94a3b8;
    margin-bottom: 8px;
    font-style: italic;
  }

  .call-timer {
    display: block;
    font-family: "JetBrains Mono", monospace;
    font-size: 16px;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .incall-avatar {
    position: relative;
    width: 90px;
    height: 90px;
    margin: 0 auto 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .incall-waves {
    position: absolute;
    inset: -12px;
  }

  .wave {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid rgba(99, 102, 241, 0.3);
    animation: waveOut 2s ease-out infinite;
  }

  .w1 {
    animation-delay: 0s;
  }
  .w2 {
    animation-delay: 0.6s;
  }
  .w3 {
    animation-delay: 1.2s;
  }

  @keyframes waveOut {
    0% {
      transform: scale(0.7);
      opacity: 0.6;
    }
    100% {
      transform: scale(1.4);
      opacity: 0;
    }
  }

  .call-actions {
    display: flex;
    justify-content: center;
    gap: 32px;
    margin-top: 28px;
  }

  .sound-unlock {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(15, 23, 42, 0.8);
    color: #e2e8f0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.3px;
    margin: 14px auto 0;
    cursor: pointer;
  }

  .sound-unlock:hover {
    background: rgba(30, 41, 59, 0.85);
  }

  .call-btn {
    all: unset;
    cursor: pointer;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s;
  }

  .call-btn:hover {
    transform: scale(1.1);
  }

  .call-btn.accept {
    background: #10b981;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
  }

  .call-btn.decline {
    background: #ef4444;
    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
  }

  .call-btn.hangup {
    background: #ef4444;
    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.4);
  }

  @media (max-width: 400px) {
    .call-card {
      margin: 0 16px;
      padding: 32px 24px;
    }
  }
</style>
