import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import Fastify from "fastify";
import cors from "@fastify/cors";
import dotenv from "dotenv";
dotenv.config();

const fastify = Fastify({ logger: true });

const CACHE_DIR = "./cache";

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// -----------------------------------------------
// UTIL: Load cache if exists and not expired
// -----------------------------------------------
function loadCache(cacheKey) {
  const file = path.join(CACHE_DIR, cacheKey + ".json");
  if (!fs.existsSync(file)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const now = Date.now();
    if (now > data.expiry) {
      fs.unlinkSync(file);
      return null;
    }
    return data.payload;
  } catch {
    return null;
  }
}

// -----------------------------------------------
// UTIL: Save cache with TTL (ms)
// -----------------------------------------------
function saveCache(cacheKey, payload, ttlMs) {
  const file = path.join(CACHE_DIR, cacheKey + ".json");
  const wrapper = {
    expiry: Date.now() + ttlMs,
    payload,
  };
  fs.writeFileSync(file, JSON.stringify(wrapper, null, 2));
}

// ---- CORS ----
fastify.register(cors, {
  origin: "*",
  methods: ["GET"],
  allowedHeaders: ["x-api-key"],
});

// ---- API KEY MIDDLEWARE ----
fastify.addHook("preHandler", async (req, reply) => {
  const key = req.headers["x-api-key"];
  if (!key || key !== process.env.API_KEY) {
    reply.code(401);
    return { error: "Unauthorised" };
  }
});

// ---- ROUTE ----
fastify.get("/scrape", async (req, reply) => {
  const albumUrl = req.query.url;
  if (!albumUrl) {
    reply.code(400);
    return { error: "Missing ?url=" };
  }

  const cacheKey = Buffer.from(albumUrl).toString("base64");

  // 1. CACHE CHECK
  const cached = loadCache(cacheKey);
  if (cached) {
    console.log("CACHE HIT");
    return reply.send(cached);
  }
  console.log("CACHE MISS");

  // 2. FETCH ALBUM HTML
  const albumHtml = await fetch(albumUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());

  console.log("Album HTML length:", albumHtml.length);

  // 1. extract script blocks
  const scriptBlocks = albumHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
  if (!scriptBlocks) console.log("No script blocks found");

  let metaScript = null;
  for (const block of scriptBlocks) {
    if (block.includes("data:[null,[[")) {
      metaScript = block;
      break;
    }
  }

  if (!metaScript) console.log("No metadata script found");
  console.log("Found metadata script");

  const arrayStart = metaScript.indexOf("[[");
  const arrayEnd = metaScript.indexOf("]]}]]") + 5;
  const arrayText = metaScript.substring(arrayStart, arrayEnd);

  let parsed;
  try {
    parsed = JSON.parse(arrayText);
  } catch (err) {
    console.log("JSON parse failed:", err);
    console.log(arrayText.slice(0, 1000));
    return reply.send({ error: "Parse failed" });
  }

  const firstItems = parsed.map((item) => `${item[0]}`);

  const albumIdMatch = albumUrl.match(/share\/([^\/?]+)/);
  const albumKeyMatch = albumUrl.match(/key=([^&]+)/);

  if (!albumIdMatch || !albumKeyMatch) {
    console.log("Cannot extract album ID/key");
    return reply.send([]);
  }

  const albumId = albumIdMatch[1];
  const albumKey = albumKeyMatch[1];

  const photoUris = firstItems.map(
    (id) =>
      `https://photos.google.com/share/${albumId}/photo/${id}?key=${albumKey}`
  );

  console.log("Photo pages:", photoUris.length);

  const results = [];

  for (const pageUrl of photoUris) {
    console.log("Fetching photo page:", pageUrl);

    const html = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    }).then((r) => r.text());

    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
    if (!scriptBlocks) continue;

    let metaScript = null;
    for (const block of scriptBlocks) {
      if (block.includes("data:[[")) {
        metaScript = block;
        break;
      }
    }
    if (!metaScript) continue;

    const arrayText = metaScript.substring(
      metaScript.indexOf("[["),
      metaScript.lastIndexOf("]") + 1
    );

    let parsed;
    try {
      parsed = JSON.parse(arrayText);
    } catch (err) {
      continue;
    }

    const root = parsed[0];
    const info = root[1];

    const link = info[0];
    const width = info[1];
    const height = info[2];

    const takenTimestamp = root[2] ?? null;
    const addedTimestamp = root[5] ?? null;

    const description = root[10]?.["396644657"]?.[0] || null;

    const exif = info?.[8]?.[4] || null;

    let formatted = {
      link,
      width,
      height,
      takenTimestamp,
      addedTimestamp,
      description,
    };

    if (exif) {
      const [make, model, lens, focal, aperture, iso, shutter] = exif;

      if (make) formatted.make = make;
      if (model) formatted.model = model;
      if (lens) formatted.lens = lens;
      if (focal) formatted.focal_length = focal;
      if (aperture) formatted.aperture = aperture;
      if (iso) formatted.iso = iso;
      if (shutter) formatted.shutter_speed = shutter;
    }

    results.push(formatted);
  }

  console.log("Final extracted count:", results.length);

  // Save cache for 3 days (259200000 ms)
  saveCache(cacheKey, results, process.env.CACHE_TTL_MS || 259200000);

  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Methods", "GET");
  reply.header("Access-Control-Allow-Headers", "Content-Type");

  return reply.send(results);
});

// ---- START ----
fastify.listen(
  { port: process.env.PORT, host: process.env.LISTEN },
  (err, address) => {
    if (err) throw err;
    console.log("Server running:", address);
  }
);
