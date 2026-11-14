/**
 * NTAG215 Backlight Programmer
 * Main application controller for video capture, ambilight analysis, and NFC tag programming
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const CONSTANTS = {
  LEDS_PER_SIDE: 11,
  TOTAL_LEDS: 44,
  EDGE_DEPTH: 8,           // px depth to sample from edge
  MIN_EDGE: 2,             // px narrow detection band
  GAMMA: 2.2,
  MAX_POWER: 2500,         // mA hard limit
  POWER_TARGET: 2300,      // mA threshold for brightness limiting
  POWER_PER_CHANNEL: 20,   // mA per RGB at full brightness
  CANVAS_SIZE: 400,        // 400x400px processing resolution
  NFC_MEDIA_TYPE: 'v/led',
  PAYLOAD_SIZE: 132,       // 44 LEDs × 3 bytes (RGB)
  SATURATION_DEFAULT: 200, // 200% default saturation multiplier
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  isCapturing: false,
  selectedLedIndex: null,
  ledColors: new Array(CONSTANTS.TOTAL_LEDS).fill(null).map(() => ({ h: 0, s: 0, l: 50 })),
  globalSaturation: CONSTANTS.SATURATION_DEFAULT,
  brightnessLimit: 100,
};

// ============================================================================
// DOM REFERENCES
// ============================================================================

const dom = {
  video: null,
  canvas: null,
  snap: null,
  captureContainer: null,
  pickerContainer: null,
  noPicker: null,
  picker: null,
  sample: null,
  hslH: null,
  hslS: null,
  hslL: null,
  hslHValue: null,
  hslSValue: null,
  hslLValue: null,
  rgbValues: null,
  saturationSlider: null,
  saturationValue: null,
  tagContainer: null,
  readBtn: null,
  writeBtn: null,
  status: null,
  powerStatus: null,
  ledSections: {},
};

// ============================================================================
// UTILITY FUNCTIONS - COLOR SPACE CONVERSION
// ============================================================================

/**
 * Apply gamma correction to a linear RGB value for display
 * @param {number} value - Linear RGB value (0-255)
 * @returns {number} Gamma-corrected value (0-255)
 */
function applyGammaRemoval(value) {
  return Math.pow(value / 255, 1 / CONSTANTS.GAMMA) * 255;
}

/**
 * Apply inverse gamma correction to prepare value for storage
 * @param {number} value - Display RGB value (0-255)
 * @returns {number} Gamma-compressed value (0-255)
 */
function applyGammaCompression(value) {
  return Math.pow(value / 255, CONSTANTS.GAMMA) * 255;
}

/**
 * Convert HSL to RGB color space
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {Object} {r, g, b} values (0-255)
 */
