import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname replacement for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Power curve definition (wind speed in m/s -> expected production MW).
// These values are copied from the original RGWE spreadsheet. The array
// indexes are 1-based: index 1 corresponds to 1 m/s wind speed.
const EP_WS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21
];
const EP_MW = [
  0.000,
  0.000,
  2.646,
  11.9805,
  28.65275,
  52.5035,
  86.13,
  131.01375,
  186.494,
  231.24325,
  254.9225,
  256.9315,
  257.25,
  257.25,
  257.25,
  257.25,
  257.25,
  257.25,
  257.25,
  257.25,
  257.25
];

/**
 * Compute expected production (MW) from a given wind speed in m/s.
 * The function rounds the wind speed to the nearest integer and
 * uses the EP_MW table above. Values below the first entry return 0 and
 * values above the last entry cap at the last defined power.
 *
 * @param {number} w_ms Wind speed in m/s
 * @returns {number} Expected production in MW
 */
function expectedProductionMWFromSheet(w_ms) {
  if (!Number.isFinite(w_ms) || w_ms < EP_WS[0]) {
    return 0;
  }
  let ws = Math.round(w_ms);
  if (ws > EP_WS[EP_WS.length - 1]) {
    ws = EP_WS[EP_WS.length - 1];
  }
  if (ws < EP_WS[0]) {
    return 0;
  }
  // EP_MW array is 0‑indexed where index 0 corresponds to 1 m/s.
  return EP_MW[ws - 1];
}

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for development convenience. When deployed behind a domain
// this can be restricted or removed entirely.
import cors from 'cors';
app.use(cors());

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Weather forecast endpoint. It proxies the request to open‑meteo and
// returns the JSON payload. Accepts latitude and longitude query params.
app.get('/api/forecast', async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: 'Missing lat or lon query parameters.' });
  }
  try {
    // Build the Open‑Meteo URL. It requests hourly wind speeds and temperatures
    // as well as daily min/max values. The timezone is set to auto so the API
    // returns values in the local timezone of the coordinates.
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
      lat
    )}&longitude=${encodeURIComponent(
      lon
    )}&hourly=temperature_2m,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_speed_10m_min&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open‑Meteo API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error('Error fetching forecast:', err);
    return res.status(500).json({ error: 'Error fetching forecast: ' + err.message });
  }
});

// Production calculation endpoint. Accepts a comma‑separated list of wind
// speeds (m/s) in the `windSpeeds` query parameter and returns an array
// of expected production values.
app.get('/api/production', (req, res) => {
  const { windSpeeds } = req.query;
  if (!windSpeeds) {
    return res.status(400).json({ error: 'Missing windSpeeds query parameter.' });
  }
  try {
    const speeds = windSpeeds.split(',').map((v) => parseFloat(v));
    const productions = speeds.map((ws) => expectedProductionMWFromSheet(ws));
    return res.json({ productions });
  } catch (err) {
    console.error('Error calculating production:', err);
    return res.status(500).json({ error: 'Error calculating production.' });
  }
});

// Catch‑all handler to return index.html for any unmatched route. This
// enables client‑side routing if you decide to add it later.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RGWE server listening on port ${PORT}`);
});
