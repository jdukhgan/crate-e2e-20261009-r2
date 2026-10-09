import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { homedir } from 'node:os';
import { validateAlbum, STATUSES, ERROR_COPY } from '../public/js/contract.js';
const root = resolve(import.meta.dirname, '..');
export function openDatabase(path) {
  mkdirSync(dirname(path), {recursive:true});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS albums(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,artist TEXT NOT NULL,status TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',cover TEXT);
    CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY);`);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT name FROM migrations WHERE name=?').get('seed-v1')) {
      const insert=db.prepare('INSERT INTO albums(title,artist,status,notes,cover) VALUES(?,?,?,?,?)');
      for (const a of JSON.parse(readFileSync(resolve(root,'data/albums.json'))).albums) insert.run(a.title,a.artist,a.status,a.notes,a.cover);
      db.prepare('INSERT INTO migrations(name) VALUES(?)').run('seed-v1');
    }
    db.exec('COMMIT');
  } catch(e) { db.exec('ROLLBACK'); db.close(); throw e; }
  return db;
}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
export function createApp(db) {
  const json=(res,status,value)=>res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}).end(JSON.stringify(value));
  const error=(res,status,code,message,fields)=>json(res,status,{error:{code,message,...(fields?{fields}:{})}});
  return createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/health' && req.method==='GET') return json(res,200,{status:'ok'});
      if(url.pathname.startsWith('/api/')) {
        const match=/^\/api\/albums(?:\/([1-9]\d*))?$/.exec(url.pathname);
        if(!match) return error(res,404,'not_found',ERROR_COPY.notFound);
        const id=match[1]?Number(match[1]):null;
        if(id !== null && !Number.isSafeInteger(id)) return error(res,404,'not_found',ERROR_COPY.notFound);
        if(req.method==='GET') {
          if(id) {const a=db.prepare('SELECT * FROM albums WHERE id=?').get(id); return a?json(res,200,a):error(res,404,'not_found',ERROR_COPY.notFound);}
          const status=url.searchParams.get('status')||'';
          if(status && !STATUSES.includes(status)) return error(res,422,'invalid',ERROR_COPY.invalid,{status:'Choose a valid listening status.'});
          const q=(url.searchParams.get('q')||'').trim().toLocaleLowerCase();
          const rows=db.prepare('SELECT * FROM albums ORDER BY id DESC').all().filter(a=>(!status||a.status===status)&&(!q||a.title.toLocaleLowerCase().includes(q)||a.artist.toLocaleLowerCase().includes(q)));
          return json(res,200,rows);
        }
        if(!['POST','PATCH','DELETE'].includes(req.method)|| (req.method==='POST'?id:!id)) return error(res,405,'method_not_allowed','This action is unavailable.');
        // Browser mutations must originate from this app, even on a local preview.
        if(req.headers.origin && req.headers.origin!==`http://${req.headers.host}` && req.headers.origin!==`https://${req.headers.host}`) return error(res,403,'forbidden','This action must be made from Crate.');
        if(id && !db.prepare('SELECT id FROM albums WHERE id=?').get(id)) return error(res,404,'not_found',ERROR_COPY.notFound);
        if(req.method==='DELETE') {db.prepare('DELETE FROM albums WHERE id=?').run(id); return json(res,200,{id});}
        if(!req.headers['content-type']?.startsWith('application/json')) return error(res,415,'invalid','Send album fields as JSON.');
        const chunks=[];let bytes=0;
        for await(const chunk of req) {bytes+=chunk.length;if(bytes>65536) return error(res,413,'invalid','This album is too large.');chunks.push(chunk);}
        let input;try{input=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{return error(res,400,'invalid','The album could not be read. Try again.');}
        if(!input||typeof input!=='object'||Array.isArray(input)) return error(res,422,'invalid',ERROR_COPY.invalid);
        const check=validateAlbum(input,{partial:req.method==='PATCH'});
        if(!check.ok) return error(res,422,'invalid',ERROR_COPY.invalid,check.fields);
        let savedId=id;
        if(req.method==='POST') {const a=check.value;savedId=Number(db.prepare('INSERT INTO albums(title,artist,status,notes) VALUES(?,?,?,?)').run(a.title,a.artist,a.status,a.notes).lastInsertRowid);}
        else {const entries=Object.entries(check.value);if(entries.length) db.prepare(`UPDATE albums SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v),id);}
        return json(res,req.method==='POST'?201:200,db.prepare('SELECT * FROM albums WHERE id=?').get(savedId));
      }
      if(!['GET','HEAD'].includes(req.method)) return error(res,405,'method_not_allowed','This action is unavailable.');
      const base=resolve(root,'public');
      const path=resolve(base,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!path.startsWith(base+sep)) return error(res,404,'not_found','Not found.');
      try {const body=await readFile(path);res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-cache','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'self'; img-src 'self'; script-src 'self'; font-src 'self'; frame-ancestors 'none'"}).end(req.method==='HEAD'?undefined:body);}catch{return error(res,404,'not_found','Not found.');}
    } catch(e) {console.error('Request failed:',e.message); if(!res.headersSent) error(res,500,'server',ERROR_COPY.server);else res.end();}
  });
}
if(process.argv[1]===import.meta.filename) {
  const path=process.env.CRATE_DB||resolve(process.env.XDG_DATA_HOME||resolve(homedir(),'.local/share'),'crate','albums.sqlite');
  const db=openDatabase(path); const app=createApp(db);
  app.listen(Number(process.env.PORT||4174),process.env.HOST||'127.0.0.1',()=>console.log('Crate ready'));
  const stop=()=>app.close(()=>{db.close();process.exit(0);});process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
