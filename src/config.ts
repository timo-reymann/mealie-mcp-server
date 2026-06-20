const BASE_URL = process.env.MEALIE_BASE_URL;
const API_KEY = process.env.MEALIE_API_KEY;

if (!BASE_URL) {
  console.error('ERROR: MEALIE_BASE_URL environment variable is required.');
  console.error('Set it to your Mealie instance URL, e.g. https://mealie.example.com');
  process.exit(1);
}

if (!API_KEY) {
  console.error('ERROR: MEALIE_API_KEY environment variable is required.');
  console.error('Generate one from your Mealie account settings.');
  process.exit(1);
}

export const config = {
  baseUrl: BASE_URL.replace(/\/+$/, ''),
  apiKey: API_KEY,
} as const;
