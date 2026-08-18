const form = document.getElementById("lookup-form");
const ipInput = document.getElementById("ip-input");
const lookupBtn = document.getElementById("lookup-btn");
const targetLink = document.getElementById("target-link");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const cityEl = document.getElementById("city-value");
const metaEl = document.getElementById("meta");
const sourceLink = document.getElementById("source-link");

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

function pageUrl(ip) {
  return `https://whatismyipaddress.com/ip/${encodeURIComponent(ip)}`;
}

function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function field(text, label) {
  const match = text.match(new RegExp(`(?:^|\\n)\\s*${label}:\\s*([^\\n]+)`, "i"));
  return match ? match[1].trim() : "";
}

function scrapeFromDom(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const data = {};

  for (const node of doc.querySelectorAll("th, td, dt, strong, span, p, li, div")) {
    const label = (node.textContent || "").replace(/\s+/g, " ").trim();
    const key = label.replace(/:$/, "").toLowerCase();
    if (!["city", "country", "state/region", "region", "isp"].includes(key)) continue;

    let value = "";
    const sibling = node.nextElementSibling;
    if (sibling) value = sibling.textContent.trim();
    if (!value && node.parentElement) {
      value = node.parentElement.textContent.replace(label, "").trim();
    }
    if (value) data[key] = value.replace(/^:+/, "").trim();
  }

  return data;
}

function scrapePage(content) {
  const fromText = {
    city: field(content, "City"),
    country: field(content, "Country"),
    region: field(content, "State\\/Region") || field(content, "Region"),
    isp: field(content, "ISP"),
  };

  if (!fromText.city && content.includes("<")) {
    const fromDom = scrapeFromDom(content);
    fromText.city = fromDom.city || "";
    fromText.country = fromText.country || fromDom.country || "";
    fromText.region = fromText.region || fromDom["state/region"] || fromDom.region || "";
    fromText.isp = fromText.isp || fromDom.isp || "";
  }

  if (!fromText.city) {
    const titleCity = content.match(/in\s+([^,\n]+),\s+[A-Za-z .]+/i);
    if (titleCity) fromText.city = titleCity[1].trim();
  }

  return fromText;
}

async function scrapeIp(ip) {
  const target = pageUrl(ip);

  // Direct browser fetch is blocked by CORS + Cloudflare on this site.
  // r.jina.ai is a public reader with CORS headers, so the scrape still
  // runs entirely in the frontend (no local/server backend).
  const readerUrl = `https://r.jina.ai/${target}`;
  const response = await fetch(readerUrl, { credentials: "omit" });

  if (!response.ok) {
    throw new Error(`Scrape request failed (${response.status})`);
  }

  const content = await response.text();

  if (/just a moment|cf-challenge|enable javascript and cookies/i.test(content)) {
    throw new Error("The source page returned a bot challenge instead of IP details.");
  }

  const scraped = scrapePage(content);
  if (!scraped.city) {
    throw new Error("City was not found in the scraped page.");
  }

  return { target, ...scraped };
}

function renderResult(data) {
  cityEl.textContent = data.city;
  metaEl.innerHTML = "";

  const extras = [
    ["Country", data.country],
    ["Region", data.region],
    ["ISP", data.isp],
  ];

  for (const [label, value] of extras) {
    if (!value) continue;
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    metaEl.append(dt, dd);
  }

  sourceLink.href = data.target;
  sourceLink.textContent = data.target;
  resultEl.hidden = false;
}

ipInput.addEventListener("input", () => {
  const ip = ipInput.value.trim() || "119.73.7.124";
  targetLink.href = pageUrl(ip);
  targetLink.textContent = pageUrl(ip);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ip = ipInput.value.trim();

  resultEl.hidden = true;
  if (!IPV4.test(ip)) {
    setStatus("Enter a valid IPv4 address, for example 119.73.7.124", true);
    return;
  }

  lookupBtn.disabled = true;
  setStatus(`Scraping ${pageUrl(ip)} …`);

  try {
    const data = await scrapeIp(ip);
    setStatus("");
    renderResult(data);
  } catch (error) {
    setStatus(error.message || "Could not scrape the city.", true);
  } finally {
    lookupBtn.disabled = false;
  }
});
