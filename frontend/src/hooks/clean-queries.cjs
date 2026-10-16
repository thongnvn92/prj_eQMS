const fs = require('fs');
const p = 'src/hooks/queries.ts';
let s = fs.readFileSync(p, 'utf8');
const i = s.indexOf('onSuccess');
console.log(JSON.stringify(s.slice(i - 20, i + 40)));
