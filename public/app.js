const form = document.getElementById("lookup-form");
const ipInput = document.getElementById("ip-input");
const lookupBtn = document.getElementById("lookup-btn");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const cityEl = document.getElementById("city-value");
const metaEl = document.getElementById("meta");
const sourceNote = document.getElementById("source-note");

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function renderResult(data) {
  cityEl.textContent = data.city || "Unknown";
  metaEl.innerHTML = "";

  const extras = [
    ["IP", data.ip],
    ["Country", data.country],
    ["Region", data.region],
  ];

  for (const [label, value] of extras) {
    if (!value) continue;
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    metaEl.append(dt, dd);
  }

  const bits = ["Looked up on the server with IP2Location LITE."];
  if (data.note) bits.push(data.note);
  sourceNote.textContent = bits.join(" ");
  resultEl.hidden = false;
}

async function lookupCity(ip = "") {
  const url = ip ? `/api/geo?ip=${encodeURIComponent(ip)}` : "/api/geo";
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Lookup failed");
  }
  return data;
}

async function saveVisit(data) {
  await fetch("/api/visits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ip: data.ip,
      city: data.city,
      region: data.region,
      country: data.country,
    }),
  });
}

async function runLookup(ip, { save }) {
  resultEl.hidden = true;
  lookupBtn.disabled = true;
  setStatus(ip ? `Looking up ${ip} …` : "Detecting visitor city …");

  try {
    const data = await lookupCity(ip);
    setStatus("");
    renderResult(data);
    if (save && data.city) {
      await saveVisit(data);
    }
  } catch (error) {
    setStatus(error.message || "Could not look up the city.", true);
  } finally {
    lookupBtn.disabled = false;
  }
}

async function detectMyIp() {
  const response = await fetch("/api/ip");
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not detect IP");
  }
  if (!IPV4.test(data.ip || "")) {
    throw new Error("Backend did not return a public IPv4 address");
  }
  ipInput.value = data.ip;
  return data.ip;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ip = ipInput.value.trim();
  if (ip && !IPV4.test(ip)) {
    setStatus("Enter a valid IPv4 address, for example 119.73.7.124", true);
    return;
  }
  await runLookup(ip, { save: true });
});

(async () => {
  try {
    setStatus("Detecting your IP …");
    const ip = await detectMyIp();
    await runLookup(ip, { save: true });
  } catch (error) {
    setStatus(error.message || "Could not detect your IP.", true);
  }
})();
