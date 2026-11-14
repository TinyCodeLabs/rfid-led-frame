# NTAG215 Backlight Programmer - Product Specification

## Overview

This application programs RFID tags (NTAG215) with dynamic ambilight color data for LED strips. It captures video from a mobile device camera, analyzes the edges of the image to extract dominant colors, applies intelligent brightness limiting, and writes the color data to an NFC tag that can be read by a compatible LED controller (which interpolates and displays the colors on an LED strip).

## Core Functionality

### 1. Video Capture & Image Processing
- **Live camera feed**: Displays real-time video from device rear-facing camera in a square viewport
- **Capture mechanism**: Single-tap snapshot to freeze the current video frame
- **Canvas processing**: Converts video frame to square (uses shortest dimension) with center crop, processes at 400×400px resolution
- **Hidden processing**: Canvas element remains hidden from user during processing

### 2. Ambilight Edge Analysis
The system analyzes image edges to determine optimal LED colors:

- **Sampling approach**: 
  - Extracts 8px depth bands from each edge of the image
  - Uses a 2px narrow detection band to focus on edge colors
  - Averages raw pixel values within each region (no gamma in averaging)

- **LED layout** (44 programmable LEDs):
  - **BOTTOM**: 11 LEDs spanning bottom edge, scanned right-to-left (reversed order)
  - **LEFT**: 11 LEDs spanning left edge, scanned bottom-to-top (reversed order)
  - **TOP**: 11 LEDs spanning top edge, scanned left-to-right (normal order)
  - **RIGHT**: 11 LEDs spanning right edge, scanned top-to-bottom (normal order)

- **Data organization**: 
  - Total 44 LED colors extracted per image
  - Each color stored as RGB (3 bytes)
  - Total payload: 132 bytes (44 LEDs × 3 bytes)

### 3. Color Adjustment Interface

**Color Picker** (visible after capture):
- **Hue slider**: 0-360° for color selection
- **Saturation slider**: 0-100% for color intensity
- **Lightness slider**: 0-100% for brightness

**Per-LED editing**:
- Click any LED in the visual grid to select it
- Adjust HSL sliders to modify selected LED color
- Color changes apply immediately to that LED

**Global Saturation Control**:
- Separate saturation multiplier (0-500%) applied to all LEDs simultaneously
- Allows boosting color intensity across entire ambilight without re-adjusting individual colors
- Default: 200% (double saturation for more vibrant output)

### 4. Brightness Limiting (Critical)

**Power budget**: 2.5A total maximum
- 88 total LEDs (44 controlled + 44 interpolated by reader)
- Each RGB color channel at full brightness (255) = 20mA

**Calculation**:
- Sum all R+G+B values across all 44 LEDs
- Power draw = (20mA × total_RGB) / 255
- If exceeds 2300mA threshold, scale all RGB values proportionally
- 2300mA target ensures actual draw stays below 2500mA limit (accounts for ~8% system overhead)

**Display**:
- Real-time power draw displayed: "Power: XXmA / 2500mA max"
- If brightness is limited: "(Brightness: XX%)" shows reduction percentage
- Brightness limiting applies uniformly across all LEDs

### 5. Color Space & Gamma Correction

**Gamma value**: 2.2 (perceptually accurate color display)

**Processing pipeline**:
1. Capture raw pixel values from image (linear RGB)
2. For display: Apply gamma removal (`value^(1/2.2)`) for perceptually correct brightness
3. For storage: Apply gamma compression (`value^2.2`) to store perceptually uniform values
4. On tag read: Apply gamma expansion to recover original editing values

**Why**: Ensures ambilight colors appear natural on human-perceived brightness, not linear values

### 6. NFC Tag Operations

**Technology**: NTAG215 via Web NFC API

**Write operation**:
- Format: MIME record with mediaType "v/led"
- Payload: 132 bytes (44 LEDs × 3 bytes RGB)
- Data order: Colors in LED order (bottom to left to top to right)
- Gamma pre-compression: All RGB values compressed before writing
- Status: Shows success/failure and payload size

**Read operation**:
- Scans for NDEF record with mediaType "v/led"
- Validates payload size (must be exactly 132 bytes)
- Decodes RGB values with gamma expansion
- Repopulates color picker with read values
- Updates LED visualization

**Error handling**:
- Web NFC not supported: Display error message
- Invalid payload size: Display expected vs. actual byte count
- Missing LED data: Notify user tag doesn't contain ambilight data

## HTML Component Structure

### Layout Grid (`#led_grid`)
CSS Grid layout with 3×3 sections:
```
[empty]  [#top]   [empty]
[#left]  [#image] [#right]
[empty]  [#bottom] [empty]
```
- Central image area: Video during live view, Canvas during processing
- Surrounding strips: LED color indicators for each edge

### Main Components

#### 1. Video/Canvas Section
- **`#video`**: Live camera feed (visible during capture mode)
  - autoplay enabled
  - environment-facing camera
  - 1:1 aspect ratio
  - Centered crop
  
- **`#canvas`**: Processed image (hidden during capture, visible after)
  - 400×400px processing resolution
  - Contains ImageData for ambilight analysis

#### 2. LED Display Grid Sections
- **`#top`**: Horizontal strip, 11 LED boxes, left-to-right flow
- **`#right`**: Vertical strip, 11 LED boxes, top-to-bottom flow
- **`#bottom`**: Horizontal strip, 11 LED boxes, right-to-left flow (reversed CSS)
- **`#left`**: Vertical strip, 11 LED boxes, bottom-to-top flow (reversed CSS)

