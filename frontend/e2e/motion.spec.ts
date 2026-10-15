import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type {Cookie} from '@playwright/test';

test.skip(process.env.FLAGMAN_DEMO!=='true','Requires an isolated demo database');
let cookies: Cookie[];
test.beforeAll(async({request})=>{
  const headers={'X-Requested-With':'Flagman'};
  expect((await request.post('/api/login',{headers,data:{login:'manager',password:process.env.FLAGMAN_PASSWORD}})).ok()).toBe(true);
  cookies=(await request.storageState()).cookies;
  expect((await request.post('/api/demo/seed',{headers})).ok()).toBe(true);
});
test.beforeEach(async({page})=>{
  await page.context().addCookies(cookies);
  await page.goto('/overview');await expect(page.getByRole('heading',{name:'Обзор кухни',exact:true})).toBeVisible({timeout:30000});
});

test('long dialogs scroll inside their frame and keep footer controls reachable',async({page})=>{
  for(const width of [390,768,1440]){
    await page.setViewportSize({width,height:720});
    const opener=page.getByRole('button',{name:'Принять поставку',exact:true}).first();
    await opener.click();
    const dialog=page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('data-phase','open');
    await dialog.getByRole('button',{name:'Добавить строку'}).click();
    const scroll=dialog.locator('.dialog-scroll');
    const geometry=await scroll.evaluate(node=>{
      const frame=node.parentElement!.getBoundingClientRect();
      const content=node.getBoundingClientRect();
      return {overflows:node.scrollHeight>node.clientHeight,inside:content.top>=frame.top&&content.bottom<=frame.bottom&&content.right<=frame.right,horizontalOverflow:node.scrollWidth>node.clientWidth};
    });
    expect(geometry).toEqual({overflows:true,inside:true,horizontalOverflow:false});
    await scroll.hover();await page.mouse.wheel(0,500);
    await expect.poll(()=>scroll.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
    const save=dialog.getByRole('button',{name:'Сохранить',exact:true});
    await save.focus();await expect(save).toBeInViewport();
    await scroll.evaluate(node=>node.scrollTop=0);
    await page.screenshot({path:`../test-results/motion/dialog-scroll-${width}.png`});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test('native dialogs keep modality during exit, ignore child events, restore focus; 20 cycles',async({page})=>{
  const opener=page.getByRole('button',{name:'Принять поставку',exact:true}).first();
  const dialog=page.locator('dialog');
  for(let i=0;i<20;i++){
    await opener.click();await expect(dialog).toHaveAttribute('open','');
    if(i===0){
      await dialog.evaluate(node=>{node.style.animationDuration='2s';node.style.animationPlayState='paused';});
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveAttribute('data-phase','exiting');
      expect(await dialog.evaluate(node=>node.matches(':modal'))).toBe(true);
      await dialog.locator('h2').evaluate(node=>node.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'motion-exit'})));
      await expect(dialog).toHaveCount(1);
      await page.emulateMedia({reducedMotion:'reduce'});
    }else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
  }
  expect(await page.evaluate(()=>document.querySelectorAll(':modal').length)).toBe(0);
});

test('Combobox Escape stays inside dialog; exit is inaccessible and reopening cancels old exit',async({page})=>{
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  const combo=page.getByRole('combobox',{name:'Как указан срок годности',exact:true});
  await combo.click();await expect(combo).toHaveAttribute('aria-expanded','true');
  await page.locator('.select-options').evaluate(node=>{node.style.animationDuration='2s';node.style.animationPlayState='paused';});
  await page.keyboard.press('Escape');await expect(combo).toHaveAttribute('aria-expanded','false');
  await expect(page.locator('.select-options')).toHaveAttribute('inert','');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await combo.click();await expect(combo).toHaveAttribute('aria-expanded','true');
  await page.locator('.select-options').evaluate(node=>node.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'motion-small-exit'})));
  await expect(combo).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('End');await page.keyboard.press('Enter');
  await expect(page.getByLabel('Дата и время истечения')).toBeVisible();
  await expect(page.locator('dialog')).toHaveAttribute('open','');
  await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
});

test('mobile exit keeps locks, reopening and desktop resize clear obsolete completion',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const opener=page.getByRole('button',{name:'Открыть навигацию'}),sidebar=page.locator('.sidebar');
  await opener.click();await expect(page.locator('.workspace')).toHaveAttribute('inert','');
  await sidebar.evaluate(node=>{node.style.animationDuration='2s';node.style.animationPlayState='paused';});
  await page.keyboard.press('Escape');await expect(sidebar).toHaveAttribute('data-phase','exiting');
  await expect(page.locator('.workspace')).toHaveAttribute('inert','');
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  await opener.dispatchEvent('click');await expect(sidebar).toHaveAttribute('data-phase','entering');
  await sidebar.evaluate(node=>node.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'motion-nav-exit'})));
  await expect(opener).toHaveAttribute('aria-expanded','true');
  await page.setViewportSize({width:1024,height:844});
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert','');
  await expect(sidebar).not.toHaveAttribute('inert','');
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
  await expect(page.locator('.nav-scrim')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});await expect(sidebar).toHaveAttribute('inert','');
  await opener.click();await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});
  await expect(opener).toBeFocused();await expect(page.locator('.workspace')).not.toHaveAttribute('inert','');
});

