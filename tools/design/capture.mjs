import {chromium} from '../../frontend/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const output='test-results/redesign';mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.FLAGMAN_BROWSER});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const base=process.env.BASE_URL??'http://127.0.0.1:5091';
async function capture(name){
  await page.screenshot({path:`${output}/${name}.png`,fullPage:!name.startsWith('delivery')&&!name.startsWith('order'),animations:'disabled'});
  const html=await page.evaluate(()=>{
    const clone=document.documentElement.cloneNode(true);
    clone.querySelectorAll('script,link[rel="stylesheet"]').forEach(el=>el.remove());
    const style=document.createElement('style');
    style.textContent=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules].map(rule=>rule.cssText)).join('\n');
    clone.querySelector('head').append(style);
    return '<!doctype html>'+clone.outerHTML;
  });writeFileSync(`${output}/${name}.html`,html);
}
await page.goto(base);await page.getByLabel('Пароль управляющего').waitFor();await capture('login');
await page.getByLabel('Пароль управляющего').fill(process.env.FLAGMAN_PASSWORD);
await page.getByRole('button',{name:'Открыть кухню'}).click();await page.locator('.date-line').waitFor();
await capture('overview-desktop');
await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();await capture('delivery-desktop');await page.keyboard.press('Escape');
await page.setViewportSize({width:390,height:844});await capture('overview-mobile');
await page.getByRole('button',{name:'Новый заказ',exact:true}).click();await capture('order-mobile');await page.keyboard.press('Escape');
await page.setViewportSize({width:280,height:900});await page.goto(base+'/generator');await page.locator('.date-line').waitFor();
console.log('overflow',await page.evaluate(()=>[...document.querySelectorAll('*')].map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,text:el.textContent?.slice(0,65)})).filter(el=>el.right>innerWidth+1 && el.right>0)));
await browser.close();
