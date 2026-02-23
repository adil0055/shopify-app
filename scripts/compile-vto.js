import fs from 'fs';
let code = fs.readFileSync('app/vto-frontend/components/PublicVto.jsx', 'utf8');
code = code.replace(/className=\{styles\.([^}]+)\}/g, 'className="$1"');
code = code.replace(/className=\{`([^`]+)`\}/g, (m, g) => {
    return 'className="' + g.replace(/\$\{styles\.([^}]+)\}/g, '$1').trim() + '"';
});
fs.writeFileSync('app/vto-frontend/components/PublicVto.jsx', code);
