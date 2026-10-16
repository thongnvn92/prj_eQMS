const fs = require('fs');
const p = 'src/hooks/queries.ts';
const lines = fs.readFileSync(p, 'utf8').split('\n');
for (const l of lines.slice(96, 100)) {
  console.log(JSON.stringify(l));
}
