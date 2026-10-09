const {spawnSync}=require('node:child_process');
const {mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir,homedir}=require('node:os');
const dir=mkdtempSync(join(tmpdir(),'crate-browser-'));
try {
 const result=spawnSync(process.execPath,[join(homedir(),'.agents/skills/jlab-dev-v1-implementation/browser-test.cjs'),'--config','playwright.config.cjs',...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,TEST_DB:join(dir,'albums.sqlite')}});
 if(result.error) console.error(result.error.message);
 process.exitCode=result.status??1;
} finally {rmSync(dir,{recursive:true,force:true});}