test('mobile settings transfer focus into native dialog and then to visible menu trigger',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Открыть навигацию'}).click();await page.locator('.profile').click();
  await expect(page.locator('dialog')).toHaveAttribute('open','');
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert','');
  expect(await page.locator('dialog').evaluate(node=>node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Открыть навигацию'})).toBeFocused();
});

test('new dialog replaces a closing instance; missing effects close immediately',async({page})=>{
  const opener=page.getByRole('button',{name:'Принять поставку',exact:true}).first();
  await opener.click();
  await page.locator('dialog').evaluate(node=>{node.style.animationDuration='2s';node.style.animationPlayState='paused';(window as any).oldDialog=node;});
  await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveAttribute('data-phase','exiting');
  await opener.dispatchEvent('click');
  await page.evaluate(()=>(window as any).oldDialog.dispatchEvent(new AnimationEvent('animationend',{animationName:'motion-exit'})));
  await expect(page.locator('dialog')).toHaveAttribute('open','');
  await expect(page.locator('dialog')).not.toHaveAttribute('data-phase','exiting');
  await page.locator('dialog').evaluate(node=>node.style.animation='none');
  await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('forced session exit clears mobile scroll locks and native top layer',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Открыть навигацию'}).click();
  await expect(page.locator('.workspace')).toHaveAttribute('inert','');
  await page.getByRole('button',{name:'Выйти',includeHidden:true}).dispatchEvent('click');
  await expect(page.getByLabel('Пароль')).toBeVisible();
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
  expect(await page.evaluate(()=>document.querySelectorAll(':modal, [inert]').length)).toBe(0);
});

test('busy save cannot close or resubmit; result is reported before visual exit',async({page})=>{
  let release!:()=>void,requests=0;
  const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/settings',async route=>{
    if(route.request().method()!=='PUT')return route.continue();
    requests++;await gate;await route.continue();
  });
  await page.locator('.profile').click();const dialog=page.locator('dialog');
  await dialog.evaluate(node=>{node.style.animationDuration='2s';node.style.animationPlayState='paused';});
  await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Сохраняем…'})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(dialog).toHaveAttribute('open','');
  await dialog.locator('form').evaluate(form=>form.requestSubmit());
  release();await expect(page.getByText('Настройки обновлены')).toBeVisible();
  await expect(dialog).toHaveAttribute('data-phase','exiting');expect(requests).toBe(1);
  expect(await dialog.evaluate(node=>node.matches(':modal'))).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});await expect(dialog).toHaveCount(0);
});

test('toast replacement survives obsolete exit and restarts 6500ms lifetime',async({page})=>{
  await page.goto('/generator');await expect(page.locator('.date-line')).toBeVisible();
  await page.route('**/api/demo/time',route=>route.fulfill({status:400,json:{error:'Первое сообщение'}}));
  await page.getByRole('button',{name:'Перевести время'}).click();await expect(page.getByRole('status')).toContainText('Первое сообщение');
  await page.locator('.toast').evaluate(node=>{node.style.animationDuration='2s';node.style.animationPlayState='paused';});
  await page.getByRole('button',{name:'Закрыть сообщение'}).click();
  await expect(page.locator('.toast')).toHaveAttribute('data-phase','exiting');
  await page.unroute('**/api/demo/time');await page.route('**/api/demo/time',route=>route.fulfill({status:400,json:{error:'Новое сообщение'}}));
  await page.getByRole('button',{name:'Перевести время'}).click();await expect(page.getByRole('status')).toContainText('Новое сообщение');
  await page.locator('.toast').evaluate(node=>node.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'motion-exit'})));
  await expect(page.getByRole('status')).toContainText('Новое сообщение');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.toast')).toHaveCount(0,{timeout:8500});
});

