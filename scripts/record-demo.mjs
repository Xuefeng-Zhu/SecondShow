import {chromium} from '@playwright/test';
import {startCapture} from '/Users/frank/.codex/plugins/cache/openai-curated-remote/demo-videos/0.3.1/skills/create-demo-video/scripts/capture.mjs';
const directory=process.argv[2];
const browser=await chromium.launch({headless:true});
let capture;
try{
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:3000');
 await page.getByRole('button',{name:/Load sample venue/}).click();
 capture=await startCapture(page,directory);
 await page.mouse.move(1100,160);
 await page.waitForTimeout(3000);
 await capture.stop('Capture test for SecondShow','Actual sample workspace recorded for three seconds.');capture=null;
}finally{if(capture)await capture.stop('Capture test for SecondShow','Recording interrupted; inspect the original.');await browser.close()}