function hslToRgb(h, s, l) {
  h = h % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Convert RGB to HSL color space
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {Object} {h, s, l} values (h: 0-360, s/l: 0-100)
 */
function rgbToHsl(r, g, b) {
  r = r / 255;
  g = g / 255;
  b = b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: Math.round(l * 100) };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// ============================================================================
// AMBILIGHT ANALYSIS
// ============================================================================

/**
 * Extract average RGB values from an image region
 * @param {Uint8ClampedArray} imageData - Raw pixel data from ImageData
 * @param {number} startX - Starting x coordinate
 * @param {number} startY - Starting y coordinate
 * @param {number} width - Region width
 * @param {number} height - Region height
 * @param {number} imgWidth - Full image width (for stride calculation)
 * @returns {Object} {r, g, b} average values
 */
function averageRegionRgb(imageData, startX, startY, width, height, imgWidth) {
  let sumR = 0, sumG = 0, sumB = 0;
  let count = 0;

  for (let y = startY; y < startY + height; y++) {
    for (let x = startX; x < startX + width; x++) {
      const idx = (y * imgWidth + x) * 4;
      sumR += imageData[idx];
      sumG += imageData[idx + 1];
      sumB += imageData[idx + 2];
      count++;
    }
  }

  return {
    r: Math.round(sumR / count),
    g: Math.round(sumG / count),
    b: Math.round(sumB / count),
  };
}

/**
 * Analyze image edges to extract LED colors
 * Extracts 8px depth bands from each edge, focusing on 2px narrow detection band
 * @param {HTMLCanvasElement} canvas - Processed image canvas
 * @returns {Array} Array of 44 HSL color objects
 */
function analyzeAmbilight(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const size = canvas.width;

  const ledColors = [];

  // Helper function to sample a single LED from an edge
  // Each LED gets an equal horizontal/vertical slice of the edge
  function sampleLedFromEdge(ledIndex, edge) {
    const ledWidth = size / CONSTANTS.LEDS_PER_SIDE;
    let rgb;

    if (edge === 'bottom') {
      // Bottom edge: right-to-left (reversed), y near size-1
      const x = (CONSTANTS.LEDS_PER_SIDE - 1 - ledIndex) * ledWidth;
      rgb = averageRegionRgb(
        data,
        Math.floor(x),
        size - CONSTANTS.MIN_EDGE,
        Math.ceil(ledWidth),
        CONSTANTS.MIN_EDGE,
        size
      );
    } else if (edge === 'left') {
      // Left edge: bottom-to-top (reversed), x = 0
      const y = (CONSTANTS.LEDS_PER_SIDE - 1 - ledIndex) * ledWidth;
      rgb = averageRegionRgb(
        data,
        0,
        Math.floor(y),
        CONSTANTS.MIN_EDGE,
        Math.ceil(ledWidth),
        size
      );
    } else if (edge === 'top') {
      // Top edge: left-to-right (normal), y = 0
      const x = ledIndex * ledWidth;
      rgb = averageRegionRgb(
        data,
        Math.floor(x),
        0,
        Math.ceil(ledWidth),
        CONSTANTS.MIN_EDGE,
        size
      );
    } else if (edge === 'right') {
      // Right edge: top-to-bottom (normal), x near size-1
      const y = ledIndex * ledWidth;
      rgb = averageRegionRgb(
        data,
        size - CONSTANTS.MIN_EDGE,
        Math.floor(y),
        CONSTANTS.MIN_EDGE,
        Math.ceil(ledWidth),
        size
      );
    }

    // Apply gamma removal for display-accurate colors
    const gammaRemoved = {
      r: applyGammaRemoval(rgb.r),
      g: applyGammaRemoval(rgb.g),
      b: applyGammaRemoval(rgb.b),
    };
    return rgbToHsl(gammaRemoved.r, gammaRemoved.g, gammaRemoved.b);
  }

  // Sample all edges in order: BOTTOM, LEFT, TOP, RIGHT
  for (let i = 0; i < CONSTANTS.LEDS_PER_SIDE; i++) {
    ledColors.push(sampleLedFromEdge(i, 'bottom'));
  }
  for (let i = 0; i < CONSTANTS.LEDS_PER_SIDE; i++) {
    ledColors.push(sampleLedFromEdge(i, 'left'));
  }
  for (let i = 0; i < CONSTANTS.LEDS_PER_SIDE; i++) {
    ledColors.push(sampleLedFromEdge(i, 'top'));
  }
  for (let i = 0; i < CONSTANTS.LEDS_PER_SIDE; i++) {
    ledColors.push(sampleLedFromEdge(i, 'right'));
  }

  return ledColors;
}

// ============================================================================
// POWER MANAGEMENT & BRIGHTNESS LIMITING
// ============================================================================

/**
 * Calculate total power draw and apply brightness limiting if needed
 * @param {Array} ledColors - Array of HSL color objects
 * @param {number} saturation - Global saturation multiplier (0-500%)
 * @returns {Object} {rgbValues, powerDraw, brightnessLimit}
 */
function calculatePowerAndLimit(ledColors, saturation) {
  const rgbValues = [];
  let totalRgb = 0;

  // Convert HSL to RGB with saturation adjustment
  for (const color of ledColors) {
    const adjustedSat = Math.min(100, (color.s * saturation) / 100);
    const rgb = hslToRgb(color.h, adjustedSat, color.l);
    rgbValues.push(rgb);
    totalRgb += rgb.r + rgb.g + rgb.b;
  }

  // Calculate power draw: (20mA × total_RGB) / 255
  let powerDraw = (CONSTANTS.POWER_PER_CHANNEL * totalRgb) / 255;
  let brightnessLimit = 100;

  // Apply brightness limiting if exceeds threshold
  if (powerDraw > CONSTANTS.POWER_TARGET) {
    brightnessLimit = (CONSTANTS.POWER_TARGET / powerDraw) * 100;
    const scale = brightnessLimit / 100;

    for (const rgb of rgbValues) {
      rgb.r = Math.round(rgb.r * scale);
      rgb.g = Math.round(rgb.g * scale);
      rgb.b = Math.round(rgb.b * scale);
    }

    powerDraw = CONSTANTS.POWER_TARGET;
  }

  return { rgbValues, powerDraw, brightnessLimit };
}

// ============================================================================
// UI RENDERING
// ============================================================================

/**
 * Create and populate LED color grid with visual indicators
 * @param {Array} ledColors - Array of HSL color objects
 * @param {number} saturation - Global saturation multiplier (0-500%)
 */
function renderLedGrid(ledColors, saturation) {
  const { rgbValues, powerDraw, brightnessLimit } = calculatePowerAndLimit(ledColors, saturation);

  // Update individual LED boxes
  for (let i = 0; i < CONSTANTS.TOTAL_LEDS; i++) {
    let element = document.getElementById(`c-${i}`);
    if (!element) {
      element = document.createElement('span');
      element.id = `c-${i}`;
      element.className = 'colorSwap';
      element.addEventListener('click', () => selectLed(i));

      // Determine which section to append to
      if (i < 11) dom.ledSections.bottom.appendChild(element);
      else if (i < 22) dom.ledSections.left.appendChild(element);
      else if (i < 33) dom.ledSections.top.appendChild(element);
      else dom.ledSections.right.appendChild(element);
    }

    const rgb = rgbValues[i];
    const bgColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
    element.style.backgroundColor = bgColor;

    // Update selection indicator
    if (state.selectedLedIndex === i) {
      element.classList.add('selectedColor');
    } else {
      element.classList.remove('selectedColor');
    }
  }

  // Update power display
  const powerText = `Power: ${Math.round(powerDraw)}mA / ${CONSTANTS.MAX_POWER}mA max`;
  const brightnessText = brightnessLimit < 100 ? ` (Brightness: ${Math.round(brightnessLimit)}%)` : '';
  dom.powerStatus.textContent = powerText + brightnessText;
  state.brightnessLimit = brightnessLimit;
}

/**
 * Update color picker preview and sliders for selected LED
 */
function updateColorPicker() {
  if (state.selectedLedIndex === null) return;

  const color = state.ledColors[state.selectedLedIndex];
  dom.hslH.value = color.h;
  dom.hslS.value = color.s;
  dom.hslL.value = color.l;

  // Update value displays
  dom.hslHValue.textContent = Math.round(color.h);
  dom.hslSValue.textContent = Math.round(color.s);
  dom.hslLValue.textContent = Math.round(color.l);

  const rgb = hslToRgb(color.h, color.s, color.l);
  dom.sample.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  dom.rgbValues.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

  renderLedGrid(state.ledColors, state.globalSaturation);
}

/**
 * Select an LED and show its color picker
 * @param {number} index - LED index (0-43)
 */
function selectLed(index) {
  state.selectedLedIndex = index;
  dom.noPicker.style.display = 'none';
  dom.picker.style.display = 'block';
  updateColorPicker();
}

// ============================================================================
// VIDEO CAPTURE & PROCESSING
// ============================================================================

/**
 * Initialize video stream from device camera
 */
async function initializeCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1080 },
        height: { ideal: 1080 },
      },
    });
    dom.video.srcObject = stream;
  } catch (error) {
    dom.status.textContent = `Camera error: ${error.message}`;
  }
}

