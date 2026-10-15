import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {chooseOption} from './helpers';
test.skip(process.env.FLAGMAN_DEMO!=='true','Uses a dedicated demo database');
test('design: responsive pages, accessible forms, settings and keyboard navigation',async({page})=>{
  test.setTimeout(180000);
  const failures:string[]=[];
  page.on('pageerror',error=>failures.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button',{name:'Открыть кухню'})).toBeVisible();
  const audit=async()=>{
    // Axe must measure final colours, rather than a frame of the page/dialog fade-in.
    await page.evaluate(async()=>{
      const finite=document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime));
      await Promise.all(finite.map(a=>a.finished.catch(()=>{})));
    });
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    if(result.violations.length)await test.info().attach('accessibility-violations',{body:JSON.stringify({url:page.url(),violations:result.violations},null,2),contentType:'application/json'});
    expect(result.violations.map(v=>`${v.id}: ${v.nodes.map(n=>n.target).join(', ')}`)).toEqual([]);
  };
  await audit();
  await page.getByLabel('Пароль').fill(process.env.FLAGMAN_PASSWORD!);
  await page.getByRole('button',{name:'Открыть кухню'}).click();
  await expect(page.locator('.date-line')).toBeAttached();
  if(await page.getByRole('button',{name:'Загрузить демо'}).isVisible()){
    await page.getByRole('button',{name:'Загрузить демо'}).click();
    await expect(page.getByText('Демонстрационный склад готов')).toBeVisible();
  }
  for(const width of [280,320,390,768,1024,1440]){
    await page.setViewportSize({width,height:960});
    for(const route of ['overview','stock','menu','orders','deliveries','stop','offers','analytics','expiry','procurement','forecast','generator']){
      await page.goto('/'+route);await expect(page.locator('.date-line')).toBeAttached();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} @ ${width}`).toBe(true);
      if(width===1440)await audit();
    }
    await page.goto('/overview');await expect(page.locator('.date-line')).toBeAttached();
    if(width===390||width===1440)await page.screenshot({path:`../test-results/redesign/overview-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Принять поставку',exact:true}).first().click();
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),`delivery @ ${width}`).toBe(true);
    await expect(dialog.getByLabel('Дата производства (необязательно)')).not.toBeVisible();
    const combo=dialog.getByRole('combobox',{name:'Как указан срок годности',exact:true});
    await combo.focus();await page.keyboard.press('Enter');await page.keyboard.press('End');await page.keyboard.press('Enter');
    await expect(dialog.getByLabel('Дата и время истечения')).toBeVisible();
    await combo.focus();await page.keyboard.press('Enter');await page.keyboard.press('Home');await page.keyboard.press('Enter');
    await expect(dialog.getByLabel('Срок хранения, часов')).toBeVisible();
    await combo.click();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(combo).toHaveAttribute('aria-expanded','false');
    if(width===1440)await audit();
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  }
  await page.setViewportSize({width:1440,height:960});
  await page.locator('.profile').click();const settings=page.getByRole('dialog');
  await expect(settings.getByLabel('Дополнительный запас, %')).not.toBeVisible();
  await settings.getByText('Расчёт закупок и прогнозов',{exact:true}).click();
  await settings.getByLabel('Дополнительный запас, %').fill('25');await audit();
  await settings.getByRole('button',{name:'Сохранить',exact:true}).click();
  await expect(page.getByText('Настройки обновлены')).toBeVisible();
  await page.locator('.profile').click();await settings.getByText('Расчёт закупок и прогнозов',{exact:true}).click();
  await expect(settings.getByLabel('Дополнительный запас, %')).toHaveValue('25');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#main-navigation')).toHaveAttribute('inert','');
  await page.getByRole('button',{name:'Открыть навигацию'}).click();
  await expect(page.locator('#main-navigation')).not.toHaveAttribute('inert','');
  await expect(page.locator('.workspace')).toHaveAttribute('inert','');
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Открыть навигацию'})).toBeFocused();
  await expect(page.locator('#main-navigation')).toHaveAttribute('inert','');
  await page.getByRole('button',{name:'Открыть навигацию'}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Поставки',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Поставки',exact:true})).toBeVisible();
  await expect(page.locator('.workspace')).not.toHaveAttribute('inert','');
  await page.emulateMedia({reducedMotion:'reduce'});
  expect(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(failures).toEqual([]);
});
