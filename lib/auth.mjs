import {randomBytes,scryptSync,timingSafeEqual,createHmac,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
export const hash=v=>createHash('sha256').update(v).digest('hex');
export function passwordHash(p){if(typeof p!=='string'||p.length<12||p.length>256)throw Error('Password must be 12–256 characters');const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(p,salt,64).toString('hex')}`;}
export function passwordOK(p,encoded){try{const [salt,h]=encoded.split(':');return timingSafeEqual(scryptSync(String(p),salt,64),Buffer.from(h,'hex'));}catch{return false}}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function secret(){let bits=0,value=0,out='';for(const b of randomBytes(20)){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}return out;}
function decode(s){let bits=0,value=0,bytes=[];for(const c of s){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(bytes);}
export function totp(s,time=Date.now()){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const h=createHmac('sha1',decode(s)).update(b).digest();const off=h[19]&15;return String((h.readUInt32BE(off)&0x7fffffff)%1000000).padStart(6,'0');}
export function totpOK(s,code,time=Date.now()){return /^\d{6}$/.test(String(code))&&[-30000,0,30000].some(d=>timingSafeEqual(Buffer.from(totp(s,time+d)),Buffer.from(String(code))));}
function key(){const k=process.env.AUTH_ENCRYPTION_KEY;if(!/^[0-9a-fA-F]{64}$/.test(k||''))throw Error('AUTH_ENCRYPTION_KEY must be configured');return Buffer.from(k,'hex');}
export function encrypt(v){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([c.update(v,'utf8'),c.final()]);return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${data.toString('hex')}`;}
export function decrypt(v){const [iv,tag,data]=v.split(':');const c=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'hex'));c.setAuthTag(Buffer.from(tag,'hex'));return Buffer.concat([c.update(Buffer.from(data,'hex')),c.final()]).toString('utf8');}
