/**
 * ClearVoice Digital Twin & Mystery Speech Game Controller
 * 
 * ARCHITECTURE CHANGE:
 * The game section is now gated behind a secret URL parameter.
 * Only the demo laptop (which knows the secret URL) can see and play the game.
 * Audio plays directly from the browser via the Web Audio API — no MQTT needed for playback.
 * 
 * MQTT is still used for the digital twin telemetry dashboard (read-only hardware state).
 * 
 * Admin URL: yoursite.com/?speaker=clearvoice2026
 * (Change ADMIN_SECRET below to customize the password)
 */

// ─── Admin Gate Configuration ───
const ADMIN_SECRET = 'clearvoice2026';

// Mystery sentence descriptors (Text is hidden — only Choice labels shown)
const MYSTERY_SENTENCES = {
  A: { id: 'A', label: 'Choice A' },
  B: { id: 'B', label: 'Choice B' },
  C: { id: 'C', label: 'Choice C' },
  D: { id: 'D', label: 'Choice D' },
  E: { id: 'E', label: 'Choice E' },
  F: { id: 'F', label: 'Choice F' }
};

// MQTT Configuration (Free, public broker over secure WebSocket)
const MQTT_CONFIG = {
  host: 'broker.hivemq.com',
  port: 8884,
  path: '/mqtt',
  topicTelemetry: 'wits/clearvoice/telemetry',
  topicTts: 'wits/clearvoice/tts'
};

// Digital Twin & Booth Game State
const twinState = {
  isHardwareConnected: false,
  lastTelemetryTime: 0,
  currentPipeline: null,
  currentFilter: null,
  audioLevel: 0,
  isAudioPresent: false,
  isVadActive: false,
  isAdminMode: false,      // True when secret URL param is present
  isCooldown: false,
  cooldownRemaining: 0,
  mqttClient: null,
  currentAudio: null       // Currently playing Audio element
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // 1. Check if this device is the admin speaker laptop
  checkAdminAccess();

  // 2. Initialize game UI (only functional if admin)
  initMysteryGame();

  // 3. Initialize digital twin telemetry dashboard
  initDigitalTwinUI();
  initMqttClient();
  startHardwareWatchdog();

  // 4. Restore any active cooldown across page reloads
  checkStoredCooldown();
});

// ─── Admin Access Gate ───

/**
 * Checks URL for the secret speaker parameter.
 * If ?speaker=clearvoice2026 is in the URL, the game section is shown.
 * Otherwise, the game section stays completely hidden.
 */
function checkAdminAccess() {
  const params = new URLSearchParams(window.location.search);
  const speakerKey = params.get('speaker');

  if (speakerKey === ADMIN_SECRET) {
    twinState.isAdminMode = true;
    showAdminSpeakerPanel();
  } else {
    twinState.isAdminMode = false;
    hideAdminSpeakerPanel();
  }
}

function showAdminSpeakerPanel() {
  const boothGame = document.getElementById('booth-game');
  if (boothGame) {
    boothGame.style.display = 'block';
  }

  // Enable the play button immediately (no MQTT dependency)
  const playBtn = document.getElementById('playMysteryBtn');
  if (playBtn && !twinState.isCooldown) {
    playBtn.disabled = false;
  }

  const statusText = document.getElementById('gameStatusText');
  if (statusText) statusText.textContent = 'Speaker Ready';
}

function hideAdminSpeakerPanel() {
  const boothGame = document.getElementById('booth-game');
  if (boothGame) {
    boothGame.style.display = 'none';
  }
}

// ─── Mystery Sentence Game (Direct Browser Audio Playback) ───

function initMysteryGame() {
  const select = document.getElementById('mysterySentenceSelect');
  const playBtn = document.getElementById('playMysteryBtn');

  if (!select || !playBtn) return;

  // Populate options strictly as Choice A, Choice B, etc.
  select.innerHTML = '';
  Object.keys(MYSTERY_SENTENCES).forEach(key => {
    const s = MYSTERY_SENTENCES[key];
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = s.label;
    select.appendChild(opt);
  });

  // Play button — plays audio directly from this browser
  playBtn.addEventListener('click', () => {
    if (twinState.isCooldown || !twinState.isAdminMode) return;
    const selectedKey = select.value;
    const sentenceObj = MYSTERY_SENTENCES[selectedKey];
    if (!sentenceObj) return;

    playAudioLocally(sentenceObj);
  });
}

