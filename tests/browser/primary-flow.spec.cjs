const {test,expect}=require('@playwright/test');
const fill=async(page,title='Browser record')=>{await page.locator('#field-title').fill(title);await page.locator('#field-artist').fill('Test artist');await page.locator('#field-notes').fill('Literal <b>notes</b> 🎶');};
test('failed create preserves draft/list, pending deduplicates, retry commits despite failed refresh',async({page,request})=>{
 await page.goto('/');await expect(page.locator('.card')).toHaveCount(8);
 await page.locator('#add-album').click();await fill(page);
 let release;const blocked=new Promise(r=>release=r);let posts=0;
 await page.route('**/api/albums',async route=>{if(route.request().method()==='POST'){posts++;await blocked;await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'server',message:'Your changes are still here — try again.'}})});}else await route.continue();});
 await page.getByRole('button',{name:'Add to crate'}).click();await expect(page.getByRole('button',{name:'Saving…'})).toHaveAttribute('aria-disabled','true');
 await page.getByRole('button',{name:'Saving…'}).click({force:true});await expect(page.locator('#field-title')).toHaveAttribute('readonly','');await expect(page.getByText('Saving — fields and navigation are paused until this finishes.')).toBeVisible();
 release();await expect(page.locator('#error-summary')).toBeFocused();expect(posts).toBe(1);await expect(page.locator('#field-title')).toHaveValue('Browser record');await expect(page.locator('.card')).toHaveCount(8);
 await page.unroute('**/api/albums');
 await page.route('**/api/albums?*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'server',message:'Please try again.'}})}));
 await page.getByRole('button',{name:'Add to crate'}).click();await expect(page.locator('#detail-title')).toHaveText('Browser record');await expect(page.locator('.notes')).toHaveText('Literal <b>notes</b> 🎶');await expect(page.locator('.notes b')).toHaveCount(0);
 await page.getByRole('button',{name:'Edit details'}).click();await expect(page.locator('#field-title')).toHaveValue('Browser record');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.unroute('**/api/albums?*');await page.getByRole('button',{name:'Close and return to collection'}).click();await expect(page.locator('#add-album')).toBeFocused();
 await page.getByRole('button',{name:'Try again'}).click();await expect(page.locator('.card')).toHaveCount(9);
 const rows=await (await request.get('/api/albums')).json();await request.delete('/api/albums/'+rows.find(a=>a.title==='Browser record').id);
});
test('status failure restores chosen focus; editor draft survives redraw; delete commits on refresh failure',async({page,request})=>{
 await request.post('/api/albums',{data:{title:'Browser record',artist:'Test artist',status:'Want to hear',notes:''}});
 await page.goto('/');await page.locator('.card').filter({hasText:'Browser record'}).click();
 await page.route('**/api/albums/*',route=>route.request().method()==='PATCH'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'server',message:'Try again.'}})}):route.continue());
 await page.locator('.detail .status-switch__option').filter({hasText:'Heard'}).click();await expect(page.getByText('Status not changed. Try again.')).toBeVisible();await expect(page.locator('.detail input[value="Heard"]')).toBeFocused();
 await page.unroute('**/api/albums/*');await page.locator('.detail .status-switch__option').filter({hasText:'Heard'}).click();await expect(page.getByText('Marked as Heard.')).toBeVisible();
 await page.getByRole('button',{name:'Edit details'}).click();await page.locator('#field-notes').fill('Retained draft');await page.locator('#theme-toggle').click();await expect(page.locator('#field-notes')).toHaveValue('Retained draft');await page.getByRole('button',{name:'Save changes'}).click();await expect(page.locator('.notes')).toHaveText('Retained draft');
 await page.getByRole('button',{name:'Delete',exact:true}).click();await page.route('**/api/albums?*',route=>route.abort());await page.getByRole('button',{name:'Delete album',exact:true}).click();await expect(page.locator('#collection-title')).toBeFocused();await expect(page.locator('.card').filter({hasText:'Browser record'})).toHaveCount(0);await expect(page.locator('.card')).toHaveCount(8);
});
test('validation, combined filter, retained search focus, and stale edit',async({page,request})=>{
 await page.goto('/');await expect(page.locator('.card')).toHaveCount(8);await page.locator('#add-album').click();await page.getByRole('button',{name:'Add to crate'}).click();await expect(page.locator('#error-summary')).toBeFocused();await page.locator('#error-summary a').first().click();await expect(page.locator('#field-title')).toBeFocused();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.locator('#album-search').fill('orchard');await expect(page.locator('.card')).toHaveCount(1);await expect(page.locator('#album-search')).toBeFocused();await page.locator('.filter__option').filter({hasText:'Heard'}).click();await expect(page.locator('.card')).toHaveCount(0);await expect(page.locator('#live')).toContainText('0 of 8 records');
 await page.getByRole('button',{name:'Clear search',exact:true}).last().click();await page.locator('.filter__option').filter({hasText:'All'}).click();await expect(page.locator('.card')).toHaveCount(8);
 await page.locator('.card').first().click();const id=await page.locator('.card[aria-current="true"]').getAttribute('data-album-id');await page.getByRole('button',{name:'Edit details'}).click();await page.locator('#field-notes').fill('Draft after another tab deletes');await request.delete('/api/albums/'+id);await page.getByRole('button',{name:'Save changes'}).click();await expect(page.locator('#error-summary')).toBeFocused();await expect(page.locator('#field-notes')).toHaveValue('Draft after another tab deletes');await expect(page.locator('#error-summary')).toContainText('no longer');
});

