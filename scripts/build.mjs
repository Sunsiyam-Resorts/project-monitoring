import {cp,mkdir} from 'node:fs/promises';
await mkdir('dist',{recursive:true}); await cp('public','dist',{recursive:true}); console.log('Portal static assets built. Vercel deploys api/index.mjs separately.');
