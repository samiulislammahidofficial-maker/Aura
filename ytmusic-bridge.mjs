import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
const root=fileURLToPath(new URL('.',import.meta.url));
export class YTMusicBridge {
  constructor(){this.child=null;this.available=false;this.pending=new Map();this.sequence=0;}
  start(){
    if(this.child)return this.starting;
    const venv=fileURLToPath(new URL(process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python',import.meta.url));
    const python=process.env.YTMUSIC_PYTHON||(existsSync(venv)?venv:process.platform==='win32'?'python':'python3');
    this.starting=new Promise(resolve=>{
      const child=spawn(python,['-u','ytmusic_worker.py'],{cwd:root,windowsHide:true,stdio:['pipe','pipe','ignore'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});this.child=child;
      const timer=setTimeout(()=>{this.stop();resolve(false);},5000);
      const fail=()=>{clearTimeout(timer);if(this.child===child){this.child=null;this.available=false;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('YouTube Music worker stopped. Retry the request.'));}this.pending.clear();}resolve(false);};
      child.on('error',fail);child.on('exit',fail);child.stdin.on('error',()=>{});
      createInterface({input:child.stdout}).on('line',line=>{if(this.child!==child)return;let data;try{data=JSON.parse(line);}catch{return;}
        if(data.ready){clearTimeout(timer);this.available=true;this.configured=true;resolve(true);return;}
        const pending=this.pending.get(data.id);if(!pending)return;clearTimeout(pending.timer);this.pending.delete(data.id);if(data.error)pending.reject(new Error(data.error));else pending.resolve(data.data);
      });
    });return this.starting;
  }
  async request(action,value){
    if(!await this.start())throw new Error('Install Python and requirements.txt to enable YouTube Music.');
    if(this.pending.size>=8)throw new Error('YouTube Music is busy. Retry shortly.');
    return new Promise((resolve,reject)=>{const id=++this.sequence;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('YouTube Music request timed out. Retry or use Audius.'));this.stop();},20000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,action,value})+'\n');});
  }
  stop(){const child=this.child;this.child=null;this.available=false;child?.kill();for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('YouTube Music worker stopped. Retry the request.'));}this.pending.clear();}
}
export const ytmusic=new YTMusicBridge();
process.once('exit',()=>ytmusic.stop());