test('pending status blocks arrows; failed refresh keeps committed status and collection order',async({page})=>{
 await page.goto('/');const before=await page.locator('.card').evaluateAll(nodes=>nodes.map(n=>n.dataset.albumId));
 await page.locator('.card').filter({hasText:'Concrete Orchard'}).click();
 let release;const blocked=new Promise(r=>release=r);
 await page.route('**/api/albums/*',async route=>{if(route.request().method()==='PATCH'){await blocked;await route.continue();}else await route.continue();});
 await page.locator('.detail .status-switch__option').filter({hasText:'Listening'}).click();
 const option=page.locator('.detail input[value="Listening"]');await expect(option).toHaveAttribute('aria-disabled','true');await option.press('ArrowRight');await expect(option).toBeChecked();
 await page.route('**/api/albums?*',route=>route.abort());release();await expect(page.getByText('Marked as Listening.')).toBeVisible();
 await expect(page.locator('.detail .sleeve')).toHaveAttribute('data-status','Listening');expect(await page.locator('.card').evaluateAll(nodes=>nodes.map(n=>n.dataset.albumId))).toEqual(before);
 await page.getByRole('button',{name:'Close and return to collection'}).click();await page.locator('.card').filter({hasText:'Concrete Orchard'}).click();await expect(page.locator('.detail .sleeve')).toHaveAttribute('data-status','Listening');
});
test('delete failure retains loaded content and confirmation focus, retry succeeds',async({page,request})=>{
 await request.post('/api/albums',{data:{title:'Delete retry record',artist:'Test artist',status:'Want to hear',notes:'Keep until confirmed'}});
 await page.goto('/');await page.locator('.card').filter({hasText:'Delete retry record'}).click();const before=await page.locator('.card').count();
 await page.getByRole('button',{name:'Delete',exact:true}).click();
 await page.route('**/api/albums/*',route=>route.request().method()==='DELETE'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'server',message:'Try again.'}})}):route.continue());
 await page.getByRole('button',{name:'Delete album',exact:true}).click();await expect(page.getByText('Not deleted. Try again.')).toBeVisible();await expect(page.locator('[data-confirm-delete]')).toBeFocused();await expect(page.locator('.card')).toHaveCount(before);await expect(page.locator('.notes')).toHaveText('Keep until confirmed');
 await page.unroute('**/api/albums/*');await page.getByRole('button',{name:'Delete album',exact:true}).click();await expect(page.locator('#collection-title')).toBeFocused();await expect(page.locator('.card')).toHaveCount(before-1);
});
test('phone keyboard stays in sheet and failed save returns focus after unlock',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#add-album').click();await fill(page,'Phone draft');
 await page.getByRole('button',{name:'Cancel',exact:true}).focus();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close and return to collection'})).toBeFocused();
 await page.route('**/api/albums',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{code:'server',message:'Try again.'}})}));
 await page.getByRole('button',{name:'Add to crate'}).click();await expect(page.locator('#error-summary')).toBeFocused();await expect(page.locator('#field-title')).toHaveValue('Phone draft');await expect(page.locator('#field-title')).not.toHaveAttribute('readonly','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.locator('#add-album')).toBeFocused();
});
