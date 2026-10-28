#pragma once
// Keep this file private. No Supabase service_role/secret key here.
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
#define CLOUD_ENABLED false  // switch to true AFTER filling every field
const char* SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const char* SUPABASE_PUBLISHABLE_KEY = "YOUR_PUBLISHABLE_OR_ANON_KEY";
const char* DEVICE_ID = "YOUR_DEVICE_UUID";
const char* DEVICE_TOKEN = "YOUR_DEVICE_TOKEN_64_HEX";
// Paste the PEM ROOT CA that validates your project's current HTTPS chain.
// See README for verification. TLS fails closed: never use setInsecure().
const char* ROOT_CA = R"PEM(
-----BEGIN CERTIFICATE-----
PASTE_VERIFIED_ROOT_CA_PEM_HERE
-----END CERTIFICATE-----
)PEM";
