const {test,expect}=require('@playwright/test');
for (const width of [1366,820,390]) for (const theme of ['light','dark']) {
 test(`status keeps an open panel steady at ${width}px ${theme}`,async({page,request})=>{
  await page.setViewportSize({width,height:844});
  await page.emulateMedia({reducedMotion:'no-preference',colorScheme:theme});
  const albums=await (await request.get('/api/albums')).json();
  const album=albums.find(a=>a.title==='Concrete Orchard');
  await request.patch('/api/albums/'+album.id,{data:{status:'Want to hear'}});
  await page.goto('/');
  await page.locator('.card').filter({hasText:'Concrete Orchard'}).click();
  await page.locator('.panel').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
  await page.evaluate(()=>{
   window.motionProbe={panel:document.querySelector('.panel'),art:document.querySelector('.detail__art'),animations:[]};
   document.addEventListener('animationstart',e=>window.motionProbe.animations.push(e.animationName));
  });
  let release;const blocked=new Promise(r=>release=r);
  await page.route('**/api/albums/*',async route=>{if(route.request().method()==='PATCH')await blocked;await route.continue();});
  await page.locator('.detail input[value="Listening"]').check();
  await expect(page.locator('.detail')).toHaveAttribute('aria-busy','true');
  const steady=()=>page.evaluate(()=>({panel:window.motionProbe.panel===document.querySelector('.panel'),art:window.motionProbe.art===document.querySelector('.detail__art'),opacity:getComputedStyle(document.querySelector('.panel')).opacity}));
  expect(await steady()).toEqual({panel:true,art:true,opacity:'1'});
  await expect(page.locator('.detail .sleeve')).toHaveAttribute('data-status','Want to hear');
  release();await expect(page.getByText('Marked as Listening.')).toBeVisible();
  expect(await steady()).toEqual({panel:true,art:true,opacity:'1'});
  await expect(page.locator('.detail .sleeve')).toHaveAttribute('data-status','Listening');
  expect(await page.evaluate(()=>window.motionProbe.animations.filter(n=>['panel-in','fade-in'].includes(n)))).toEqual([]);
  await expect(page.locator('.detail input[value="Listening"]')).toBeFocused();
  // Real reverse mutation also preserves the surface, not only the first save.
  await page.unroute('**/api/albums/*');
  await page.locator('.detail input[value="Want to hear"]').check();
  await expect(page.getByText('Marked as Want to hear.')).toBeVisible();
  expect(await steady()).toEqual({panel:true,art:true,opacity:'1'});
  await page.route('**/api/albums/*',route=>route.request().method()==='PATCH'
   ?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'server',message:'Try again.'}})})
   :route.continue());
  await page.locator('.detail input[value="Listening"]').click();
  await expect(page.getByText('Status not changed. Try again.')).toBeVisible();
  expect(await steady()).toEqual({panel:true,art:true,opacity:'1'});
  await expect(page.locator('.detail .sleeve')).toHaveAttribute('data-status','Want to hear');
 });
}
