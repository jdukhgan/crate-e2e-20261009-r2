import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase,createApp} from '../server/app.mjs';
test('API boundaries, CRUD, combined Unicode search, and seed-once restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'crate-api-')),path=join(dir,'albums.sqlite');
 let db=openDatabase(path),server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let base=`http://127.0.0.1:${server.address().port}`;
 const req=async(path='',method='GET',data)=>{const res=await fetch(base+'/api/albums'+path,{method,headers:{'content-type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,data:await res.json()};};
 try {
  assert.equal((await req()).data.length,8);
  const input={title:'  🎶'.repeat(1)+'🎶'.repeat(159)+'  ',artist:'Étude',status:'Want to hear',notes:'  <script>alert(1)</script>\n🎶  '};
  const created=await req('','POST',input);assert.equal(created.status,201);const id=created.data.id;
  assert.equal([...created.data.title].length,160);assert.equal(created.data.notes,input.notes);
  for(const patch of [{title:'🎶'.repeat(161)},{artist:'x'.repeat(121)},{notes:'🎶'.repeat(4001)},{title:' \n '},{status:'bogus'},{artist:42}]) {assert.equal((await req('/'+id,'PATCH',patch)).status,422);}
  assert.equal((await req('/'+id)).data.artist,'Étude');
  const updated=await req('/'+id,'PATCH',{status:'Heard'});assert.equal(updated.data.status,'Heard');
  assert.equal((await req('?q='+encodeURIComponent('ÉTUDE')+'&status=Heard')).data.length,1);
  assert.equal((await req('?q='+encodeURIComponent('étude')+'&status=Listening')).data.length,0);
  assert.equal((await req('/999999','PATCH',{status:'Heard'})).status,404);
  assert.equal((await req('','POST',[])).status,422);
  assert.equal((await req('?status=invalid')).status,422);
  const invalid=await fetch(base+'/api/albums',{method:'POST',headers:{'content-type':'application/json'},body:'{'});assert.equal(invalid.status,400);
  const forbidden=await fetch(base+'/api/albums/'+id,{method:'DELETE',headers:{origin:'https://other.example'}});assert.equal(forbidden.status,403);
  await new Promise(r=>server.close(r));db.close();db=openDatabase(path);server=createApp(db);await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await req('/'+id)).data.notes,input.notes);
  for(const a of (await req()).data) assert.equal((await req('/'+a.id,'DELETE')).status,200);
  assert.equal((await req('/'+id)).status,404);
  await new Promise(r=>server.close(r));db.close();db=openDatabase(path);assert.equal(db.prepare('SELECT count(*) AS n FROM albums').get().n,0);
 } finally {await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