/**
 * Capture video frame to canvas and perform ambilight analysis
 */
function captureFrame() {
  const ctx = dom.canvas.getContext('2d');

  // Determine crop size (use smallest dimension)
  const size = Math.min(dom.video.videoWidth, dom.video.videoHeight);
  const startX = (dom.video.videoWidth - size) / 2;
  const startY = (dom.video.videoHeight - size) / 2;

  // Draw center-cropped square to canvas at 400x400 resolution
  ctx.drawImage(
    dom.video,
    startX,
    startY,
    size,
    size,
    0,
    0,
    CONSTANTS.CANVAS_SIZE,
    CONSTANTS.CANVAS_SIZE
  );

  // Analyze ambilight
  state.ledColors = analyzeAmbilight(dom.canvas);
  state.selectedLedIndex = null;

  // Store captured colors for reset functionality
  for (let i = 0; i < CONSTANTS.TOTAL_LEDS; i++) {
    capturedColors[i] = {
      h: state.ledColors[i].h,
      s: state.ledColors[i].s,
      l: state.ledColors[i].l,
    };
  }

  // Update UI
  dom.video.style.display = 'none';
  dom.canvas.style.display = 'block';
  dom.captureContainer.style.display = 'none';
  document.getElementById('recaptureContainer').style.display = 'block';
  dom.pickerContainer.style.display = 'block';
  dom.tagContainer.style.display = 'block';
  dom.noPicker.style.display = 'block';
  dom.picker.style.display = 'none';

  renderLedGrid(state.ledColors, state.globalSaturation);
  dom.status.textContent = 'Ready to edit and write.';
}

