import Redis from 'ioredis';
let client:Redis|null=null;
function redis(){if(!process.env.REDIS_URL){if(process.env.NODE_ENV==='production') throw new Error('REDIS_URL is required in production');return null;}client??=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1,lazyConnect:true});return client;}
export async function checkRateLimit(key:string,limit:number,seconds:number){
 const connection=redis();if(!connection)return;
 const redisKey=`teamflow:limit:${key}`;
 const count=Number(await connection.eval("local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return count",1,redisKey,seconds));
 if(count>limit) throw new Error('Too many requests. Please try again later.');
}