**LED box structure**:
- Element type: `<span>` with class `colorSwap`
- ID format: `c-{0..43}` (LED index 0-43)
- Background color: Updated in real-time as colors change
- Click handler: Selects LED for color picker editing
- Selection indicator: `selectedColor` class adds black border

#### 3. Control Sections

**Capture Container** (`#captureContainer`):
- Visible: During live camera view
- Contains: `#snap` button (captures frame)
- Hidden: After capture

**Color Picker Container** (`#pickerContainer`):
- Visible: After capture
- Contains:
  - `#noPicker` message (shown before LED selection)
  - `#picker` section (shown after LED selection)
    - `#sample` div: Color preview of selected LED
    - `#hsl-h` slider: Hue control
    - `#hsl-s` slider: Saturation control
    - `#hsl-l` slider: Lightness control
  - Global saturation section:
    - `#saturation-slider`: Multiplier for all LEDs (0-500%)
    - `#saturation-value`: Display current saturation %

**NFC Tag Container** (`#tagContainer`):
- Visible: After capture or tag read
- Contains:
  - `#readBtn`: Read colors from NFC tag
  - `#writeBtn`: Write colors to NFC tag
  - `#status`: Operation status/error messages
  - `#power-status`: Current power draw display

### Button Elements

- **`#snap`**: Capture video frame to canvas
  - Text: "Capture"
  - Action: Freezes video, processes ambilight, shows color picker
  
- **`#readBtn`**: Scan and read NFC tag
  - Text: "Read Tag"
  - Action: Prompts user to tap tag, loads colors from tag
  
- **`#writeBtn`**: Write colors to NFC tag
  - Text: "Write Tag"
  - Action: Prompts user to tap tag, writes current colors

### Status Display Elements

- **`#status`**: 
  - Initial: "Ready."
  - During operations: "Tap NTAG215...", "Tap tag to read..."
  - After operations: Success message with bytes written, or error details
  
- **`#power-status`**: 
  - Format: "Power: XXmA / 2500mA max"
  - Suffix: " (Brightness: XX%)" when limited
  - Updates in real-time as colors change

## Data Flow

1. **User captures image**
   - Video frame → Canvas (center-cropped square)
   - Canvas → ambilight analysis

2. **Ambilight analysis**
   - Extract edge pixel regions
   - Average RGB per LED position
   - Return 44 colors (raw RGB)

3. **Color display**
   - Apply gamma removal for perceptual accuracy
   - Apply global saturation multiplier
   - Apply brightness limiting (scale all RGB if needed)
   - Display colors in LED grid
   - Show power draw

4. **User adjusts colors**
   - Click LED → open color picker
   - Adjust HSL sliders → updates selected LED
   - Adjust global saturation → updates all LEDs

5. **Write to tag**
   - Convert all colors: HSL → RGB
   - Apply saturation adjustment
   - Apply gamma compression
   - Apply brightness limiting
   - Encode as 132-byte payload
   - Write to NTAG215 via Web NFC

6. **Read from tag**
   - Read 132-byte payload from tag
   - Apply gamma expansion to each RGB
   - Convert to HSL for editing
   - Display in color picker
   - Show in LED grid

## CSS Classes

- **`.colorSwap`**: Individual LED box
  - Clickable
  - Background color reflects current LED color
  
- **`.selectedColor`**: Applied when LED is selected
  - Black border (3px) for visual feedback

## Storage Format (NTAG215)

**NDEF Message Structure**:
- Record Type: MIME
- Media Type: `v/led`
- Payload: 132 bytes

**Payload format**:
- Byte layout: RGB bytes in LED order
  - Bytes 0-2: LED 0 (Bottom-0) → R, G, B
  - Bytes 3-5: LED 1 (Bottom-1) → R, G, B
  - ...
  - Bytes 129-131: LED 43 (Right-10) → R, G, B
- Each byte: 0-255 (gamma-compressed value)
- Order matches ambilight calculation order:
  1. Bottom edge (right to left): LEDs 0-10
  2. Left edge (bottom to top): LEDs 11-21
  3. Top edge (left to right): LEDs 22-32
  4. Right edge (top to bottom): LEDs 33-43

## Constants & Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `LEDS_PER_SIDE` | 11 | LEDs per edge |
| `EDGE_DEPTH` | 8px | How deep to sample from image edge |
| `MIN_EDGE` | 2px | Narrow detection band at image edge |
| `GAMMA` | 2.2 | Perceptual gamma correction factor |
| Max Power | 2500mA | Hard limit for LED power budget |
| Power Target | 2300mA | Threshold before brightness limiting |
| Per-channel power | 20mA | Power per RGB at full brightness (255) |
| Canvas resolution | 400×400px | Processing resolution |
| Global saturation range | 0-500% | Multiplier range (default 200%) |

## User States/Views

1. **Live View**: Video streaming, "Capture" button visible
2. **Processing**: Brief state while analyzing edges
3. **Editing**: Canvas visible, LED grid shown, color picker ready
4. **Tag Mode**: Color picker active, Read/Write buttons visible

## Future Reader Implementation Note

The tag reader will:
- Read 132-byte payload from NTAG215
- Interpolate 44 stored colors to create 88 total (44 per LED, 44 interpolated)
- Apply gamma expansion if needed
- Drive LED strip at specified brightness
- Respect power budget

**No separate interpolation configuration needed** - the reader handles all interpolation automatically.