test('replacement toast owns a fresh 6500ms timer',async({page})=>{
  await page.goto('/generator');await expect(page.locator('.date-line')).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
  let message=0;
  await page.route('**/api/demo/time',route=>route.fulfill({status:400,json:{error:`Таймер ${++message}`}}));
  await page.getByRole('button',{name:'Перевести время'}).click();await expect(page.getByRole('status')).toContainText('Таймер 1');
  await page.clock.fastForward(6000);
  await page.getByRole('button',{name:'Перевести время'}).click();await expect(page.getByRole('status')).toContainText('Таймер 2');
  await page.clock.fastForward(1000);await expect(page.getByRole('status')).toContainText('Таймер 2');
  await page.clock.fastForward(5499);await expect(page.locator('.toast')).toHaveCount(1);
  await page.clock.fastForward(1);await expect(page.locator('.toast')).toHaveCount(0);
});

test('SSE preserves form values and section identity; same-page navigation and search do not replay motion',async({page})=>{
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  await page.getByLabel('Номер поставки').fill('SSE motion value');
  await page.locator('.section-motion').evaluate(node=>{node.setAttribute('data-check','same');node.addEventListener('animationstart',()=>node.setAttribute('data-replayed','true'));});
  const before=await page.locator('.revision').textContent();
  expect((await page.request.post('/api/products',{headers:{'X-Requested-With':'Flagman'},data:{id:'motion-'+Date.now(),name:'Motion SSE',unit:'g'}})).ok()).toBe(true);
  await expect(page.locator('.revision')).not.toHaveText(before!);
  await expect(page.getByLabel('Номер поставки')).toHaveValue('SSE motion value');
  await expect(page.locator('.section-motion')).toHaveAttribute('data-check','same');
  await expect(page.locator('.section-motion')).not.toHaveAttribute('data-replayed','true');
  await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button',{name:'Обзор кухни',exact:true}).click();
  await expect(page.locator('.section-motion')).toHaveAttribute('data-check','same');
  await page.getByRole('navigation').getByRole('button',{name:'Склад и партии',exact:true}).click();
  await page.locator('.section-motion').evaluate(node=>node.setAttribute('data-check','stock'));
  await page.getByPlaceholder('Продукт, партия или ID поставки…').fill('томат');
  await expect(page.locator('.section-motion')).toHaveAttribute('data-check','stock');
  await page.goBack();await expect(page.getByRole('heading',{name:'Обзор кухни',exact:true})).toBeVisible();
  await expect(page.locator('.section-motion')).not.toHaveAttribute('data-check','stock');
});

test('axe on open dialog/list, closed dialog and mobile navigation with reduced motion',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const audit=async()=>expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
  await page.getByRole('combobox',{name:'Продукт',exact:true}).click();await audit();
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);await audit();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Открыть навигацию'}).click();await audit();
  await page.locator('.nav-scrim').click({position:{x:380,y:400}});await expect(page.locator('.workspace')).not.toHaveAttribute('inert','');
});

test('batch, delivery and order history retain native modality and return focus',async({page})=>{
  for(const route of ['stock','deliveries','orders']){
    await page.emulateMedia({reducedMotion:'no-preference'});
    const history=page.waitForResponse(response=>response.url().includes(`/api/history/${route==='stock'?'batches':route}?`)&&response.status()===200);
    await page.goto('/'+route);if(route==='deliveries')await page.getByRole('tab',{name:'Проведённые поставки'}).click();await expect(page.locator('.date-line')).toBeVisible();await history;
    const first=page.locator('tbody button').first();await expect(first).toBeVisible();
    const opener=first;await opener.click();
    const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'История операции'})).toBeVisible();
    await expect(dialog.getByRole('heading',{name:'Происхождение партий'})).toBeVisible();
    await dialog.evaluate(node=>{node.style.animationDuration='2s';node.style.animationPlayState='paused';});
    await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();
    await expect(dialog).toHaveAttribute('data-phase','exiting');
    expect(await dialog.evaluate(node=>node.matches(':modal'))).toBe(true);
    await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('dialog')).toHaveCount(0);await expect(opener).toBeFocused();
  }
});

test.describe('touch input',()=>{
  test.use({hasTouch:true,viewport:{width:390,height:844}});
  test('tap navigation, route and dialog controls',async({page})=>{
    await page.getByRole('button',{name:'Открыть навигацию'}).tap();
    await page.getByRole('navigation').getByRole('button',{name:'Поставки',exact:true}).tap();
    await expect(page.locator('.workspace')).not.toHaveAttribute('inert','');
    await expect(page.getByRole('heading',{name:'Поставки',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Принять поставку',exact:true}).first().tap();
    await page.getByRole('combobox',{name:'Как указан срок годности',exact:true}).tap();
    await page.getByRole('option',{name:'Дата на упаковке',exact:true}).tap();
    await expect(page.getByLabel('Срок годности без времени')).toBeVisible();
    await page.screenshot({path:'../test-results/motion/touch-mobile-dialog.png'});
    await page.getByRole('button',{name:'Закрыть форму'}).tap();await expect(page.locator('dialog')).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
});
