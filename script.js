const statusEl = document.getElementById("status");

let selectedColor = 0;

let COLORS = [];
for (let i = 0; i < 24; i++) {
	COLORS.push("FFFFFF");
}

document.getElementById("imageInput").addEventListener("change", (e) => {
	const file = e.target.files[0];
	if (!file) return;

	const img = new Image();

	img.onload = () => {
		// Center crop to square
		const size = Math.min(img.width, img.height);

		const sx = (img.width - size) / 2;
		const sy = (img.height - size) / 2;

		ctx.clearRect(0, 0, 200, 200);

		ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);

		const ledColors = calculateAmbilight();

		COLORS = ledColors.map(
			(e) => `${numberToHex(e.r)}${numberToHex(e.g)}${numberToHex(e.b)}`,
		);
		for (let i = 0; i < COLORS.length; i++) {
			const element = COLORS[i];
			setElementBG(element, i);
		}
	};

	img.src = URL.createObjectURL(file);
});

initView();

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
	generateSpace(0, 5, document.getElementById("top"), COLORS);
	generateSpace(6, 11, document.getElementById("right"), COLORS);
	generateSpace(12, 17, document.getElementById("bottom"), COLORS, true);
	generateSpace(18, 23, document.getElementById("left"), COLORS, true);
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
	document.getElementById("picker").value = "#" + COLORS[id];
	document.getElementById("c-" + id).classList.add("selectedColor");
}

// lisen to color picker changes
document.getElementById("picker").onchange = (ev) => {
	let val = document.getElementById("picker").value.replace("#", "");
	COLORS[selectedColor] = val;
	setElementBG(val, selectedColor);
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

navigator.mediaDevices
	.getUserMedia({
		video: { facingMode: "environment" },
	})
	.then((stream) => {
		video.srcObject = stream;
	});
document.getElementById("snap").onclick = () => {
	const size = Math.min(video.videoWidth, video.videoHeight);

	canvas.width = size;
	canvas.height = size;

	const ctx = canvas.getContext("2d");

	// center crop square
	const sx = (video.videoWidth - size) / 2;
	const sy = (video.videoHeight - size) / 2;

	ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
};
