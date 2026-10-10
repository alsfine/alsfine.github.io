/**
 * ClearVoice Visual Aid: Interactive Real-Time Dynamic Filter Sweep Slider
 * Lightweight, zero external dependencies, robust touch/mouse support.
 * Demonstrates the realistic difference between target clean speech,
 * raw noisy input, and the post-filtered enhanced output.
 */

// Sound profile parameters for each genre
const GENRE_PROFILES = {
  techno: {
    name: 'Techno / Electronic',
    bassFreq: '62.5 Hz & 125 Hz',
    bassDesc: 'Concentrates 85% of its bass energy into rigid, repeating sub-bass kick pulses that overpower delicate speech formants.',
    noiseAmp: 34,
    noiseFreq: 0.075,
    harmonicAmp: 16,
    harmonicFreq: 0.15,
    residualFloor: 0.14
  },
  rock: {
    name: 'Rock',
    bassFreq: '109.4 Hz',
    bassDesc: 'Dense, aggressive energy from kick drums, electric bass, and high guitar distortion across the lower-mid range.',
    noiseAmp: 30,
    noiseFreq: 0.12,
    harmonicAmp: 15,
    harmonicFreq: 0.24,
    residualFloor: 0.12
  },
  jazz: {
    name: 'Jazz',
    bassFreq: '78.1 Hz',
    bassDesc: 'Acoustic upright bass resonance with dynamic instrument variations and wide dynamic swings.',
    noiseAmp: 24,
    noiseFreq: 0.055,
    harmonicAmp: 12,
    harmonicFreq: 0.14,
    residualFloor: 0.10
  }
};

let currentGenre = 'techno';
let currentSplitRatio = 0.50; // Filter boundary position: 0.05 to 0.95

function initDynamicSweepSlider() {
  const stage = document.getElementById('sliderStage');
  const canvas = document.getElementById('signalCanvas');
  const handleLine = document.getElementById('sliderHandleLine');
  const handleButton = document.getElementById('sliderHandleButton');

  if (!stage || !canvas || !handleLine || !handleButton) return;

  let isDragging = false;

  function updateHandle(clientX) {
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    const ratio = x / rect.width;

    // Clamp between 0.05 and 0.95
    currentSplitRatio = Math.max(0.05, Math.min(0.95, ratio));
    const percent = (currentSplitRatio * 100).toFixed(2);

    handleLine.style.left = percent + '%';
    handleButton.style.left = percent + '%';

    renderCanvas();
  }

  // Unified Pointer Events (works for both modern touch & mouse smoothly)
  function onPointerDown(e) {
    isDragging = true;
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) {}
    updateHandle(e.clientX);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!isDragging) return;
    updateHandle(e.clientX);
    e.preventDefault();
  }

  function onPointerUp(e) {
    if (isDragging) {
      isDragging = false;
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch (err) {}
    }
  }

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);

  // Fallback direct click
  stage.addEventListener('click', (e) => {
    updateHandle(e.clientX);
  });

  // ResizeObserver for reliable, instant sizing upon layout
  function handleResize() {
    renderCanvas();
  }

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(handleResize);
    ro.observe(stage);
  } else {
    window.addEventListener('resize', handleResize);
  }

  // Initial draw
  renderCanvas();
  setTimeout(renderCanvas, 60);
  setTimeout(renderCanvas, 250);
}

