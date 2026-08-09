import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
const root=process.env.DICEL_LATEST_ROOT;
if(!root)throw new Error('DICEL_LATEST_ROOT_required');
const {compile}=await import(pathToFileURL(`${root}/scripts/pipeline/lib/dicel_compiler.mjs`).href);
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of rl){
 if(!line.trim())continue;
 let p;
 try{
  p=JSON.parse(line);
  const start=performance.now();
  const c=compile(p.source);
  const r={id:p.id,compile:c.ok,phase:c.ir.errors.length?'parser':c.ok?'compiled':'semantic',diagnostics:c.diagnostics,parse_errors:c.ir.errors,ts_sha256:createHash('sha256').update(c.ts).digest('hex'),js_sha256:createHash('sha256').update(c.js).digest('hex'),elapsed_ms:performance.now()-start};
  if(c.ok&&(p.runtimeExpected!==undefined||p.runtimeExpectedSpecial!==undefined)){
   try{
    const expected=p.runtimeExpectedSpecial==='-0'?-0:p.runtimeExpected;
    const mod=await import(`data:text/javascript;base64,${Buffer.from(c.js+'\nexport { test };').toString('base64')}#${p.id}`);
    const actual=await mod.test(...(p.args??[]));
    r.runtime=true;r.runtime_actual=actual;r.runtime_expected=expected;r.runtime_expected_special=p.runtimeExpectedSpecial;r.runtime_equal=Object.is(actual,expected);
   }catch(e){r.runtime=false;r.runtime_equal=false;r.runtime_error=String(e instanceof Error?e.message:e)}
  }
  process.stdout.write(JSON.stringify(r)+'\n');
 }catch(e){process.stdout.write(JSON.stringify({id:p?.id??null,compile:false,phase:'worker',error:String(e instanceof Error?e.message:e)})+'\n')}
}
