/**
 * ClearVoice Visual Aid: Interactive Before & After Signal Comparison Slider
 * Touch-friendly, procedural oscilloscope simulation for Open Day booth
 */

document.addEventListener('DOMContentLoaded', () => {
  initComparisonSlider();
  initGenreSelector();
});

// Genre sound profile characteristics
const GENRE_PROFILES = {
  techno: {
    name: 'Techno / Electronic',
    bassFreq: '62.5 Hz & 125 Hz',
    bassDesc: 'Concentrates 85% of its bass energy into rigid, repeating sub-bass kick pulses.',
    noiseAmp: 34,
    noiseFreq: 0.09,
    harmonicAmp: 18,
    harmonicFreq: 0.18
  },
  rock: {
    name: 'Rock',
    bassFreq: '109.4 Hz',
    bassDesc: 'Punches hard around 109 Hz from electric bass and kick drums, with higher-frequency guitar distortion.',
    noiseAmp: 28,
    noiseFreq: 0.14,
    harmonicAmp: 12,
    harmonicFreq: 0.28
  },
  jazz: {
    name: 'Jazz',
    bassFreq: '78.1 Hz',
    bassDesc: 'Features warm, dynamic acoustic upright bass blooms with acoustic instruments spread across frequencies.',
    noiseAmp: 22,
    noiseFreq: 0.07,
    harmonicAmp: 10,
    harmonicFreq: 0.16
  }
};

let currentGenre = 'techno';

function initComparisonSlider() {
  const stage = document.getElementById('sliderStage');
  const afterLayer = document.getElementById('sliderAfterLayer');
  const handleLine = document.getElementById('sliderHandleLine');
  const handleButton = document.getElementById('sliderHandleButton');

  if (!stage || !afterLayer || !handleLine || !handleButton) return;

  let isDragging = false;

  function updateSliderPosition(clientX) {
    const rect = stage.getBoundingClientRect();
    let x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    
    // Clamp between 5% and 95%
    percentage = Math.max(5, Math.min(95, percentage));

    afterLayer.style.width = `${percentage}%`;
    handleLine.style.left = `${percentage}%`;
    handleButton.style.left = `${percentage}%`;
  }

  // Mouse Events
  handleButton.addEventListener('mousedown', (e) => {
    isDragging = true;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updateSliderPosition(e.clientX);
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Touch Events (Mobile First)
  handleButton.addEventListener('touchstart', (e) => {
    isDragging = true;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDragging || !e.touches[0]) return;
    updateSliderPosition(e.touches[0].clientX);
  }, { passive: true });

  window.addEventListener('touchend', () => {
    isDragging = false;
  });

  // Allow clicking anywhere on stage to jump slider
  stage.addEventListener('click', (e) => {
    updateSliderPosition(e.clientX);
  });

  // Setup Procedural Canvases
  setupSignalCanvases();
}

function setupSignalCanvases() {
  const canvasBefore = document.getElementById('canvasBefore');
  const canvasAfter = document.getElementById('canvasAfter');

  if (!canvasBefore || !canvasAfter) return;

  function resizeAndDraw() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasBefore.getBoundingClientRect();

    [canvasBefore, canvasAfter].forEach(canvas => {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
    });

    drawSignal(canvasBefore, true);
    drawSignal(canvasAfter, false);
  }

  window.addEventListener('resize', resizeAndDraw);
  resizeAndDraw();
}

/**
 * Draws procedural speech & music waveforms
 * isNoisy = true: Speech buried in massive low-frequency music interference
 * isNoisy = false: Cleaned voice peaks with background music bass suppressed
 */
function drawSignal(canvas, isNoisy) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width / (window.devicePixelRatio || 1);
  const height = canvas.height / (window.devicePixelRatio || 1);
  const midY = height / 2;

  ctx.clearRect(0, 0, width, height);

  // Background grid lines (subtle oscilloscope feel)
  ctx.strokeStyle = isNoisy ? 'rgba(244, 63, 94, 0.12)' : 'rgba(20, 184, 166, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(width, midY);
  ctx.stroke();

  // Waveform styling
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = isNoisy ? '#f43f5e' : '#0d9488'; // Rose for noisy, Teal for enhanced
  ctx.beginPath();

  const profile = GENRE_PROFILES[currentGenre];

  for (let x = 0; x < width; x++) {
    // 1. Spoken Word Formant Wave (Human Voice Envelope)
    // Syllable packet bursts around 20%-40% and 60%-80% across the width
    const syllable1 = Math.exp(-Math.pow((x - width * 0.3) / (width * 0.1), 2));
    const syllable2 = Math.exp(-Math.pow((x - width * 0.7) / (width * 0.12), 2));
    const speechEnvelope = (syllable1 * 1.0 + syllable2 * 0.85);
    
    // Voice fundamental and harmonics (~150 Hz to 1 kHz simulation)
    const voiceCarrier = Math.sin(x * 0.35) * 16 + Math.sin(x * 0.72) * 8;
    const speechSignal = speechEnvelope * voiceCarrier;

    // 2. Music Noise Component
    let musicNoise = 0;
    if (isNoisy) {
      // Massive sub-bass kick swell + harmonics
      const bassSwell = Math.sin(x * profile.noiseFreq) * profile.noiseAmp;
      const harmonicSwell = Math.sin(x * profile.harmonicFreq) * profile.harmonicAmp;
      const beatThump = Math.sin(x * 0.03) * 10;
      musicNoise = bassSwell + harmonicSwell + beatThump;
    } else {
      // Cleaned signal: music noise flattened down to ~5-10% residual
      const residualBass = Math.sin(x * profile.noiseFreq) * (profile.noiseAmp * 0.08);
      musicNoise = residualBass;
    }

    const y = midY + speechSignal + musicNoise;

    if (x === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
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

      // Redraw canvases with the new genre profile
      const canvasBefore = document.getElementById('canvasBefore');
      const canvasAfter = document.getElementById('canvasAfter');
      if (canvasBefore) drawSignal(canvasBefore, true);
      if (canvasAfter) drawSignal(canvasAfter, false);
    });
  });
}