function renderCanvas() {
  const stage = document.getElementById('sliderStage');
  const canvas = document.getElementById('signalCanvas');
  if (!stage || !canvas) return;

  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  const targetW = Math.round(rect.width * dpr);
  const targetH = Math.round(rect.height * dpr);

  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  const width = rect.width;
  const height = rect.height;
  const midY = height / 2;
  const splitX = width * currentSplitRatio;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  // 1. Zone Background Tints
  // Left: Enhanced Filter Zone (Subtle Teal)
  ctx.fillStyle = 'rgba(13, 148, 136, 0.07)';
  ctx.fillRect(0, 0, splitX, height);

  // Right: Raw Noisy Zone (Subtle Rose)
  ctx.fillStyle = 'rgba(244, 63, 94, 0.07)';
  ctx.fillRect(splitX, 0, width - splitX, height);

  // 2. Center Zero-Axis Guide Line
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(width, midY);
  ctx.stroke();
  ctx.setLineDash([]);

  const profile = GENRE_PROFILES[currentGenre] || GENRE_PROFILES.techno;
  const totalPoints = Math.max(10, Math.floor(width));

  const cleanY = new Float32Array(totalPoints);
  const noisyY = new Float32Array(totalPoints);
  const enhancedY = new Float32Array(totalPoints);

  // 3. Synthesize realistic waveforms:
  for (let x = 0; x < totalPoints; x++) {
    const t = x / totalPoints;

    // A. Natural Speech Vocal Envelope (3 distinct spoken words / syllables)
    const word1 = Math.exp(-Math.pow((t - 0.22) / 0.055, 2)) * 1.0;
    const word2 = Math.exp(-Math.pow((t - 0.52) / 0.075, 2)) * 0.92;
    const word3 = Math.exp(-Math.pow((t - 0.80) / 0.060, 2)) * 0.80;
    const vocalEnvelope = word1 + word2 + word3;

    // Vocal pitch formants (fundamental ~130 Hz + 2nd & 3rd harmonics)
    const voiceCarrier = Math.sin(x * 0.38) * 16.0 + Math.sin(x * 0.76) * 8.5 + Math.sin(x * 1.14) * 3.8;
    const speechSignal = vocalEnvelope * voiceCarrier;
    cleanY[x] = midY - speechSignal;

    // B. Background Music Interference (Loud rhythmic bass beats & harmonics)
    const bassBeat = Math.sin(x * profile.noiseFreq) * profile.noiseAmp;
    const bassHarmonic = Math.sin(x * profile.harmonicFreq) * profile.harmonicAmp;
    const rhythmicThump = Math.sin(x * 0.022) * 10;
    const musicInterference = bassBeat + bassHarmonic + rhythmicThump;

    noisyY[x] = midY - (speechSignal + musicInterference);

    // C. Realistic Enhanced Signal (Visibly distinct from target clean speech!):
    // 1. Voice formant is largely recovered with slight peak attenuation (~88%)
    const recoveredVoice = speechSignal * 0.88;
    // 2. Realistic residual noise floor (DSP filters never leave 100% silence)
    const residualNoise = (Math.sin(x * profile.noiseFreq * 1.4) * (profile.noiseAmp * profile.residualFloor)) +
                          (Math.sin(x * 0.22) * 2.8);
    // 3. Subtle filter transient ringing / phase texture
    const filterRipple = Math.sin(x * 0.46) * (vocalEnvelope * 2.5);

    enhancedY[x] = midY - (recoveredVoice + residualNoise + filterRipple);
  }

  // --- Layer 1: Ghost Noisy Wave on Left (Shows Noise That Was Removed) ---
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.18)';
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let x = 0; x < splitX; x++) {
    if (x === 0) ctx.moveTo(x, noisyY[x]);
    else ctx.lineTo(x, noisyY[x]);
  }
  ctx.stroke();

  // --- Layer 2: Target Clean Speech Reference (Dashed Amber Trace) ---
  // Drawn across full canvas as the ground-truth benchmark
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#d97706'; // Amber reference
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let x = 0; x < totalPoints; x++) {
    if (x === 0) ctx.moveTo(x, cleanY[x]);
    else ctx.lineTo(x, cleanY[x]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // --- Layer 3: Dynamic Active Continuous Waveform ---
  // Left of splitX = Realistically Enhanced Output (Teal)
  // Right of splitX = Raw Noisy Waveform (Rose)
  ctx.lineWidth = 2.4;

  // A) Enhanced Wave (Left side)
  ctx.strokeStyle = '#0d9488';
  ctx.beginPath();
  const splitInt = Math.min(totalPoints, Math.floor(splitX));
  for (let x = 0; x <= splitInt; x++) {
    if (x === 0) ctx.moveTo(x, enhancedY[x]);
    else ctx.lineTo(x, enhancedY[x]);
  }
  ctx.stroke();

  // B) Raw Noisy Wave (Right side)
  ctx.strokeStyle = '#f43f5e';
  ctx.beginPath();
  for (let x = splitInt; x < totalPoints; x++) {
    if (x === splitInt) ctx.moveTo(x, noisyY[x]);
    else ctx.lineTo(x, noisyY[x]);
  }
  ctx.stroke();

  // --- Layer 4: Vertical Filter Sweep Scanner Glow ---
  const grad = ctx.createLinearGradient(splitX - 10, 0, splitX + 10, 0);
  grad.addColorStop(0, 'rgba(13, 148, 136, 0)');
  grad.addColorStop(0.5, 'rgba(13, 148, 136, 0.45)');
  grad.addColorStop(1, 'rgba(13, 148, 136, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(splitX - 10, 0, 20, height);

  ctx.restore();
}

function initGenreSelector() {
  const buttons = document.querySelectorAll('.genre-tab-btn');
  const freqBadge = document.getElementById('genreFreqBadge');
  const descText = document.getElementById('genreDescText');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selected = btn.getAttribute('data-genre');
      if (!selected || !GENRE_PROFILES[selected]) return;

      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentGenre = selected;
      const info = GENRE_PROFILES[selected];

      if (freqBadge) freqBadge.textContent = info.bassFreq;
      if (descText) descText.textContent = info.bassDesc;

      renderCanvas();
    });
  });
}

// Immediate + DOM ready initialization
function initAll() {
  initDynamicSweepSlider();
  initGenreSelector();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAll);
} else {
  initAll();
}
window.addEventListener('load', renderCanvas);
