// server.js
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // hostuje frontend z /public

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';

// funkcja geokodowania adresu
async function geocode(address) {
  const q = encodeURIComponent(address);
  const url = `${NOMINATIM_BASE}?format=json&limit=1&q=${q}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'route-optimizer-demo/1.0' } });
  const data = await res.json();
  if (!data || data.length === 0) throw new Error(`Nie znaleziono adresu: ${address}`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

// algorytm NN
function nearestNeighbor(distMatrix, startIdx = 0) {
  const n = distMatrix.length;
  const visited = new Array(n).fill(false);
  const route = [startIdx];
  visited[startIdx] = true;
  for (let step = 1; step < n; step++) {
    const last = route[route.length - 1];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && distMatrix[last][i] < bestD) {
        bestD = distMatrix[last][i];
        best = i;
      }
    }
    if (best === -1) break;
    visited[best] = true;
    route.push(best);
  }
  return route;
}

// 2-opt
function twoOpt(route, dist) {
  const n = route.length;
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < n - 2; i++) {
      for (let k = i + 1; k < n - 1; k++) {
        const a = route[i - 1], b = route[i];
        const c = route[k], d = route[k + 1];
        const delta = (dist[a][c] + dist[b][d]) - (dist[a][b] + dist[c][d]);
        if (delta < -1e-6) {
          route.splice(i, k - i + 1, ...route.slice(i, k + 1).reverse());
          improved = true;
        }
      }
    }
  }
  return route;
}

// funkcja do pobrania macierzy dystansów z OSRM
async function buildDistanceMatrix(points) {
  const coords = points.map(p => `${p.lon},${p.lat}`).join(';');
  const url = `http://router.project-osrm.org/table/v1/driving/${coords}?annotations=distance`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.distances) throw new Error('OSRM failed');
  return data.distances; // macierz dystansów w metrach
}

app.post('/optimize', async (req, res) => {
  try {
    const { addresses = [], depot = null, returnToDepot = false } = req.body;
    if (!addresses || addresses.length === 0) return res.status(400).json({ error: 'Brak adresów' });

    // geokodowanie
    const points = [];
    if (depot) {
      const g = await geocode(depot);
      points.push({ address: depot, lat: g.lat, lon: g.lon, isDepot: true });
    }
    for (let a of addresses) {
      const g = await geocode(a);
      points.push({ address: a, lat: g.lat, lon: g.lon, isDepot: false });
    }

    // pobranie dystansów drogowych z OSRM
    const dist = await buildDistanceMatrix(points);

    // algorytm trasy
    const startIdx = depot ? 0 : 0;
    let route = nearestNeighbor(dist, startIdx);

    if (returnToDepot && depot) {
      if (route[0] !== 0) {
        const idx = route.indexOf(0);
        if (idx !== -1) {
          route = route.slice(idx).concat(route.slice(0, idx));
        } else {
          route.unshift(0);
        }
      }
    }

    route = twoOpt(route, dist);

    const ordered = route.map(i => points[i]);
    if (returnToDepot && depot) ordered.push(points[0]);

    // suma dystansu
    let total = 0;
    for (let i = 0; i + 1 < ordered.length; i++) {
      total += dist[route[i]][route[i + 1]];
    }

    res.json({
      ordered: ordered.map((p, idx) => ({ idx, address: p.address, lat: p.lat, lon: p.lon, isDepot: p.isDepot || false })),
      totalMeters: Math.round(total),
      method: 'NN + 2-opt (OSRM roads)'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
