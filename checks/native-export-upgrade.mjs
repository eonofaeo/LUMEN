import fs from 'node:fs/promises';
const file='lumen-free/app.js';let text=await fs.readFile(file,'utf8');
for(const format of ['json','html','csv'])text=text.replace('<button type="button" class="button secondary" data-action="export-'+format+'">','<a class="button secondary" data-action="export-'+format+'" data-export="'+format+'" href="#">');
text=text.replace('Full backup · JSON</button>','Full backup · JSON</a>').replace('Browser HTML</button>','Browser HTML</a>').replace('CSV</button>','CSV</a>');
await fs.writeFile(file,text);