// ============================================================================
// NFC OPERATIONS
// ============================================================================

/**
 * Encode LED colors to NDEF payload format
 * @returns {Uint8Array} 132-byte payload
 */
function encodePayload() {
  const payload = new Uint8Array(CONSTANTS.PAYLOAD_SIZE);
  const { rgbValues } = calculatePowerAndLimit(state.ledColors, state.globalSaturation);

  for (let i = 0; i < CONSTANTS.TOTAL_LEDS; i++) {
    const rgb = rgbValues[i];
    const gammaCompressed = {
      r: Math.round(applyGammaCompression(rgb.r)),
      g: Math.round(applyGammaCompression(rgb.g)),
      b: Math.round(applyGammaCompression(rgb.b)),
    };

    payload[i * 3] = Math.max(0, Math.min(255, gammaCompressed.r));
    payload[i * 3 + 1] = Math.max(0, Math.min(255, gammaCompressed.g));
    payload[i * 3 + 2] = Math.max(0, Math.min(255, gammaCompressed.b));
  }

  return payload;
}

/**
 * Write colors to NTAG215 tag via Web NFC API
 */
async function writeNfcTag() {
  if (!('NDEFReader' in window)) {
    dom.status.textContent = 'Web NFC not supported on this device.';
    return;
  }

  try {
    dom.status.textContent = 'Tap NTAG215...';

    const payload = encodePayload();
    const ndef = new NDEFMessage({
      records: [
        {
          recordType: 'mime',
          mediaType: CONSTANTS.NFC_MEDIA_TYPE,
          data: payload,
        },
      ],
    });

    const writer = new NDEFWriter();
    await writer.write(ndef);

    dom.status.textContent = `Tag written successfully. ${CONSTANTS.PAYLOAD_SIZE} bytes written.`;
  } catch (error) {
    dom.status.textContent = `Write failed: ${error.message}`;
  }
}

/**
 * Read colors from NTAG215 tag via Web NFC API
 */
async function readNfcTag() {
  if (!('NDEFReader' in window)) {
    dom.status.textContent = 'Web NFC not supported on this device.';
    return;
  }

  try {
    dom.status.textContent = 'Tap tag to read...';

    const reader = new NDEFReader();
    await reader.scan();

    reader.onreading = (event) => {
      for (const record of event.message.records) {
        if (record.mediaType === CONSTANTS.NFC_MEDIA_TYPE) {
          const payload = new Uint8Array(record.data);

          if (payload.length !== CONSTANTS.PAYLOAD_SIZE) {
            dom.status.textContent = `Invalid payload size: got ${payload.length}, expected ${CONSTANTS.PAYLOAD_SIZE}`;
            return;
          }

          // Decode payload and apply gamma expansion
          const ledColors = [];
          for (let i = 0; i < CONSTANTS.TOTAL_LEDS; i++) {
            const r = applyGammaRemoval(payload[i * 3]);
            const g = applyGammaRemoval(payload[i * 3 + 1]);
            const b = applyGammaRemoval(payload[i * 3 + 2]);
            ledColors.push(rgbToHsl(r, g, b));
          }

          state.ledColors = ledColors;
          state.selectedLedIndex = null;
          updateColorPicker();
          dom.status.textContent = `Tag read successfully. ${CONSTANTS.PAYLOAD_SIZE} bytes loaded.`;
          return;
        }
      }

      dom.status.textContent = 'No LED data found on tag.';
    };

    reader.onerror = () => {
      dom.status.textContent = 'Tag read cancelled.';
    };
  } catch (error) {
    dom.status.textContent = `Read failed: ${error.message}`;
  }
}

// ============================================================================
// LED EDITING HELPERS
// ============================================================================

/**
 * Store the initial captured colors so we can reset to them
 */
const capturedColors = [];

/**
 * Reset selected LED to its captured color
 */
function resetLedToCapture() {
  if (state.selectedLedIndex === null) return;
  if (!capturedColors[state.selectedLedIndex]) return;

  state.ledColors[state.selectedLedIndex] = {
    h: capturedColors[state.selectedLedIndex].h,
    s: capturedColors[state.selectedLedIndex].s,
    l: capturedColors[state.selectedLedIndex].l,
  };
  updateColorPicker();
}

/**
 * Deselect the currently selected LED
 */
function deselectLed() {
  state.selectedLedIndex = null;
  dom.noPicker.style.display = 'block';
  dom.picker.style.display = 'none';
  renderLedGrid(state.ledColors, state.globalSaturation);
}

