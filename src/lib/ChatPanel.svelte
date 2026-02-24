<script>
  import { fly, slide, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { quickReplies, driverAutoReplies } from './events.js';
  import { createEventDispatcher, tick, afterUpdate } from 'svelte';

  export let messages = [];
  export let driverName = 'Karim B.';
  export let open = false;

  const dispatch = createEventDispatcher();

  let inputText = '';
  let chatBody;
  let unread = 0;

  $: if (!open) {
    unread = messages.filter(m => m.from === 'driver' && !m.read).length;
  }

  $: if (open) {
    messages = messages.map(m => ({ ...m, read: true }));
    unread = 0;
  }

  afterUpdate(() => {
    if (chatBody && open) {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
  });

  function send() {
    const text = inputText.trim();
    if (!text) return;

    dispatch('send', { text });
    inputText = '';
  }

  function sendQuick(reply) {
    dispatch('send', { text: reply });
  }

  function toggle() {
    open = !open;
    dispatch('toggle', { open });
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function formatMsgTime(ts) {
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
</script>

<!-- Chat bubble button -->
{#if !open}
  <button class="chat-fab" on:click={toggle} transition:fade={{ duration: 150 }} aria-label="Ouvrir le chat">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
    {#if unread > 0}
      <span class="chat-badge" in:fly={{ y: -5 }}>{unread}</span>
    {/if}
  </button>
{/if}

<!-- Chat panel -->
{#if open}
  <div class="chat-panel" transition:fly={{ y: 400, duration: 300 }}>
    <div class="chat-header">
      <div class="chat-header-left">
        <div class="chat-avatar">KB</div>
        <div>
          <span class="chat-name">{driverName}</span>
          <span class="chat-status">Votre livreur</span>
        </div>
      </div>
      <button class="chat-close" on:click={toggle} aria-label="Fermer le chat">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <div class="chat-body" bind:this={chatBody}>
      {#if messages.length === 0}
        <div class="chat-empty">
          <p>Envoyez un message à votre livreur</p>
        </div>
      {/if}

      {#each messages as msg (msg.id)}
        <div class="msg" class:from-me={msg.from === 'user'} class:from-driver={msg.from === 'driver'} animate:flip={{ duration: 200 }}>
          {#if msg.from === 'driver'}
            <div class="msg-avatar-sm">K</div>
          {/if}
          <div class="msg-bubble" class:driver-bubble={msg.from === 'driver'} class:user-bubble={msg.from === 'user'}>
            {#if msg.type === 'delay'}
              <span class="msg-delay-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </span>
            {/if}
            <span class="msg-text">{msg.text}</span>
            <span class="msg-time">{formatMsgTime(msg.timestamp)}</span>
          </div>
        </div>
      {/each}
    </div>

    <!-- Quick replies -->
    <div class="quick-replies">
      {#each quickReplies as reply}
        <button class="quick-btn" on:click={() => sendQuick(reply)}>{reply}</button>
      {/each}
    </div>

    <!-- Input -->
    <div class="chat-input-area">
      <input
        type="text"
        class="chat-input"
        placeholder="Écrire un message..."
        bind:value={inputText}
        on:keydown={handleKey}
      />
      <button class="send-btn" on:click={send} disabled={!inputText.trim()} aria-label="Envoyer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  /* FAB */
  .chat-fab {
    all: unset;
    cursor: pointer;
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 300;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(59,130,246,0.35);
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .chat-fab:hover {
    transform: scale(1.08);
    box-shadow: 0 6px 24px rgba(59,130,246,0.45);
  }

  .chat-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #ef4444;
    color: white;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid white;
  }

  /* Panel */
  .chat-panel {
    position: fixed;
    bottom: 0;
    right: 0;
    z-index: 400;
    width: 380px;
    max-height: 85vh;
    background: white;
    border-radius: 20px 20px 0 0;
    box-shadow: 0 -4px 40px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid #f1f5f9;
    background: #fafbfc;
  }

  .chat-header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .chat-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 13px;
  }

  .chat-name {
    display: block;
    font-weight: 700;
    font-size: 14px;
    color: #0f172a;
  }

  .chat-status {
    display: block;
    font-size: 11px;
    color: #10b981;
    font-weight: 500;
  }

  .chat-close {
    all: unset;
    cursor: pointer;
    color: #94a3b8;
    padding: 4px;
    border-radius: 8px;
    display: flex;
    transition: color 0.15s;
  }

  .chat-close:hover {
    color: #334155;
  }

  /* Body */
  .chat-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 200px;
    max-height: 350px;
    scrollbar-width: thin;
    scrollbar-color: #e2e8f0 transparent;
  }

  .chat-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .chat-empty p {
    color: #cbd5e1;
    font-size: 13px;
  }

  .msg {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    animation: msgIn 0.25s ease-out;
  }

  @keyframes msgIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .msg.from-me {
    justify-content: flex-end;
  }

  .msg-avatar-sm {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6, #6366f1);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .msg-bubble {
    max-width: 260px;
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 13.5px;
    line-height: 1.45;
    position: relative;
  }

  .driver-bubble {
    background: #f1f5f9;
    color: #1e293b;
    border-bottom-left-radius: 4px;
  }

  .user-bubble {
    background: #3b82f6;
    color: white;
    border-bottom-right-radius: 4px;
  }

  .msg-delay-icon {
    display: inline-flex;
    vertical-align: middle;
    margin-right: 4px;
  }

  .msg-text {
    display: inline;
  }

  .msg-time {
    display: block;
    font-size: 10px;
    opacity: 0.5;
    margin-top: 4px;
    text-align: right;
  }

  /* Quick replies */
  .quick-replies {
    display: flex;
    gap: 6px;
    padding: 8px 16px;
    overflow-x: auto;
    border-top: 1px solid #f1f5f9;
    scrollbar-width: none;
  }

  .quick-replies::-webkit-scrollbar { display: none; }

  .quick-btn {
    all: unset;
    cursor: pointer;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: #3b82f6;
    background: #eff6ff;
    padding: 6px 12px;
    border-radius: 16px;
    border: 1px solid #dbeafe;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .quick-btn:hover {
    background: #dbeafe;
  }

  /* Input */
  .chat-input-area {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #f1f5f9;
    background: white;
  }

  .chat-input {
    all: unset;
    flex: 1;
    font-size: 14px;
    color: #1e293b;
    padding: 10px 14px;
    background: #f8fafc;
    border: 1px solid #e8ecf1;
    border-radius: 20px;
    font-family: 'DM Sans', sans-serif;
    transition: border-color 0.15s;
  }

  .chat-input::placeholder {
    color: #cbd5e1;
  }

  .chat-input:focus {
    border-color: #3b82f6;
  }

  .send-btn {
    all: unset;
    cursor: pointer;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: #3b82f6;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    background: #2563eb;
  }

  .send-btn:disabled {
    background: #e2e8f0;
    color: #94a3b8;
    cursor: default;
  }

  @media (max-width: 500px) {
    .chat-panel {
      width: 100%;
      max-height: 90vh;
    }

    .chat-fab {
      bottom: 16px;
      right: 16px;
    }
  }
</style>
