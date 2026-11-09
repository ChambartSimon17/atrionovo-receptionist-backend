import dns from "node:dns/promises";
import net from "node:net";

// ======================================================
// Website reader
// ======================================================
//
// Reads the public website of a business (the home page
// and a few pages like the menu, prices or contact) and
// turns it into plain text for the demo assistant.
//
// The address comes from Google, but is still checked:
// only http(s), only public IP addresses (also after a
// redirect), small pages, short time-outs.
// ======================================================

const MAX_PAGES = 5;
const MAX_BYTES = 600_000;
const MAX_REDIRECTS = 3;
const PAGE_CHARS = 4000;
const TOTAL_CHARS = 12000;

const USEFUL_LINK = /menu|kaart|carte|prijs|prijzen|tarie|tarif|price|behandel|soins|massage|treatment|wellness|over-ons|about|a-propos|contact|openingsuren|horaire|reserv|booking|afspraak/i;

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  const lower = address.toLowerCase();

  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80") ||
    lower.startsWith("::ffff:")
  );
}

async function assertPublic(url) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only http(s) addresses are read.");
  }

  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Only standard ports are read.");
  }

  const addresses = await dns.lookup(url.hostname, { all: true });

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Address is not public.");
  }
}

async function readBody(response) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    size += value.length;

    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }

    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function fetchPage(address) {
  let url = new URL(address);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublic(url);

    const response = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "AtrioNovo-demo/1.0 (+https://atrionovo.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(6000),
    });

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = new URL(response.headers.get("location"), url);
      continue;
    }

    if (!response.ok || !String(response.headers.get("content-type")).includes("text/html")) {
      throw new Error(`Page not readable (${response.status}).`);
    }

    return { url, html: await readBody(response) };
  }

  throw new Error("Too many redirects.");
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü" };

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function pageText(html) {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const description = decode(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? ""
  ).trim();

  const body = decode(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|p|div|li|h[1-6]|tr|section|article|header|footer)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\r\f]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return { title, text: [description, body].filter(Boolean).join("\n").slice(0, PAGE_CHARS) };
}

function usefulLinks(html, base) {
  const links = new Map();

  for (const [, href, label] of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;

    try {
      url = new URL(decode(href), base);
    } catch {
      continue;
    }

    const text = label.replace(/<[^>]+>/g, " ");

    if (
      url.hostname === base.hostname &&
      url.pathname !== base.pathname &&
      !/\.(pdf|jpe?g|png|gif|webp|zip)$/i.test(url.pathname) &&
      (USEFUL_LINK.test(url.pathname) || USEFUL_LINK.test(text))
    ) {
      url.hash = "";
      links.set(url.href, url.href);
    }
  }

  return [...links.values()].slice(0, MAX_PAGES - 1);
}

/**
 * Reads a business website. Never throws: a site that
 * cannot be read gives no pages.
 *
 * @returns {{ pages: { url: string, title: string }[], text: string }}
 */
export async function readWebsite(address) {
  if (!address) {
    return { pages: [], text: "" };
  }

  let home;

  try {
    home = await fetchPage(address);
  } catch {
    return { pages: [], text: "" };
  }

  const others = await Promise.all(
    usefulLinks(home.html, home.url).map((link) => fetchPage(link).catch(() => null))
  );

  const pages = [home, ...others.filter(Boolean)].map(({ url, html }) => ({
    url: url.href,
    ...pageText(html),
  }));

  let text = "";

  for (const page of pages) {
    const part = `## ${page.title || page.url}\n${page.text}\n\n`;

    if (text.length + part.length > TOTAL_CHARS) {
      text += part.slice(0, Math.max(0, TOTAL_CHARS - text.length));
      break;
    }

    text += part;
  }

  return {
    pages: pages.map(({ url, title }) => ({ url, title })),
    text: text.trim(),
  };
}