/**
 * Plays the mystery sentence WAV file directly through this browser's audio output.
 * The audio comes out of whatever speaker/output device this laptop is using.
 */
function playAudioLocally(sentenceObj) {
  // Stop any currently playing audio
  if (twinState.currentAudio) {
    twinState.currentAudio.pause();
    twinState.currentAudio.currentTime = 0;
    twinState.currentAudio = null;
  }

  const audioPath = `assets/audio/mystery_${sentenceObj.id.toLowerCase()}.wav`;
  const audio = new Audio(audioPath);
  
  // Set volume to maximum for booth speaker playback
  audio.volume = 1.0;
  twinState.currentAudio = audio;

  audio.addEventListener('canplaythrough', () => {
    // Start cooldown based on audio duration (+ 2s buffer)
    const cooldownDuration = Math.ceil(audio.duration) + 2;
    startCooldown(cooldownDuration);
  }, { once: true });

  audio.addEventListener('error', (e) => {
    console.error('Audio playback error:', e);
    const statusText = document.getElementById('gameStatusText');
    if (statusText) statusText.textContent = '⚠️ Audio file not found';
    setTimeout(() => {
      if (statusText) statusText.textContent = 'Speaker Ready';
    }, 3000);
  });

  audio.play().catch(err => {
    console.warn('Audio play failed (user interaction may be needed):', err);
    const statusText = document.getElementById('gameStatusText');
    if (statusText) statusText.textContent = '⚠️ Click page first to enable audio';
  });
}

// ─── Cooldown & Anti-Spam Management ───

let cooldownInterval = null;

function checkStoredCooldown() {
  try {
    const storedEnd = parseInt(localStorage.getItem('clearvoice_cooldown_end') || '0', 10);
    const now = Date.now();
    if (storedEnd > now) {
      const remainingSec = (storedEnd - now) / 1000;
      startCooldown(remainingSec, false);
    }
  } catch (e) {}
}

function startCooldown(seconds, storeStorage = true) {
  if (cooldownInterval) clearInterval(cooldownInterval);

  twinState.isCooldown = true;
  twinState.cooldownRemaining = seconds;

  if (storeStorage) {
    try {
      localStorage.setItem('clearvoice_cooldown_end', String(Date.now() + Math.ceil(seconds) * 1000));
    } catch (e) {}
  }

  const playBtn = document.getElementById('playMysteryBtn');
  const playBtnText = document.getElementById('playBtnText');
  const cooldownBox = document.getElementById('cooldownContainer');
  const cooldownFill = document.getElementById('cooldownFill');
  const cooldownSec = document.getElementById('cooldownSeconds');
  const statusBadge = document.getElementById('gameStatusBadge');
  const statusText = document.getElementById('gameStatusText');

  if (playBtn) playBtn.disabled = true;
  if (cooldownBox) cooldownBox.style.display = 'block';
  if (statusBadge) statusBadge.classList.add('playing');
  if (statusText) statusText.textContent = '🔊 Playing...';

  const total = Math.max(1, seconds);
  cooldownInterval = setInterval(() => {
    twinState.cooldownRemaining -= 0.1;
    if (twinState.cooldownRemaining <= 0) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
      twinState.isCooldown = false;
      try { localStorage.removeItem('clearvoice_cooldown_end'); } catch (e) {}

      if (twinState.isAdminMode) {
        if (playBtn) playBtn.disabled = false;
        if (playBtnText) playBtnText.textContent = 'Play Through Speaker';
        if (statusBadge) statusBadge.classList.remove('playing');
        if (statusText) statusText.textContent = 'Speaker Ready';
      }
      if (cooldownBox) cooldownBox.style.display = 'none';
    } else {
      const pct = (twinState.cooldownRemaining / total) * 100;
      if (cooldownFill) cooldownFill.style.width = pct + '%';
      if (cooldownSec) cooldownSec.textContent = Math.ceil(twinState.cooldownRemaining) + 's';
      if (playBtnText) playBtnText.textContent = `Please wait (${Math.ceil(twinState.cooldownRemaining)}s)`;
    }
  }, 100);
}

// ─── Digital Twin UI — Read-Only Hardware Telemetry Display ───

function initDigitalTwinUI() {
  setHardwareOfflineUI();
}

