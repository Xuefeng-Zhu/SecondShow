import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const root=process.argv[2]||'/tmp/secondshow-queue-final';
const file=root+'/SecondShow-sample-demo.webm';
await fs.access(file);
await fs.writeFile(root+'/playback.html','<!doctype html><meta charset="utf-8"><title>SecondShow video playback verification</title><style>html,body{margin:0;width:100%;height:100%;background:#111}video{width:100%;height:100%;object-fit:contain;display:block}</style><video id="movie" src="SecondShow-sample-demo.webm" muted playsinline preload="auto"></video>');
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.goto('file://'+root+'/playback.html');
 await page.locator('video').evaluate(v=>new Promise((resolve,reject)=>{
  v.addEventListener('error',()=>reject(new Error('Video decode error')),{once:true});
  if(v.readyState>=1)resolve();else v.addEventListener('loadedmetadata',resolve,{once:true});
 }));
 const metadata=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));
 if(metadata.width!==1600||metadata.height!==900||metadata.duration<85||metadata.duration>100)throw new Error('Unexpected rendered metadata');
 await page.locator('video').evaluate(v=>v.play());
 for(const second of [2,31,42,55,80]){
  await page.waitForFunction(t=>document.querySelector('video').currentTime>=t,second,{timeout:100000});
  await page.screenshot({path:root+'/playback-'+second+'.png'});
  console.log('Playback passed '+second+' seconds');
 }
 await page.waitForFunction(()=>document.querySelector('video').ended,null,{timeout:15000});
 const result=await page.locator('video').evaluate(v=>({ended:v.ended,currentTime:v.currentTime,duration:v.duration,error:v.error?.message??null,played:Array.from({length:v.played.length},(_,i)=>[v.played.start(i),v.played.end(i)])}));
 await fs.writeFile(root+'/playback-verification.json',JSON.stringify({...metadata,...result,method:'Continuous browser playback at normal speed with inspected screenshots',audio:'silent'},null,2));
 console.log(JSON.stringify(result));
}finally{await browser.close()}
