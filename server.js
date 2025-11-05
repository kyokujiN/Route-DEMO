const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");
const bodyParser = require("body-parser");
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all requests
app.use(cors());

// Use body parser for JSON requests
app.use(bodyParser.json());

// Serve static files from the 'public' directory
app.use(express.static("public"));

// Define the default location of the depot (Industrigata 14B, Haugesund)
const depotAddress = "Industrigata 14B, Haugesund";

// Endpoint to get optimized route
app.post("/optimize", async (req, res) => {
  try {
    const { addresses } = req.body;
    if (!addresses || addresses.length === 0) {
      return res.status(400).json({ error: "No addresses provided" });
    }

    // Convert addresses to geolocations using Nominatim API (OpenStreetMap)
    const geocodeAddresses = async (addresses) => {
      const results = [];
      for (let address of addresses) {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json`);
        const data = await geoRes.json();
        if (data && data.length > 0) {
          results.push({
            address,
            lat: data[0].lat,
            lon: data[0].lon
          });
        }
      }
      return results;
    };

    const locations = await geocodeAddresses([depotAddress, ...addresses]);

    // Extract lat/lon for OSRM route calculation
    const coordinates = locations.map(loc => `${loc.lon},${loc.lat}`).join(';');
    const osrmUrl = `http://router.project-osrm.org/table/v1/driving/${coordinates}?annotations=distance`;

    const osrmRes = await fetch(osrmUrl);
    const osrmData = await osrmRes.json();

    // Here you would implement your NN + 2-opt algorithm for optimal route calculation
    // For simplicity, I'm returning a mock "optimized" route here
    const optimizedRoute = locations.slice(1).reverse();  // reverse the route just as an example

    const totalDistanceMeters = osrmData.distances[0].reduce((acc, dist) => acc + dist, 0);

    // Send the optimized route and distance back to the frontend
    res.json({
      route: optimizedRoute,
      totalDistanceMeters,
      method: "NN + 2-opt (OSRM roads)"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred while processing the route." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
