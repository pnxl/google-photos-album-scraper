import fetch from "node-fetch";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_INSTANCE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// fetch current database and see if a picture already exists
const { data } = await supabase.from("singles").select("link");

// fetch album html
console.log("Scraping Google Photos album...");
const albumHtml = await fetch(process.env.GOOGLE_PHOTOS_ALBUM_URL, {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

if (process.env.DEBUG) {
  console.log("Fetched album HTML, size:", albumHtml.length);
}

// extract script blocks
const scriptBlocks = albumHtml.match(/<script[^>]*>([\s\S]*?)<\/script>/g);

if (process.env.DEBUG) {
  console.log("Number of script blocks found:", scriptBlocks.length);
}

if (!scriptBlocks) {
  console.error("No script blocks found!");
  process.exit(1);
}

let metaScript = null;
for (const block of scriptBlocks) {
  if (block.includes("data:[null,[[")) {
    metaScript = block;
    break;
  }
}

if (!metaScript) {
  console.error("No metadata array found!");
  process.exit(1);
}

if (process.env.DEBUG) {
  console.log("Metadata script found.");
}

// find the data array
const arrayStart = metaScript.indexOf("[[");
const arrayEnd = metaScript.indexOf("]]}]]") + 5;
const arrayText = metaScript.substring(arrayStart, arrayEnd);

if (process.env.DEBUG) {
  console.log("Found data array.");
}

// parse the data array
let parsed;
try {
  parsed = JSON.parse(arrayText);
  if (process.env.DEBUG) {
    console.log("Parsed data array:", parsed);
  }
} catch (err) {
  console.error("JSON parse failed:", err);
  console.log(arrayText);
  process.exit(1);
}

const firstItems = parsed.map((item) => `${item[0]}`);

const albumIdMatch =
  process.env.GOOGLE_PHOTOS_ALBUM_URL.match(/share\/([^\/?]+)/);
const albumKeyMatch = process.env.GOOGLE_PHOTOS_ALBUM_URL.match(/key=([^&]+)/);

if (!albumIdMatch || !albumKeyMatch) {
  console.error("Cannot extract album ID/key");
  process.exit(1);
}

if (process.env.DEBUG) {
  console.log("Matched album ID/key:", albumIdMatch, albumKeyMatch);
}

const albumId = albumIdMatch[1];
const albumKey = albumKeyMatch[1];

// find all photo page URLs
const photoUris = firstItems.map(
  (id) =>
    `https://photos.google.com/share/${albumId}/photo/${id}?key=${albumKey}`
);

if (process.env.DEBUG) {
  console.log("Photo URIs found:", photoUris.length);
}

// individual photos
const results = [];

for (const pageUrl of photoUris) {
  const exists = data.some((item) => item.link === pageUrl);

  if (exists === true) {
    // skip fetching if already in database
    if (process.env.DEBUG) {
      console.log("Skipping existing photo:", pageUrl);
    }
  } else {
    // fetch each photo page
    if (process.env.DEBUG) {
      console.log("\nFetching photo page.");
    }

    const html = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    }).then((r) => r.text());

    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
    if (!scriptBlocks) continue;

    if (process.env.DEBUG) {
      console.log("Script blocks found on photo page.");
    }

    let metaScript = null;
    for (const block of scriptBlocks) {
      if (block.includes("data:[[")) {
        metaScript = block;
        break;
      }
    }
    if (!metaScript) continue;

    if (process.env.DEBUG) {
      console.log("Metadata found on photo page.");
    }

    const arrayText = metaScript.substring(
      metaScript.indexOf("[["),
      metaScript.lastIndexOf("]") + 1
    );

    let parsed;
    try {
      parsed = JSON.parse(arrayText);

      if (process.env.DEBUG) {
        console.log("Parsed metadata.");
      }
    } catch (err) {
      continue;
    }

    // add photo to results
    const root = parsed[0];
    const info = root[1];

    const link = pageUrl;
    const image = `${info[0]}`;
    const width = info[1];
    const height = info[2];

    const takenTimestamp = root[2] ?? null;
    const addedTimestamp = root[5] ?? null;

    const description = root[10]?.["396644657"]?.[0] || null;

    const exif = info?.[8]?.[4] || null;

    let formatted = {
      link,
      image,
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
      if (focal) formatted.focalLength = focal;
      if (aperture) formatted.aperture = aperture;
      if (iso) formatted.iso = iso;
      if (shutter) formatted.shutterSpeed = shutter;
    }

    const { data, error } = await supabase
      .from("singles")
      .insert(formatted)
      .select();

    if (error === null) {
      console.log(`Pushed ${link} to Supabase.`);
    } else {
      console.error(`Error inserting ${link} into Supabase:`, error);
      process.exit(1);
    }

    // optimise image as webp to reduce storage size
    const imageResponse = await fetch(`${info[0]}=w1200-h1200`).then((r) =>
      r.arrayBuffer()
    );

    if (process.env.DEBUG) {
      console.log("Fetched image for photo page:", pageUrl);
    }

    const webpBuffer = await sharp(Buffer.from(imageResponse))
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toBuffer();

    if (process.env.DEBUG) {
      console.log("Converted image to webp.");
    }

    const singlesStorage = await supabase.storage
      .from("singles")
      .upload(`${data[0].id}.webp`, webpBuffer, {
        contentType: "image/webp",
      });

    if (singlesStorage.error !== null) {
      console.error(
        `Error uploading image for ${link} to Supabase storage:`,
        singlesStorage.error
      );
      process.exit(1);
    }

    if (process.env.DEBUG) {
      console.log("Inserted webp image into Supabase storage.");
    }
  }
}