/**
 * Return to live camera capture mode
 */
function returnToCapture() {
  state.selectedLedIndex = null;
  dom.video.style.display = 'block';
  dom.canvas.style.display = 'none';
  dom.captureContainer.style.display = 'block';
  document.getElementById('recaptureContainer').style.display = 'none';
  dom.pickerContainer.style.display = 'none';
  dom.tagContainer.style.display = 'none';
  dom.status.textContent = 'Ready.';
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle hue slider changes
 */
function onHueChange(e) {
  if (state.selectedLedIndex === null) return;
  const h = parseFloat(e.target.value);
  state.ledColors[state.selectedLedIndex].h = h;
  dom.hslHValue.textContent = Math.round(h);
  updateColorPickerDisplay();
}

/**
 * Handle saturation slider changes (per-LED)
 */
function onSaturationChange(e) {
  if (state.selectedLedIndex === null) return;
  const s = parseFloat(e.target.value);
  state.ledColors[state.selectedLedIndex].s = s;
  dom.hslSValue.textContent = Math.round(s);
  updateColorPickerDisplay();
}

/**
 * Handle lightness slider changes
 */
function onLightnessChange(e) {
  if (state.selectedLedIndex === null) return;
  const l = parseFloat(e.target.value);
  state.ledColors[state.selectedLedIndex].l = l;
  dom.hslLValue.textContent = Math.round(l);
  updateColorPickerDisplay();
}

/**
 * Update color picker display (RGB and sample color) without rebuilding entire picker
 */
function updateColorPickerDisplay() {
  if (state.selectedLedIndex === null) return;

  const color = state.ledColors[state.selectedLedIndex];
  const rgb = hslToRgb(color.h, color.s, color.l);
  dom.sample.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  dom.rgbValues.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;

  renderLedGrid(state.ledColors, state.globalSaturation);
}

/**
 * Handle global saturation multiplier changes
 */
function onGlobalSaturationChange(e) {
  state.globalSaturation = parseInt(e.target.value);
  dom.saturationValue.textContent = state.globalSaturation;
  renderLedGrid(state.ledColors, state.globalSaturation);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application - set up DOM references and event listeners
 */
async function initialize() {
  // Cache DOM references
  dom.video = document.getElementById('video');
  dom.canvas = document.getElementById('canvas');
  dom.snap = document.getElementById('snap');
  dom.captureContainer = document.getElementById('captureContainer');
  dom.pickerContainer = document.getElementById('pickerContainer');
  dom.noPicker = document.getElementById('noPicker');
  dom.picker = document.getElementById('picker');
  dom.sample = document.getElementById('sample');
  dom.hslH = document.getElementById('hsl-h');
  dom.hslS = document.getElementById('hsl-s');
  dom.hslL = document.getElementById('hsl-l');
  dom.hslHValue = document.getElementById('hsl-h-value');
  dom.hslSValue = document.getElementById('hsl-s-value');
  dom.hslLValue = document.getElementById('hsl-l-value');
  dom.rgbValues = document.getElementById('rgb-values');
  dom.saturationSlider = document.getElementById('saturation-slider');
  dom.saturationValue = document.getElementById('saturation-value');
  dom.tagContainer = document.getElementById('tagContainer');
  dom.readBtn = document.getElementById('readBtn');
  dom.writeBtn = document.getElementById('writeBtn');
  dom.status = document.getElementById('status');
  dom.powerStatus = document.getElementById('power-status');

  dom.ledSections = {
    top: document.getElementById('top'),
    right: document.getElementById('right'),
    bottom: document.getElementById('bottom'),
    left: document.getElementById('left'),
  };

  const resetLedBtn = document.getElementById('resetLedBtn');
  const deselectBtn = document.getElementById('deselectBtn');
  const recaptureBtn = document.getElementById('recapture');

  // Set up event listeners
  dom.snap.addEventListener('click', captureFrame);
  dom.hslH.addEventListener('input', onHueChange);
  dom.hslS.addEventListener('input', onSaturationChange);
  dom.hslL.addEventListener('input', onLightnessChange);
  dom.saturationSlider.addEventListener('input', onGlobalSaturationChange);
  dom.readBtn.addEventListener('click', readNfcTag);
  dom.writeBtn.addEventListener('click', writeNfcTag);
  resetLedBtn.addEventListener('click', resetLedToCapture);
  deselectBtn.addEventListener('click', deselectLed);
  recaptureBtn.addEventListener('click', returnToCapture);

  // Initialize camera
  await initializeCamera();
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);
