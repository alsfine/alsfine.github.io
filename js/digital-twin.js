/**
 * ClearVoice Digital Twin & Mystery Speech Game Controller
 * Connects static GitHub Pages site to live Python hardware telemetry via MQTT over WSS.
 * Strictly read-only digital twin — hardware control is reserved for presenters.
 * Mystery sentences are strictly unrevealed — visitors must guess what they hear!
 */

// Mystery sentence descriptors (Text and category hints are completely stripped — only Choice A, Choice B, etc.)
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
  currentPipeline: null,     // null when hardware is offline — no configuration shown
  currentFilter: null,       // null when hardware is offline — no configuration shown
  audioLevel: 0,
  isAudioPresent: false,
  isVadActive: false,
  isGameEnabled: false,      // Disabled until hardware passthrough connects and enables it
  isCooldown: false,
  cooldownRemaining: 0,
  mqttClient: null
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initMysteryGame();
  initDigitalTwinUI();
  initMqttClient();
  startHardwareWatchdog();
  checkStoredCooldown();
});

/**
 * 1. Mystery Sentence Game Initialization
 */
function initMysteryGame() {
  const select = document.getElementById('mysterySentenceSelect');
  const playBtn = document.getElementById('playMysteryBtn');

  if (!select || !playBtn) return;

  // Populate options strictly as Choice A, Choice B, etc. (no hints or category info)
  select.innerHTML = '';
  Object.keys(MYSTERY_SENTENCES).forEach(key => {
    const s = MYSTERY_SENTENCES[key];
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = s.label;
    select.appendChild(opt);
  });

  // Play button click handler
  playBtn.addEventListener('click', () => {
    if (twinState.isCooldown || !twinState.isGameEnabled) return;
    const selectedKey = select.value;
    const sentenceObj = MYSTERY_SENTENCES[selectedKey];
    if (!sentenceObj) return;

    triggerSentencePlayback(sentenceObj);
  });
}

/**
 * Triggers sentence playback with anti-abuse cooldown & sends MQTT packet
 * The user's device ONLY sends the request to the laptop — NO audio is played on the user's device!
 */
function triggerSentencePlayback(sentenceObj) {
  startCooldown(12);

  // Transmit command via MQTT (strictly sends sentence ID to laptop, never plays locally)
  if (twinState.mqttClient && twinState.mqttClient.isConnected()) {
    try {
      const payload = JSON.stringify({
        cmd: 'PLAY_TTS',
        sentence_id: sentenceObj.id,
        timestamp: Date.now()
      });
      const message = new Paho.MQTT.Message(payload);
      message.destinationName = MQTT_CONFIG.topicTts;
      twinState.mqttClient.send(message);
    } catch (e) {
      console.warn('MQTT send failed:', e);
    }
  }
}

/**
 * Cooldown & Anti-Spam Management (persists across page reloads via localStorage)
 */
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
  if (statusText) statusText.textContent = '🔊 Playing on Booth Speaker...';

  const total = Math.max(1, seconds);
  cooldownInterval = setInterval(() => {
    twinState.cooldownRemaining -= 0.1;
    if (twinState.cooldownRemaining <= 0) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
      twinState.isCooldown = false;
      try { localStorage.removeItem('clearvoice_cooldown_end'); } catch (e) {}

      if (twinState.isGameEnabled) {
        if (playBtn) playBtn.disabled = false;
        if (playBtnText) playBtnText.textContent = 'Transmit to Booth Speaker';
        if (statusBadge) statusBadge.classList.remove('playing');
        if (statusText) statusText.textContent = 'Booth Speaker Ready';
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

/**
 * 2. Digital Twin UI — Strictly Read-Only Hardware Telemetry Display
 * Users on the website cannot configure or modify hardware DSP settings.
 * When hardware is offline, no configuration is active and LIVE badges are cleared.
 */
function initDigitalTwinUI() {
  // Start strictly in offline state — no configuration or LIVE badges shown
  setHardwareOfflineUI();
}

function setHardwareOfflineUI() {
  twinState.isHardwareConnected = false;
  twinState.currentPipeline = null;
  twinState.currentFilter = null;
  twinState.isGameEnabled = false;

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

  // 4. Remove active status from all pills — NO pipeline or filter is shown as active or live
  document.querySelectorAll('#pipelineGroup .twin-pill').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#filterGroup .twin-pill').forEach(p => p.classList.remove('active'));

  // 5. Reset VU meter to 0%
  updateVuMeter(0);

  // 6. Speaker panel disappears completely when hardware is offline
  updateSpeakerPanelVisibility();
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
    vadBadge.textContent = 'VAD: Tracking';
  }

  // 3. Update speaker panel visibility
  updateSpeakerPanelVisibility();
}

/**
 * Speaker panel visibility control:
 * The panel will not appear at all until the passthrough has enabled it,
 * and if the passthrough disables the user speaker input, the panel disappears.
 */
function updateSpeakerPanelVisibility() {
  const boothGame = document.getElementById('booth-game');
  if (!boothGame) return;

  if (twinState.isHardwareConnected && twinState.isGameEnabled) {
    boothGame.style.display = 'block';
  } else {
    boothGame.style.display = 'none';
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
    badge.textContent = text || 'VAD: Voice Protected';
  } else {
    badge.className = 'vad-status-badge';
    badge.textContent = text || 'VAD: Tracking';
  }
}

/**
 * 3. MQTT Client for Live Telemetry (Read-Only)
 */
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
    updateVadDisplay(data.vad_active, data.vad_active ? 'VAD: Active (Adaptation Frozen)' : 'VAD: Tracking Room Noise');
  }

  // 2. Presenter Speaker Input Control & Panel Visibility
  if (typeof data.game_enabled !== 'undefined') {
    twinState.isGameEnabled = Boolean(data.game_enabled);
  }

  // Per user requirements: The speaker panel will not appear at all until the passthrough has enabled it,
  // and if the passthrough disables user speaker input, the panel disappears.
  updateSpeakerPanelVisibility();

  if (twinState.isGameEnabled && !twinState.isCooldown) {
    const playBtn = document.getElementById('playMysteryBtn');
    const playBtnText = document.getElementById('playBtnText');
    const statusBadge = document.getElementById('gameStatusBadge');
    const statusText = document.getElementById('gameStatusText');

    if (playBtn) playBtn.disabled = false;
    if (playBtnText) playBtnText.textContent = 'Transmit to Booth Speaker';
    if (statusBadge) {
      statusBadge.classList.remove('playing');
      statusBadge.style.backgroundColor = '';
      statusBadge.style.borderColor = '';
      statusBadge.style.color = '';
    }
    if (statusText) statusText.textContent = 'Booth Speaker Ready';
  }

  // 3. Hardware Cooldown Broadcast Sync
  if (data.cooldown_active && !twinState.isCooldown && data.cooldown_remaining > 0) {
    startCooldown(data.cooldown_remaining, false);
  }
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
