/**
 * Public half of the licence signing key (Ed25519).
 * Replace with the key printed by:  cd admin-web/backend && npm run license:keys
 * The private half lives ONLY in backend/.env on the server (DESKTOP_LICENSE_PRIVATE_KEY).
 */
module.exports = `-----BEGIN PUBLIC KEY-----
REPLACE_WITH_PUBLIC_KEY_FROM_npm_run_license_keys
-----END PUBLIC KEY-----
`;
