// Bounded, expiring metadata cache. Streams and authorization checks never enter it.
export class RequestCache {
  constructor({ttl=30000,max=100}={}) {this.ttl=ttl;this.max=max;this.entries=new Map();this.pending=new Map();this.stats={hits:0,misses:0,joined:0};}
  async get(key,loader) {
    const entry=this.entries.get(key);
    if(entry?.expires>Date.now()){this.stats.hits++;return entry.value;}
    if(this.pending.has(key)){this.stats.joined++;return this.pending.get(key);}
    this.entries.delete(key);this.stats.misses++;
    const promise=Promise.resolve().then(loader).then(value=>{if(this.entries.size>=this.max)this.entries.delete(this.entries.keys().next().value);this.entries.set(key,{value,expires:Date.now()+this.ttl});return value;}).finally(()=>this.pending.delete(key));
    this.pending.set(key,promise);return promise;
  }
}
export const metadataCache=new RequestCache();
