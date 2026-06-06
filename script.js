const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg;
}

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
