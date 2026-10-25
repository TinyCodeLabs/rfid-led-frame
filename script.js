const statusEl = document.getElementById("status");

let selectedColor = 0;
let globalSaturation = 200;

let BASE_COLORS = [];  // Colors from ambilight + color picker tweaks
let COLORS = [];       // BASE_COLORS with saturation applied for display
for (let i = 0; i < LEDS_PER_SIDE * 4; i++) {
	BASE_COLORS.push("FFFFFF");
	COLORS.push("FFFFFF");
}

function applySaturationToDisplay() {
	// Apply saturation to base colors and update display
	const displayed = BASE_COLORS.map((hex) => {
		const bytes = hexToBytes(hex);
		const c = { r: bytes[0], g: bytes[1], b: bytes[2] };

		let hsl = rgbToHsl(c.r, c.g, c.b);
		let rgb = hslToRgb(hsl[0], hsl[1] * (globalSaturation / 100), hsl[2]);
		return `${numberToHex(rgb[0])}${numberToHex(rgb[1])}${numberToHex(rgb[2])}`;
	});

	COLORS = displayed;
	for (let i = 0; i < COLORS.length; i++) {
		setElementBG(COLORS[i], i);
	}
}

function renderCanvasAmbilight() {
	let ledColors = calculateAmbilight();

	BASE_COLORS = ledColors.map(
		(e) => `${numberToHex(e.r)}${numberToHex(e.g)}${numberToHex(e.b)}`,
	);

	applySaturationToDisplay();
}

initView();

// Saturation slider
document.getElementById("saturation-slider").addEventListener("input", (e) => {
	globalSaturation = parseInt(e.target.value);
	document.getElementById("saturation-value").textContent = globalSaturation;
	applySaturationToDisplay();
});

function setStatus(msg) {
	statusEl.textContent = msg;
}

function numberToHex(num) {
	return ("0" + num.toString(16)).slice(-2);
}

function randomHexBytes(count) {
	const bytes = crypto.getRandomValues(new Uint8Array(count));
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function initView() {
	// Create LED-Elements
	/* generateSpace(0, 5, document.getElementById("top"), COLORS);
	generateSpace(6, 11, document.getElementById("right"), COLORS);
	generateSpace(12, 17, document.getElementById("bottom"), COLORS, true);
	generateSpace(18, 23, document.getElementById("left"), COLORS, true); */

	generateSpace(0, LEDS_PER_SIDE - 1, document.getElementById("bottom"), COLORS, true);
	generateSpace(LEDS_PER_SIDE, 2 * LEDS_PER_SIDE - 1, document.getElementById("left"), COLORS, true);
	generateSpace(2 * LEDS_PER_SIDE, 3 * LEDS_PER_SIDE - 1, document.getElementById("top"), COLORS);
	generateSpace(3 * LEDS_PER_SIDE, 4 * LEDS_PER_SIDE - 1, document.getElementById("right"), COLORS);
}

function setElementBG(color, id) {
	document.getElementById("c-" + id).style.backgroundColor = "#" + color;
}

function generateSpace(start, end, parent, colors, reverse = false) {
	if (reverse) {
		for (let i = end; i >= start; i--) {
			const element = document.createElement("span");
			element.style.backgroundColor = "#" + colors[i];
			element.id = "c-" + i;
			element.classList.add("colorSwap");
			element.onclick = () => {
				onSelectSpot(i);
			};
			parent.appendChild(element);
		}
	} else {
		for (let i = start; i <= end; i++) {
			const element = document.createElement("span");
			element.style.backgroundColor = "#" + colors[i];
			element.classList.add("colorSwap");
			element.id = "c-" + i;
			element.onclick = () => {
				onSelectSpot(i);
			};
			parent.appendChild(element);
		}
	}
}
function onSelectSpot(id) {
	document
		.querySelectorAll(".colorSwap")
		.forEach((e) => e.classList.remove("selectedColor"));

	selectedColor = id;

	document.getElementById("c-" + id).classList.add("selectedColor");
	document.getElementById("picker").style.display = "unset";
	document.getElementById("noPicker").style.display = "none";

	let c = hexToBytes(BASE_COLORS[id]);

	setColor(c[0], c[1], c[2]);
}

// lisen to color picker changes
onPickerChange = (color) => {
	let c = color.rgbColor();

	let val = c.map((e) => numberToHex(e)).join("");
	BASE_COLORS[selectedColor] = val;
	applySaturationToDisplay();
};

function hexToBytes(hex) {
	if (typeof hex !== "string") throw new TypeError("Input must be a string");
	if (hex.length % 2 !== 0)
		throw new Error("Hex string must have an even number of characters");
	if (!/^[0-9a-fA-F]*$/.test(hex))
		throw new Error("Hex string contains invalid characters");

	const out = new Uint8Array(hex.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}
async function writeColorsToTag() {
	if (!("NDEFReader" in window)) {
		setStatus("Web NFC not supported.");
		return;
	}

	try {
		const hex = COLORS.join("");

		if (!/^[0-9a-fA-F]*$/.test(hex)) {
			throw new Error("Invalid hex string");
		}

		const bytes = hexToBytes(hex);

		setStatus("Tap NTAG215...");

		const ndef = new NDEFReader();

		await ndef.write({
			records: [
				{
					recordType: "mime",
					mediaType: "v/led",
					data: bytes,
				},
			],
		});

		setStatus(
			`Write successful.\n` + `Payload size: ${bytes.length} bytes`,
		);
	} catch (err) {
		setStatus("Write failed:\n" + err);
	}
}
document.getElementById("writeBtn").onclick = writeColorsToTag;

const video = document.getElementById("video");

const pickerContainer = document.getElementById("pickerContainer");
const captureContainer = document.getElementById("captureContainer");

function showTagWriteContainer() {
	document.getElementById("tagContainer").style.display = "flex";
}
function hiteTagWriteContainer() {
	ocument.getElementById("tagContainer").style.display = "none";
}

function resetSnaping() {
	video.style.display = "unset";
	canvas.style.display = "none";
	pickerContainer.style.display = "none";
	captureContainer.style.display = "flex";

	hiteTagWriteContainer();
}

function pictureTaken() {
	canvas.style.display = "unset";
	video.style.display = "none";
	pickerContainer.style.display = "flex";
	captureContainer.style.display = "none";

	showTagWriteContainer();
}

navigator.mediaDevices
	.getUserMedia({
		video: { facingMode: "environment" },
	})
	.then((stream) => {
		video.srcObject = stream;
	});

document.getElementById("snap").onclick = () => {
	pictureTaken();

	renderVideoToCanvas();

	renderCanvasAmbilight();
};

function renderVideoToCanvas() {
	const size = Math.min(video.videoWidth, video.videoHeight);

	canvas.width = size;
	canvas.height = size;

	const ctx = canvas.getContext("2d");

	// center crop square
	const sx = (video.videoWidth - size) / 2;
	const sy = (video.videoHeight - size) / 2;

	ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
}