function setHardwareOfflineUI() {
  twinState.isHardwareConnected = false;
  twinState.currentPipeline = null;
  twinState.currentFilter = null;

  // 1. Connection Header Status Pill
  updateConnectionStatus(false, 'Hardware Offline (Awaiting Telemetry)');

  // 2. Mark cards as offline
  const pipelineCard = document.getElementById('pipelineCard');
  const filterCard = document.getElementById('filterCard');
  const meterCard = document.getElementById('meterCard');
  if (pipelineCard) pipelineCard.classList.add('is-offline');
  if (filterCard) filterCard.classList.add('is-offline');
  if (meterCard) meterCard.classList.add('is-offline');

  // 3. Update state badges to Offline
  const pipelineBadge = document.getElementById('pipelineStateBadge');
  if (pipelineBadge) {
    pipelineBadge.className = 'twin-state-badge offline';
    pipelineBadge.textContent = 'Offline';
  }
  const filterBadge = document.getElementById('filterStateBadge');
  if (filterBadge) {
    filterBadge.className = 'twin-state-badge offline';
    filterBadge.textContent = 'Offline';
  }
  const vadBadge = document.getElementById('vadStatusBadge');
  if (vadBadge) {
    vadBadge.className = 'vad-status-badge offline';
    vadBadge.textContent = 'Offline';
  }

  // 4. Remove active status from all pills
  document.querySelectorAll('#pipelineGroup .twin-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#filterGroup .twin-pill').forEach(p => p.classList.remove('active'));

  // 5. Reset VU meter to 0%
  updateVuMeter(0);

  // NOTE: Speaker panel visibility is now controlled ONLY by admin URL, not hardware state
}

function setHardwareLiveUI() {
  twinState.isHardwareConnected = true;

  // 1. Remove offline class from cards
  const pipelineCard = document.getElementById('pipelineCard');
  const filterCard = document.getElementById('filterCard');
  const meterCard = document.getElementById('meterCard');
  if (pipelineCard) pipelineCard.classList.remove('is-offline');
  if (filterCard) filterCard.classList.remove('is-offline');
  if (meterCard) meterCard.classList.remove('is-offline');

  // 2. Update badges to Live
  const pipelineBadge = document.getElementById('pipelineStateBadge');
  if (pipelineBadge) {
    pipelineBadge.className = 'twin-state-badge live';
    pipelineBadge.textContent = 'Live';
  }
  const filterBadge = document.getElementById('filterStateBadge');
  if (filterBadge) {
    filterBadge.className = 'twin-state-badge live';
    filterBadge.textContent = 'Live';
  }
  const vadBadge = document.getElementById('vadStatusBadge');
  if (vadBadge) {
    vadBadge.className = 'vad-status-badge';
    vadBadge.textContent = 'Noise Tracking';
  }
}

