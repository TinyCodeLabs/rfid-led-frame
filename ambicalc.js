const LEDS_PER_SIDE = 6;
const EDGE_DEPTH = 15;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

function calculateAmbilight() {
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height, {
		pixelFormat: "rgba-unorm8",
	});

	const width = canvas.width;
	const height = canvas.height;

	const leds = [];

	//
	// TOP (left -> right)
	//
	for (let i = 0; i < LEDS_PER_SIDE; i++) {
		const x1 = Math.floor(i * (width / LEDS_PER_SIDE));
		const x2 = Math.floor((i + 1) * (width / LEDS_PER_SIDE) - 1);

		console.log(x1, x2);

		leds.push(averageRegion(imageData, width, x1, 0, x2, EDGE_DEPTH));
	}

	//
	// RIGHT (top -> bottom)
	//
	for (let i = 0; i < LEDS_PER_SIDE; i++) {
		const y1 = Math.floor((i * height) / LEDS_PER_SIDE);
		const y2 = Math.floor(((i + 1) * height) / LEDS_PER_SIDE) - 1;

		leds.push(
			averageRegion(
				imageData,
				width,
				width - EDGE_DEPTH,
				y1,
				width - 1,
				y2,
			),
		);
	}

	//
	// BOTTOM (right -> left)
	//
	for (let i = LEDS_PER_SIDE - 1; i >= 0; i--) {
		const x1 = Math.floor((i * width) / LEDS_PER_SIDE);
		const x2 = Math.floor(((i + 1) * width) / LEDS_PER_SIDE) - 1;

		leds.push(
			averageRegion(
				imageData,
				width,
				x1,
				height - EDGE_DEPTH,
				x2,
				height - 1,
			),
		);
	}

	//
	// LEFT (bottom -> top)
	//
	for (let i = LEDS_PER_SIDE - 1; i >= 0; i--) {
		const y1 = Math.floor((i * height) / LEDS_PER_SIDE);
		const y2 = Math.floor(((i + 1) * height) / LEDS_PER_SIDE) - 1;

		leds.push(averageRegion(imageData, width, 0, y1, EDGE_DEPTH - 1, y2));
	}

	return smoothLeds(leds);
}

function averageRegion(imageData, width, x1, y1, x2, y2) {
	const data = imageData.data;

	let r = 0;
	let g = 0;
	let b = 0;
	let count = 0;

	for (let y = y1; y <= y2; y++) {
		for (let x = x1; x <= x2; x++) {
			const idx = (y * width + x) * 4;

			r += data[idx];
			g += data[idx + 1];
			b += data[idx + 2];

			count++;
		}
	}

	let result = {
		r: Math.round(r / count),
		g: Math.round(g / count),
		b: Math.round(b / count),
	};

	return result;
}

function smoothLeds(colors) {
	const result = [];

	for (let i = 0; i < colors.length; i++) {
		const left = colors[(i - 1 + colors.length) % colors.length];

		const self = colors[i];

		const right = colors[(i + 1) % colors.length];

		result.push({
			r: Math.round(left.r * 0.25 + self.r * 0.5 + right.r * 0.25),

			g: Math.round(left.g * 0.25 + self.g * 0.5 + right.g * 0.25),

			b: Math.round(left.b * 0.25 + self.b * 0.5 + right.b * 0.25),
		});
	}

	return result;
}
