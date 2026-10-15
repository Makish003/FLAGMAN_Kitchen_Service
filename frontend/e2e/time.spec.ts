import {test,expect} from '@playwright/test';
import path from 'node:path';

// The header uses the restaurant zone and applies the configured demo offset.
test.use({timezoneId:'America/Los_Angeles',baseURL:'http://flagman.test'});

for(const demoOffsetHours of [0,8]) {
  test(`restaurant clock applies demo offset ${demoOffsetHours}`,async({page})=>{
    await page.clock.install({time:new Date('2026-10-10T21:00:45Z')});
    // Serve the production build locally through routing; no live database is changed.
    await page.route('**/*',route=>{
      const pathname=new URL(route.request().url()).pathname;
      return route.fulfill({path:path.resolve('../backend/wwwroot',pathname.startsWith('/assets/')?pathname.slice(1):'index.html')});
    });
    const now=demoOffsetHours?'2026-10-11T05:00:45Z':'2026-10-10T21:00:45Z';
    const delivery={id:'delivery-1',number:'ПС-1',createdAt:now,receivedAt:now,batchIds:[]};
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/events')return route.fulfill({contentType:'text/event-stream',body:': connected\n\n'});
      const body=['/api/delivery-requests','/api/order-requests','/api/procurement-requests'].includes(path)?{items:[],total:0,page:1,size:50}:['/api/accounts','/api/offers/overrides'].includes(path)?[]:path==='/api/session'?{id:'mock-manager',role:'manager',name:'Управляющий',demo:true}:
        path==='/api/history/deliveries'?{items:[delivery],total:1}:
        {now,demoOffsetHours,revision:1,settings:{timezone:'Europe/Moscow'},products:[],dishes:[],batches:[],deliveries:[delivery],orders:[],movements:[],totals:{deliveries:1}};
      await route.fulfill({json:body});
    });
    await page.goto('/deliveries');await page.getByRole('tab',{name:'Проведённые поставки'}).click();
    await expect(page.getByTestId('current-time')).toContainText(demoOffsetHours?'08:00:45':'00:00:45');
    await expect(page.getByTestId('current-time')).toContainText('Europe/Moscow');
    await expect(page.locator('.revision')).toContainText('Проверено 00:00:45');
    await expect(page.locator('tbody tr').first()).toContainText(demoOffsetHours?'08:00':'00:00');
    if(demoOffsetHours) {
      await expect(page.locator('.topbar').getByTestId('demo-time')).toContainText('Время демо');
      await expect(page.getByTestId('demo-time')).toContainText('08:00');
      await expect(page.getByTestId('demo-time')).toContainText('(+8 ч)');
    } else {
      await expect(page.getByTestId('demo-time')).toContainText('00:00');
      await expect(page.getByTestId('demo-time')).not.toContainText('(+0 ч)');
    }
    await page.clock.fastForward(60000);
    await expect(page.getByTestId('current-time')).toContainText(demoOffsetHours?'08:01:45':'00:01:45');
    await expect(page.locator('.date-line')).not.toContainText('Демо-режим');
    await expect(page.locator('.date-line')).not.toContainText('Время демо');
    for(const width of [280,390,1440]){
      await page.setViewportSize({width,height:960});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  });
}
