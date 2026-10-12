/**
 * ClearVoice Digital Twin & Mystery Speech Game Controller
 * Connects static GitHub Pages site to live Python hardware telemetry via MQTT over WSS.
 * Includes interactive fallback simulator and Web Speech API synthesis.
 */

// Mystery sentence library (Hidden from direct view until revealed by user)
const MYSTERY_SENTENCES = {
  A: {
    id: 'A',
    label: 'Sentence A',
    text: 'We love the digital smart lab',
    category: 'Wits Lab'
  },
  B: {
    id: 'B',
    label: 'Sentence B',
    text: 'Vote for us for best poster',
    category: 'Open Day'
  },
  C: {
    id: 'C',
    label: 'Sentence C',
    text: 'JP Morgan is the best attacking trio in the world',
    category: 'Campus Fun'
  },
  D: {
    id: 'D',
    label: 'Sentence D',
    text: 'Electrical engineering is the hardest degree at Wits',
    category: 'Engineering Pride'
  },
  E: {
    id: 'E',
    label: 'Sentence E',
    text: 'Can you hear my voice through all this loud music?',
    category: 'Acoustic Challenge'
  },
  F: {
    id: 'F',
    label: 'Sentence F',
    text: 'Ryan and Raphael built the ultimate speech filter',
    category: 'Student Authors'
  }
};

// MQTT Configuration (Free, public, no-auth broker over secure WebSocket)
const MQTT_CONFIG = {
  host: 'broker.hivemq.com',
  port: 8884,
  path: '/mqtt',
  topicTelemetry: 'wits/clearvoice/telemetry',
  topicTts: 'wits/clearvoice/tts'
};

// Digital Twin State
const twinState = {
  isHardwareConnected: false,
  lastTelemetryTime: 0,
  currentPipeline: 'OPTIMAL',
  currentFilter: 'TECHNO',
  audioLevel: 15,
  isAudioPresent: false,
  isVadActive: false,
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
});

/**
 * 1. Mystery Sentence Game Initialization
 */
function initMysteryGame() {
  const select = document.getElementById('mysterySentenceSelect');
  const playBtn = document.getElementById('playMysteryBtn');
  const toggleRevealBtn = document.getElementById('toggleRevealBtn');
  const revealedContent = document.getElementById('revealedContent');
  const revealedBadge = document.getElementById('revealedBadge');
  const revealedText = document.getElementById('revealedText');

  if (!select || !playBtn) return;

  // Populate options
  select.innerHTML = '';
  Object.keys(MYSTERY_SENTENCES).forEach(key => {
    const s = MYSTERY_SENTENCES[key];
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = `Mystery ${s.label} (${s.category})`;
    select.appendChild(opt);
  });

  // Play button click
  playBtn.addEventListener('click', () => {
    if (twinState.isCooldown) return;
    const selectedKey = select.value;
    const sentenceObj = MYSTERY_SENTENCES[selectedKey];
    if (!sentenceObj) return;

    triggerSentencePlayback(sentenceObj);
  });

  // Reveal Answer toggle
  if (toggleRevealBtn && revealedContent) {
    toggleRevealBtn.addEventListener('click', () => {
      const isVisible = revealedContent.style.display === 'block';
      if (isVisible) {
        revealedContent.style.display = 'none';
        toggleRevealBtn.textContent = 'Reveal Current Sentence';
      } else {
        const selectedKey = select.value;
        const sentenceObj = MYSTERY_SENTENCES[selectedKey];
        if (revealedBadge) revealedBadge.textContent = sentenceObj.label;
        if (revealedText) revealedText.textContent = `"${sentenceObj.text}"`;
        revealedContent.style.display = 'block';
        toggleRevealBtn.textContent = 'Hide Answer';
      }
    });

    // Update revealed text when dropdown changes
    select.addEventListener('change', () => {
      if (revealedContent.style.display === 'block') {
        const selectedKey = select.value;
        const sentenceObj = MYSTERY_SENTENCES[selectedKey];
        if (revealedBadge) revealedBadge.textContent = sentenceObj.label;
        if (revealedText) revealedText.textContent = `"${sentenceObj.text}"`;
      }
    });
  }
}

/**
 * Triggers sentence playback with cooldown & sends MQTT packet
 */
function triggerSentencePlayback(sentenceObj) {
  startCooldown(6);

  // 1. Transmit command via MQTT if connected
  if (twinState.mqttClient && twinState.mqttClient.isConnected()) {
    try {
      const payload = JSON.stringify({
        cmd: 'PLAY_TTS',
        sentence_id: sentenceObj.id,
        text: sentenceObj.text,
        timestamp: Date.now()
      });
      const message = new Paho.MQTT.Message(payload);
      message.destinationName = MQTT_CONFIG.topicTts;
      twinState.mqttClient.send(message);
    } catch (e) {
      console.warn('MQTT send failed, falling back to local TTS:', e);
    }
  }

  // 2. Local browser audio playback (Pre-rendered WAV with Web Speech fallback)
  playLocalSpeech(sentenceObj);

  // 3. Animate the Digital Twin VU Meter in sync with speech
  simulateSpeechVuPulse(4500);
}

/**
 * Plays pre-rendered high-quality audio clip (with Web Speech API fallback)
 */
