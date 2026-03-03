import fs from 'fs';
const b64 = fs.readFileSync('tuck_logo_b64.txt', 'utf8');
fs.writeFileSync('app/vto-frontend/components/logo.js', 'export const TUCK_LOGO = `' + b64 + '`;\n', 'utf8');
