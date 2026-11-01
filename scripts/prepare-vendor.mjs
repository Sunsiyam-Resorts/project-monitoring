import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
await copyFile('node_modules/exceljs/dist/exceljs.min.js', 'public/vendor/exceljs.min.js');
await copyFile('node_modules/exceljs/LICENSE', 'public/vendor/exceljs-LICENSE.txt');
