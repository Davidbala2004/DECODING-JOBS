/**
 * Geocode company names/addresses to lat/lng using Nominatim (OpenStreetMap).
 * Free, no API key required. Rate limit: 1 req/sec.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "DecodingJobs/1.0 (job-search-project)";

/**
 * Geocode a query string to { lat, lng } or null if not found.
 * @param {string} query - e.g. "Razorpay Bangalore" or "Koramangala Bangalore"
 * @param {string} city - fallback city context e.g. "Bengaluru"
 * @returns {Promise<{ lat: number, lng: number } | null>}
 */
export async function geocode(query, city = "Bengaluru") {
  // Try the specific query first, then with city context.
  for (const q of [query, `${query} ${city}`]) {
    try {
      const params = new URLSearchParams({
        q,
        format: "json",
        limit: "1",
        countrycodes: "in",
      });

      const response = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { "User-Agent": USER_AGENT },
      });

      if (!response.ok) continue;

      const results = await response.json();
      if (results.length > 0) {
        return {
          lat: parseFloat(results[0].lat),
          lng: parseFloat(results[0].lon),
        };
      }
    } catch {
      // Continue to next query variant.
    }

    // Respect Nominatim rate limit: 1 req/sec.
    await new Promise((r) => setTimeout(r, 1100));
  }

  return null;
}

/**
 * Geocode a list of companies with fallback to city center coordinates.
 * @param {Array} companies - [{ name, area, city, address? }]
 * @returns {Map<string, { lat, lng }>}
 */
const CITY_CENTERS = {
  Bengaluru: { lat: 12.9716, lng: 77.5946 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Kochi: { lat: 9.9312, lng: 76.267 },
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  "Delhi NCR": { lat: 28.4595, lng: 77.0266 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Coimbatore: { lat: 11.01, lng: 76.97 },
  Thiruvananthapuram: { lat: 8.5241, lng: 76.9366 },
  Madurai: { lat: 9.9252, lng: 78.1198 },
  Kozhikode: { lat: 11.2588, lng: 75.7873 },
  Visakhapatnam: { lat: 17.6868, lng: 83.2185 },
  Mysuru: { lat: 12.2958, lng: 76.6394 },
};

// Haversine distance in km — used to sanity-check a geocode result against
// the company's expected city, since Nominatim occasionally matches a
// wrong, same-named place (e.g. a query meant for Noida landing in Kerala).
function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const MAX_PLAUSIBLE_KM = 80;

export async function geocodeCompanies(companies) {
  const results = new Map();

  for (const company of companies) {
    const cityCenter = CITY_CENTERS[company.city] || CITY_CENTERS.Bengaluru;

    // Try multiple query variants for better accuracy.
    const queries = [
      `${company.name} office ${company.area || ""} ${company.city || ""}`.trim(),
      `${company.name} ${company.city || "Bengaluru"}`,
      company.address || `${company.name} ${company.area || ""}`,
    ];

    let coords = null;
    for (const q of queries) {
      const candidate = await geocode(q, company.city || "Bengaluru");
      if (candidate && distanceKm(candidate, cityCenter) <= MAX_PLAUSIBLE_KM) {
        coords = candidate;
        break;
      }
      if (candidate) {
        console.log(`  ⚠ Discarding implausible match for "${company.name}" (${distanceKm(candidate, cityCenter).toFixed(0)}km from ${company.city}): "${q}"`);
      }
    }

    // Fallback to city center if geocoding failed or every match was implausible.
    if (!coords) {
      // Add small random offset so companies don't stack on top of each other.
      coords = {
        lat: cityCenter.lat + (Math.random() - 0.5) * 0.02,
        lng: cityCenter.lng + (Math.random() - 0.5) * 0.02,
      };
      console.log(`  ⚠ Could not geocode "${company.name}" — using city center offset`);
    } else {
      console.log(`  ✓ Geocoded "${company.name}" → (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`);
    }

    results.set(company.name, coords);

    // Rate limit: 1 req/sec for Nominatim.
    await new Promise((r) => setTimeout(r, 1100));
  }

  return results;
}

// Run as standalone script for testing.
if (import.meta.url === `file://${process.argv[1]}`) {
  const testQuery = process.argv[2] || "Razorpay Bangalore";
  console.log(`Geocoding: "${testQuery}"`);
  const result = await geocode(testQuery);
  console.log(result ? `Result: ${JSON.stringify(result)}` : "Not found");
}
