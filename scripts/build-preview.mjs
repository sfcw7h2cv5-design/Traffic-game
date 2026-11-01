import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=name=>readFile(new URL(name,root),'utf8');
let html=await read('index.html');
const css=(await read('style.css')).split('\n').filter(line=>!line.startsWith('@import')).join('\n');
const model=(await read('model.js')).replaceAll('export const ','const ').replaceAll('export class ','class ');
const display=(await read('display.js')).replaceAll('export function ','function ');
const app=(await read('app.js')).replace(/^import .*?;\s*/gm,'');
html=html.replace(/<link rel="stylesheet" href="style.css[^\"]*">/,'<style>'+css+'</style>')
 .replace(/<script type="module" src="app.js[^\"]*"><\/script>/,'<script>'+model+'\n'+display+'\n'+app+'</script>');
await writeFile(new URL('play.html',root),html);
console.log('Built self-contained play.html');
