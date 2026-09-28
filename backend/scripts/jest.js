// pdf.js (used by pdf-parse) loads its worker with a dynamic import(), which Jest only
// supports when Node runs with --experimental-vm-modules. This wrapper is started with
// that flag by `npm test`, and resolves Jest through normal module resolution.
require('jest').run(process.argv.slice(2));