function setPipelineUI(pipeline) {
  if (!twinState.isHardwareConnected || !pipeline) {
    document.querySelectorAll('#pipelineGroup .twin-pill').forEach(p => p.classList.remove('active'));
    return;
  }
  twinState.currentPipeline = pipeline;
  const pills = document.querySelectorAll('#pipelineGroup .twin-pill');
  pills.forEach(p => {
    if (p.getAttribute('data-pipeline') === pipeline) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
}

function setFilterUI(filter) {
  if (!twinState.isHardwareConnected || !filter) {
    document.querySelectorAll('#filterGroup .twin-pill').forEach(p => p.classList.remove('active'));
    return;
  }
  twinState.currentFilter = filter;
  const pills = document.querySelectorAll('#filterGroup .twin-pill');
  pills.forEach(p => {
    if (p.getAttribute('data-filter') === filter) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
}

function updateVuMeter(level) {
  const fill = document.getElementById('vuMeterFill');
  if (fill) {
    if (!twinState.isHardwareConnected && level === 0) {
      fill.style.width = '0%';
      return;
    }
    const clamped = Math.max(0, Math.min(100, level));
    fill.style.width = clamped + '%';
    if (clamped > 65) {
      fill.style.background = 'linear-gradient(90deg, #0d9488, #f59e0b, #f43f5e)';
    } else if (clamped > 35) {
      fill.style.background = 'linear-gradient(90deg, #0d9488, #f59e0b)';
    } else {
      fill.style.background = '#0d9488';
    }
  }
}

function updateVadDisplay(isActive, text) {
  const badge = document.getElementById('vadStatusBadge');
  if (!badge) return;
  if (!twinState.isHardwareConnected && !isActive) {
    badge.className = 'vad-status-badge offline';
    badge.textContent = 'Offline';
    return;
  }
  if (isActive) {
    badge.className = 'vad-status-badge active';
    badge.textContent = text || 'Voice Active';
  } else {
    badge.className = 'vad-status-badge';
    badge.textContent = text || 'Noise Tracking';
  }
}

// ─── MQTT Client for Live Telemetry (Read-Only) ───

function initMqttClient() {
  if (typeof Paho === 'undefined') {
    console.warn('Paho MQTT library not loaded; running in Standby mode.');
    setHardwareOfflineUI();
    updateConnectionStatus(false, 'Standby Mode (Broker Offline)');
    return;
  }

  const clientId = 'web_client_' + Math.random().toString(16).substr(2, 8);
  const client = new Paho.MQTT.Client(MQTT_CONFIG.host, MQTT_CONFIG.port, MQTT_CONFIG.path, clientId);

  client.onConnectionLost = (responseObject) => {
    console.warn('MQTT Connection lost:', responseObject.errorMessage);
    setHardwareOfflineUI();
    updateConnectionStatus(false, 'MQTT Disconnected (Reconnecting...)');
    setTimeout(initMqttClient, 5000);
  };

  client.onMessageArrived = (message) => {
    try {
      const payload = JSON.parse(message.payloadString);
      handleIncomingTelemetry(payload);
    } catch (e) {
      console.warn('Failed to parse telemetry message:', e);
    }
  };

  const connectOptions = {
    useSSL: true,
    timeout: 5,
    onSuccess: () => {
      twinState.mqttClient = client;
      client.subscribe(MQTT_CONFIG.topicTelemetry);
      setHardwareOfflineUI();
      updateConnectionStatus(false, 'MQTT Connected (Awaiting Telemetry...)');
    },
    onFailure: (err) => {
      console.warn('MQTT connection failed:', err);
      setHardwareOfflineUI();
      updateConnectionStatus(false, 'Hardware Offline (Broker Unreachable)');
    }
  };

  try {
    client.connect(connectOptions);
  } catch (err) {
    console.warn('MQTT connect error:', err);
    setHardwareOfflineUI();
    updateConnectionStatus(false, 'Hardware Offline (Broker Unreachable)');
  }
}

/**
 * Handles incoming live telemetry JSON packets from passthrough.py
 * This is now PURELY for the digital twin dashboard — game playback is local.
 */
function handleIncomingTelemetry(data) {
  twinState.lastTelemetryTime = Date.now();
  const wasOffline = !twinState.isHardwareConnected;

  if (wasOffline) {
    setHardwareLiveUI();
  }

  updateConnectionStatus(true, '🟢 LIVE HARDWARE (ESP32-S3 Stream)');

  // 1. DSP Pipeline & Filter (Read-Only State Display)
  if (data.pipeline) {
    setPipelineUI(data.pipeline.toUpperCase());
  }

  if (data.filter) {
    setFilterUI(data.filter.toUpperCase());
  }

  if (typeof data.audio_level !== 'undefined') {
    updateVuMeter(data.audio_level);
  }

  if (typeof data.vad_active !== 'undefined') {
    updateVadDisplay(data.vad_active, data.vad_active ? 'Voice Active' : 'Noise Tracking');
  }

  // NOTE: game_enabled from telemetry is no longer used to gate the speaker panel.
  // The speaker panel is now gated purely by the admin URL secret.
}

function updateConnectionStatus(isLive, labelText) {
  const pill = document.getElementById('twinConnectionPill');
  const dot = document.getElementById('twinStatusDot');
  const text = document.getElementById('twinStatusText');

  if (pill && dot && text) {
    text.textContent = labelText;
    if (isLive) {
      pill.classList.add('live');
      dot.className = 'status-indicator-dot online';
    } else {
      pill.classList.remove('live');
      dot.className = 'status-indicator-dot offline';
    }
  }
}

/**
 * Watchdog: Toggles status back to Offline if no telemetry arrives for 4s
 */
function startHardwareWatchdog() {
  setInterval(() => {
    if (twinState.isHardwareConnected) {
      const elapsed = Date.now() - twinState.lastTelemetryTime;
      if (elapsed > 4000) {
        setHardwareOfflineUI();
      }
    }
  }, 1000);
}