function playLocalSpeech(sentenceObj) {
  const audioPath = `assets/audio/mystery_${sentenceObj.id.toLowerCase()}.wav`;
  let played = false;

  try {
    const audio = new Audio(audioPath);
    audio.onplay = () => {
      played = true;
      updateVadDisplay(true, 'VAD: Active (Voice Detected)');
    };
    audio.onended = () => {
      updateVadDisplay(false, 'VAD: Idle');
    };
    audio.onerror = () => {
      // Fallback to Web Speech API if audio element cannot load
      fallbackWebSpeech(sentenceObj.text);
    };
    audio.play().catch(err => {
      console.warn('HTML5 Audio autoplay prevented, falling back to Web Speech:', err);
      fallbackWebSpeech(sentenceObj.text);
    });
  } catch (e) {
    fallbackWebSpeech(sentenceObj.text);
  }
}

function fallbackWebSpeech(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onstart = () => updateVadDisplay(true, 'VAD: Active (Voice Detected)');
    utterance.onend = () => updateVadDisplay(false, 'VAD: Idle');
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Web Speech error:', err);
  }
}

/**
 * 6-Second Anti-Spam Cooldown Timer
 */
function startCooldown(seconds) {
  twinState.isCooldown = true;
  twinState.cooldownRemaining = seconds;

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

  const total = seconds;
  const interval = setInterval(() => {
    twinState.cooldownRemaining -= 0.1;
    if (twinState.cooldownRemaining <= 0) {
      clearInterval(interval);
      twinState.isCooldown = false;
      if (playBtn) playBtn.disabled = false;
      if (playBtnText) playBtnText.textContent = 'Transmit to Booth Speaker';
      if (cooldownBox) cooldownBox.style.display = 'none';
      if (statusBadge) statusBadge.classList.remove('playing');
      if (statusText) statusText.textContent = 'Booth Speaker Ready';
    } else {
      const pct = (twinState.cooldownRemaining / total) * 100;
      if (cooldownFill) cooldownFill.style.width = pct + '%';
      if (cooldownSec) cooldownSec.textContent = Math.ceil(twinState.cooldownRemaining) + 's';
      if (playBtnText) playBtnText.textContent = `Please wait (${Math.ceil(twinState.cooldownRemaining)}s)`;
    }
  }, 100);
}

/**
 * 2. Digital Twin UI & Interactive Simulator Controls
 */
function initDigitalTwinUI() {
  const pipelinePills = document.querySelectorAll('#pipelineGroup .twin-pill');
  const filterPills = document.querySelectorAll('#filterGroup .twin-pill');

  // Allow clicking to change states in simulator mode
  pipelinePills.forEach(pill => {
    pill.addEventListener('click', () => {
      const p = pill.getAttribute('data-pipeline');
      if (p) {
        setPipelineUI(p);
        // If connected, user could send command to ESP32
        if (twinState.mqttClient && twinState.mqttClient.isConnected()) {
          sendMqttCommand('SET_PIPELINE', p);
        }
      }
    });
  });

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const f = pill.getAttribute('data-filter');
      if (f) {
        setFilterUI(f);
        if (twinState.mqttClient && twinState.mqttClient.isConnected()) {
          sendMqttCommand('SET_FILTER', f);
        }
      }
    });
  });
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
 * 3. MQTT Client for Live Telemetry & Control
 */
function initMqttClient() {
  if (typeof Paho === 'undefined') {
    console.warn('Paho MQTT library not loaded; staying in Simulator mode.');
    updateConnectionStatus(false, 'Simulator Mode (Offline)');
    return;
  }

  const clientId = 'web_client_' + Math.random().toString(16).substr(2, 8);
  const client = new Paho.MQTT.Client(MQTT_CONFIG.host, MQTT_CONFIG.port, MQTT_CONFIG.path, clientId);

  client.onConnectionLost = (responseObject) => {
    console.warn('MQTT Connection lost:', responseObject.errorMessage);
    updateConnectionStatus(false, 'Simulator Mode (Reconnecting...)');
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
      console.log('Connected to MQTT broker via WSS successfully');
      twinState.mqttClient = client;
      client.subscribe(MQTT_CONFIG.topicTelemetry);
      updateConnectionStatus(false, 'MQTT Connected (Awaiting Hardware...)');
    },
    onFailure: (err) => {
      console.warn('MQTT connection failed:', err);
      updateConnectionStatus(false, 'Simulator Mode (Standalone)');
    }
  };

  try {
    client.connect(connectOptions);
  } catch (err) {
    console.warn('MQTT connect error:', err);
    updateConnectionStatus(false, 'Simulator Mode (Standalone)');
  }
}

/**
 * Handles live telemetry JSON packets from passthrough.py
 */
function handleIncomingTelemetry(data) {
  twinState.lastTelemetryTime = Date.now();
  twinState.isHardwareConnected = true;

  updateConnectionStatus(true, '🟢 LIVE HARDWARE (ESP32-S3 Live)');

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
}

function sendMqttCommand(type, value) {
  if (!twinState.mqttClient || !twinState.mqttClient.isConnected()) return;
  try {
    const payload = JSON.stringify({ type, value, timestamp: Date.now() });
    const msg = new Paho.MQTT.Message(payload);
    msg.destinationName = 'wits/clearvoice/control';
    twinState.mqttClient.send(msg);
  } catch (e) {
    console.warn('Failed to send control command:', e);
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
 * Watchdog: Automatically toggles back to Simulator Mode if no telemetry arrives for 4s
 */
function startHardwareWatchdog() {
  setInterval(() => {
    if (twinState.isHardwareConnected) {
      const elapsed = Date.now() - twinState.lastTelemetryTime;
      if (elapsed > 4000) {
        twinState.isHardwareConnected = false;
        updateConnectionStatus(false, '🟡 INTERACTIVE SIMULATOR (STANDALONE)');
      }
    }
  }, 2000);
}
