import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
let html=await read('index.html');
const css=(await read('style.css')).split('\n').filter(line=>!line.startsWith('@import')).join('\n');
const experience=(await read('experience.js')).replaceAll('export class ','class ').replaceAll('export function ','function ').replace('const clamp=', 'const experienceClamp=').replaceAll('clamp(', 'experienceClamp(');
const systems=(await read('systems.js')).replace(/^import .*?;\s*/gm,'').replaceAll('export class ','class ');
const model=(await read('model.js')).replace(/^import .*?;\s*/gm,'').replaceAll('export const ','const ').replaceAll('export class ','class ');
const road=(await read('road.js')).replaceAll('export function ','function ');
const display=(await read('display.js')).replaceAll('export function ','function ');
const app=(await read('app.js')).replace(/^import .*?;\s*/gm,'');
html=html.replace(/<link rel="stylesheet" href="style.css[^\"]*">/,'<style>'+css+'</style>')
 .replace(/<script type="module" src="app.js[^\"]*"><\/script>/,'<script>'+experience+'\n'+systems+'\n'+model+'\n'+road+'\n'+display+'\n'+app+'</script>');
await writeFile(new URL('play.html',root),html);
console.log('Built self-contained play.html');
