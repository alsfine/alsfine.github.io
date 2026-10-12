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
  currentPipeline: 'OPTIMAL',
  currentFilter: 'TECHNO',
  audioLevel: 15,
  isAudioPresent: false,
  isVadActive: false,
  isGameEnabled: true,       // Can be locked remotely by presenters via hotkey
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
 */
function triggerSentencePlayback(sentenceObj) {
  startCooldown(12);

  // 1. Transmit command via MQTT if connected (only sends ID, never plaintext)
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

  // 2. Play pre-rendered audio asset locally
  playLocalSpeech(sentenceObj);

  // 3. Animate the Digital Twin VU Meter in sync with speech
  simulateSpeechVuPulse(4500);
}

/**
 * Plays pre-rendered high-quality audio clip directly from assets/audio/
 */
function playLocalSpeech(sentenceObj) {
  const audioPath = `assets/audio/mystery_${sentenceObj.id.toLowerCase()}.wav`;

  try {
    const audio = new Audio(audioPath);
    audio.onplay = () => {
      updateVadDisplay(true, 'VAD: Active (Speech Transmitted)');
    };
    audio.onended = () => {
      updateVadDisplay(false, 'VAD: Idle');
    };
    audio.onerror = (e) => {
      console.warn('Local audio element could not play asset:', audioPath, e);
    };
    audio.play().catch(err => {
      console.warn('HTML5 Audio autoplay notice:', err);
    });
  } catch (e) {
    console.warn('Audio playback error:', e);
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
 */
function initDigitalTwinUI() {
  // Ensure default UI state reflects initial baseline
  setPipelineUI(twinState.currentPipeline);
  setFilterUI(twinState.currentFilter);
}

function setPipelineUI(pipeline) {
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
    const clamped = Math.max(4, Math.min(100, level));
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
  if (isActive) {
    badge.classList.add('active');
    badge.textContent = text || 'VAD: Voice Protected';
  } else {
    badge.classList.remove('active');
    badge.textContent = text || 'VAD: Idle';
  }
}

/**
 * Simulates VU meter pulses during speech when live telemetry is offline
 */
let vuPulseInterval = null;
function simulateSpeechVuPulse(durationMs) {
  if (vuPulseInterval) clearInterval(vuPulseInterval);
  const start = Date.now();
  updateVadDisplay(true, 'VAD: Active (Voice Detected)');

  vuPulseInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    if (elapsed > durationMs) {
      clearInterval(vuPulseInterval);
      vuPulseInterval = null;
      updateVuMeter(12);
      updateVadDisplay(false, 'VAD: Idle');
    } else {
      // Natural oscillating speech energy between 45% and 88%
      const val = 50 + Math.sin(elapsed * 0.02) * 25 + Math.random() * 15;
      updateVuMeter(val);
    }
  }, 80);
}

/**
 * 3. MQTT Client for Live Telemetry (Read-Only)
 */
function initMqttClient() {
  if (typeof Paho === 'undefined') {
    console.warn('Paho MQTT library not loaded; running in Standby mode.');
    updateConnectionStatus(false, 'Standby Mode (Broker Offline)');
    return;
  }

  const clientId = 'web_client_' + Math.random().toString(16).substr(2, 8);
  const client = new Paho.MQTT.Client(MQTT_CONFIG.host, MQTT_CONFIG.port, MQTT_CONFIG.path, clientId);

  client.onConnectionLost = (responseObject) => {
    console.warn('MQTT Connection lost:', responseObject.errorMessage);
    updateConnectionStatus(false, 'Standby (Reconnecting...)');
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
      updateConnectionStatus(false, 'MQTT Connected (Awaiting Hardware...)');
    },
    onFailure: (err) => {
      console.warn('MQTT connection failed:', err);
      updateConnectionStatus(false, 'Standby Mode (Standalone)');
    }
  };

  try {
    client.connect(connectOptions);
  } catch (err) {
    console.warn('MQTT connect error:', err);
    updateConnectionStatus(false, 'Standby Mode (Standalone)');
  }
}

/**
 * Handles incoming live telemetry JSON packets from passthrough.py
 */
function handleIncomingTelemetry(data) {
  twinState.lastTelemetryTime = Date.now();
  twinState.isHardwareConnected = true;

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

  // 2. Presenter Master Lock Status
  const playBtn = document.getElementById('playMysteryBtn');
  const playBtnText = document.getElementById('playBtnText');
  const statusBadge = document.getElementById('gameStatusBadge');
  const statusText = document.getElementById('gameStatusText');

  if (typeof data.game_enabled !== 'undefined') {
    twinState.isGameEnabled = Boolean(data.game_enabled);

    if (!twinState.isGameEnabled) {
      if (playBtn) playBtn.disabled = true;
      if (playBtnText) playBtnText.textContent = '🔒 Speaker Locked by Presenter';
      if (statusBadge) {
        statusBadge.classList.remove('playing');
        statusBadge.style.backgroundColor = '#fef2f2';
        statusBadge.style.borderColor = '#fecaca';
        statusBadge.style.color = '#b91c1c';
      }
      if (statusText) statusText.textContent = 'Demo in Progress (Speaker Locked)';
    } else if (!twinState.isCooldown) {
      if (playBtn) playBtn.disabled = false;
      if (playBtnText) playBtnText.textContent = 'Transmit to Booth Speaker';
      if (statusBadge) {
        statusBadge.style.backgroundColor = '';
        statusBadge.style.borderColor = '';
        statusBadge.style.color = '';
      }
      if (statusText) statusText.textContent = 'Booth Speaker Ready';
    }
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
      dot.className = 'status-indicator-dot simulator';
    }
  }
}

/**
 * Watchdog: Toggles status back to Standby if no telemetry arrives for 4s
 */
function startHardwareWatchdog() {
  setInterval(() => {
    if (twinState.isHardwareConnected) {
      const elapsed = Date.now() - twinState.lastTelemetryTime;
      if (elapsed > 4000) {
        twinState.isHardwareConnected = false;
        updateConnectionStatus(false, '🟡 STANDBY (Awaiting Demo Telemetry)');
      }
    }
  }, 2000);
}
