// Build and compare the real CMS forms and website pages with isolated fixtures.
// Requires the backend, website and eval workspace dependencies. No production reads or writes.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '../..');
const work = await fs.mkdtemp('/tmp/wareongo-cms-preview-e2e-');
const cms = path.join(work, 'cms'), site = path.join(work, 'site');
async function freePort() {
  const listener = http.createServer();
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
const cmsPort = await freePort(), sitePort = await freePort();
const cmsOrigin = `http://127.0.0.1:${cmsPort}`, siteOrigin = `http://127.0.0.1:${sitePort}`;
const write = (file, value) => fs.writeFile(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const rows = Array.from({ length: 63 }, (_, i) => ({ id: 1000 + i, city: i < 50 ? 'Bengaluru' : i < 58 ? 'Vijayawada' : 'Chhatrapati Sambhajinagar / Aurangabad',
  state: i < 50 ? 'Karnataka' : i < 58 ? 'Andhra Pradesh' : 'Maharashtra', visibility: true, address: `Preview warehouse ${i}`,
  micromarket: i < 25 ? ['Peenya'] : [], warehouseType: i < 50 ? 'PEB' : 'BTS', totalSpaceSqft: i < 50 ? [12000] : [1000],
  ratePerSqft: i < 50 ? '25' : '', clearHeightFt: i < 50 ? '30' : '', numberOfDocks: i < 50 ? '2' : '', flooringType: i < 50 ? 'VDF' : '',
  compliances: '', photos: [], photosWebp: [], images: [], otherSpecifications: '', warehouseData: { fireNocAvailable: false },
}));
const { default: prisma } = await import(path.join(root, 'WareOnGo-Website-Backend/models/prismaClient.js'));
const originalRead = prisma.warehouse.findMany;
const locationService = (await import(path.join(root, 'WareOnGo-Website-Backend/services/locationService.js'))).default;
const micromarketService = (await import(path.join(root, 'WareOnGo-Website-Backend/services/micromarketService.js'))).default;
let locations, markets;
async function refreshInventory() {
  prisma.warehouse.findMany = async () => rows;
  try {
    locations = await locationService.getLocations({ bypassCache: true });
    markets = await micromarketService.getMicromarkets({ bypassCache: true });
  } finally { prisma.warehouse.findMany = originalRead; }
}
await refreshInventory();
const buildMaxId = Math.max(...rows.map(row => row.id));
async function addFreshInventory() {
  rows.push(...Array.from({ length: 5 }, (_, i) => ({ ...rows[0], id: buildMaxId + i + 1, city: 'New City', micromarket: [], address: `New inventory ${i}` })));
  await refreshInventory();
}
const { fixtures, editorial, loader } = await import(path.join(root, 'wareongo-cms/tests/helpers/agent-cms.mjs'));
const ad = JSON.parse(await fs.readFile(path.join(root, 'wareongo-cms/content/ad-pages/bangalore.json'), 'utf8'));
const blog = { ...fixtures.blog.content, slug: 'preview-blog', title: 'Preview blog — title', seoTitle: 'Preview blog', status: 'PUBLISHED', related: ['preview-related'] };
const related = { ...blog, slug: 'preview-related', title: 'Related article title', related: [] };
const indexEntries = [blog, related].map((entry, i) => ({ id: i + 1, slug: entry.slug, title: entry.title, description: entry.description, updated: entry.dateModified, thumbnail: entry.thumbnail ?? null, sortOrder: i * 10 }));
const auditBlocks = [
 {kind:'h2',text:'Audit Section Heading'}, {kind:'h3',text:'Audit Subheading'},
 {kind:'p',text:'Audit paragraph **bold** and *italic*.'}, {kind:'ul',items:['Audit bullet one','Audit bullet two']},
 {kind:'ol',items:['Audit numbered one','Audit numbered two']},
 {kind:'table',table:{headers:['Audit header one','Audit header two'],rows:[['Audit cell one','Audit cell two']]}},
 ...[1,2,3,4].map(count=>({kind:'images',caption:`Audit collage ${count}`,images:Array.from({length:count},(_,i)=>({url:'https://example.test/audit.png',alt:`Audit image ${count}-${i}`,width:600,height:400}))}))
];
blog.blocks=auditBlocks; blog.faqs=[{q:'Audit FAQ question?',a:'Audit FAQ answer.'}];
blog.author='Audit Writer'; blog.thumbnail={url:'https://example.test/thumbnail.png',alt:'Audit thumbnail',width:600,height:400};
const service = { ...fixtures.service.content, slug: 'warehouse-search', keywords:['UNIQUE_SERVICE_KEYWORD_SENTINEL'],blocks:auditBlocks,faqs:blog.faqs };
const services=['warehouse-search','build-to-suit','lease-negotiation','compliance-procurement'].map(slug=>({...service,slug}));
const legal = { ...fixtures.legal.content, slug: 'privacy-policy', blocks:[...auditBlocks.slice(0,5),{kind:'p',text:'Audit compact paragraph',compact:true}],notice:'Audit closing notice.' };
const pageContent = { ...editorial, statOverrides: loader()('lib/editorial-schema.ts').NO_OVERRIDES, name: 'Bengaluru', h1: 'warehouses for rent — bengaluru', heroProse: 'Storage — with loading bays.',
  marketHeading:'Audit Market',marketProse:'Audit market paragraph.',corridorHeading:'Audit Localities',corridorProse:'Audit localities paragraph.',complianceHeading:'Audit Compliance',complianceProse:'Audit compliance paragraph.',inventoryHeading:'Audit Listings',faqs:blog.faqs,rentsHeading:'Audit Pricing',specHeading:'Audit Specification',rentsProse: 'Pricing paragraph.', specProse: 'Specification paragraph.', relatedBlogs: [related.slug], status: 'PUBLISHED' };
const pages = [
  { ...pageContent, kind: 'CITY', slug: 'bengaluru' },
  { ...pageContent, kind: 'CITY', name: 'Vijayawada', slug: 'vijayawada', h1: 'Vijayawada inventory' },
  { ...pageContent, kind: 'CITY', name: 'Aurangabad', slug: 'chhatrapati-sambhajinagar--aurangabad', h1: 'Aurangabad inventory' },
  { ...pageContent, kind: 'STATE', name: 'Karnataka', slug: 'karnataka', h1: 'Karnataka inventory', citiesHeading: 'Cities in Karnataka', stateCities: null },
];
const marketPage = { ...pageContent, slug: 'peenya', citySlug: 'bengaluru', h1: 'Peenya inventory' };
for (const [source, destination] of [['wareongo-cms', cms], ['wareongo-website', site]]) {
  await fs.cp(path.join(root, source), destination, { recursive: true, filter: file => !path.relative(path.join(root, source), file).split(path.sep).some(part => ['node_modules', '.git', '.next', 'dist', 'dist-ssr', '.vercel', '.vite-react-ssg-temp', 'output'].includes(part) || part.startsWith('.env')) });
  await fs.symlink(path.join(root, source, 'node_modules'), path.join(destination, 'node_modules'), 'dir');
}
await fs.mkdir(path.join(cms, 'public/fonts'), { recursive: true });
await fs.copyFile(path.join(site, 'src/assets/fonts/montserrat-v31-normal-latin.woff2'), path.join(cms, 'public/fonts/montserrat.woff2'));
const layout = path.join(cms, 'app/layout.tsx');
await write(layout, (await fs.readFile(layout, 'utf8')).replace("import { Montserrat } from 'next/font/google';", "import localFont from 'next/font/local';").replace(/Montserrat\(\{[\s\S]*?\}\)/, "localFont({ src: '../public/fonts/montserrat.woff2', weight: '100 900', variable: '--font-montserrat', display: 'swap' })"));
const fixtureDir = path.join(cms, 'app/(authed)/preview-check/[kind]');
await fs.mkdir(fixtureDir, { recursive: true });
await write(path.join(fixtureDir, 'data.json'), { ad, blog, indexEntries, service, services, legal, pages, marketPage, locations, markets });
await write(path.join(fixtureDir, 'page.tsx'), `
import AdPageForm from '@/components/AdPageForm';
import BlogForm from '@/components/BlogForm';
import ServiceForm from '@/components/ServiceForm';
import LegalForm from '@/components/LegalForm';
import EditorialForm from '@/components/EditorialForm';
import saved from './data.json';
export default async function Page({params}: {params: Promise<{kind:string}>}) {
 const {kind} = await params; const data: any = saved;
 const action = async () => { 'use server'; return {ok:false as const,error:'Fixture saves disabled'}; };
 const common = {action,deployable:false,expectedUpdatedAt:'2026-10-09T00:00:00Z',state:{hasDraft:false,staged:false,published:true}};
 const item = kind === 'sparse' ? data.pages[1] : kind === 'slug' ? data.pages[2] : kind === 'state' ? data.pages[3] : kind === 'micromarket' ? data.marketPage : data.pages[0];
 return <div className="mx-auto max-w-5xl p-6">
 {kind === 'ad' ? <AdPageForm {...common} content={data.ad} previewUrl="${siteOrigin}/preview/ad-pages/bangalore"/>
 : kind === 'blog' ? <BlogForm {...common} id={1} blog={data.blog} indexEntries={data.indexEntries} relatedOptions={[{slug:'preview-related',title:'Related article title'}]}/>
 : kind.startsWith('service') ? <ServiceForm {...common} content={data.services.find((s:any)=>s.slug===kind.slice(8))??data.service}/>
 : kind === 'legal' || kind === 'terms' ? <LegalForm {...common} content={{...data.legal,slug:kind === 'terms' ? 'terms-of-service' : 'privacy-policy'}}/>
 : <EditorialForm {...common} page={item} identity={{scope: kind === 'state' ? 'state' : kind === 'micromarket' ? 'micromarket' : 'city',slug:item.slug,citySlug:'bengaluru',parentLabel:'Karnataka'}} backHref="/" blogOptions={[]} inventory={data.markets.data} locationInventory={kind === 'state' ? data.locations.data.states : data.locations.data.cities} cityInventory={data.locations.data.cities}/>}
 </div>;
}`);
const generated = async (name, exported, values) => write(path.join(site, 'src/data', name), `export const ${exported}: any[] = ${JSON.stringify(values)};\n`);
await generated('locationPages.generated.ts', 'locationPages', pages);
await generated('micromarkets.generated.ts', 'micromarkets', [marketPage]);
await generated('blogs.generated.ts', 'blogs', [blog, related].map(p => ({ ...p, updated: p.dateModified })));
await generated('servicePages.generated.ts', 'servicePages', services);
await generated('blogSummaries.generated.ts', 'blogSummaries', [blog, related].map(({slug,title,description,dateModified})=>({slug,title,description,updated:dateModified})));
await generated('legalPages.generated.ts', 'legalPages', [legal, {...legal,slug:'terms-of-service'}]);
await generated('adPages.generated.ts', 'adPages', [ad]);
await write(path.join(site, 'src/data/warehouse-build.generated.json'), { maxId: buildMaxId });
const allowed = ['bangalore', 'preview/ad-pages/bangalore', 'preview/cms', 'blogs', 'blogs/:slug', 'services/:slug', 'privacy-policy', 'terms-of-service', 'overview/:state', 'overview/:state/:city', 'overview/:state/:city/:micromarket'];
const routesFile = path.join(site, 'src/routes.tsx');
const routes = (await fs.readFile(routesFile, 'utf8')).replace('export const routes: RouteRecord[] =', 'const allRoutes: RouteRecord[] =');
await write(routesFile, routes + `\nexport const routes: RouteRecord[] = allRoutes.map(root => ({ ...root, children: root.children?.map(wrapper => ({ ...wrapper, children: wrapper.children?.filter(route => ${JSON.stringify(allowed)}.includes(route.path ?? '')) })) }));\n`);
const configFile = path.join(site, 'vite.config.ts');
await write(configFile, (await fs.readFile(configFile, 'utf8')).replace('plugins: [react()]', `plugins: [react(), { name: 'test-clean-urls', configurePreviewServer(server) { server.middlewares.use((req, _res, next) => { const [pathname,query] = (req.url || '').split('?'); if (!pathname.includes('.') && !pathname.endsWith('/')) req.url = pathname + '/' + (query ? '?' + query : ''); next(); }); } }]`));
const api = http.createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json'); response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('X-Wareongo-Cache', 'bypass'); response.setHeader('X-Wareongo-Listing-Filters', '3');
  const url = new URL(request.url, 'http://localhost'), { pathname } = url;
  const inventory = rows.filter(row => !url.searchParams.has('maxId') || row.id <= Number(url.searchParams.get('maxId')));
  const page = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('pageSize') || 500);
  const body = pathname === '/locations' ? locations : pathname === '/micromarkets' ? markets : pathname === '/warehouses'
    ? { data: inventory.slice((page - 1) * size, page * size), pagination: { currentPage: page, totalPages: Math.ceil(inventory.length / size), totalItems: inventory.length, itemsPerPage: size } } : { data: [] };
  if (request.method !== 'GET') { response.writeHead(405); response.end('{}'); return; }
  response.end(JSON.stringify(body));
});
api.listen(0, '127.0.0.1'); await once(api, 'listening');
const apiOrigin = `http://127.0.0.1:${api.address().port}`;
const env = { ...process.env, NODE_ENV: 'production', DATABASE_URL: 'postgresql://test:test@127.0.0.1:9/unavailable', SESSION_SECRET: 'isolated-preview-test-secret-over-32-characters', CMS_ALLOWED_EMAILS: 'reviewer@example.test', WEBSITE_DEPLOY_HOOK_URL: '', WEBSITE_PREVIEW_ORIGIN: siteOrigin, NEXT_TELEMETRY_DISABLED: '1', VITE_API_BASE_URL: apiOrigin };
const log = await fs.open(path.join(work, 'build.log'), 'w'); const children = [];
const stop = () => { children.forEach(child => child.kill()); api.close(); };
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stop(); process.exit(0); });
async function run(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', log.fd, log.fd] }); children.push(child);
  const [code] = await once(child, 'exit'); if (code !== 0) { stop(); throw new Error('Build failed: ' + path.join(work, 'build.log')); }
}
try {
console.log('Building isolated fixture apps at ' + work);
await run([path.join(cms, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], cms);
console.log('CMS production build passed.');
await run([path.join(site, 'node_modules/vite-react-ssg/bin/vite-react-ssg.js'), 'build'], site);
await run(['scripts/stabilize-loader-data.mjs'], site);
console.log('Website production prerender passed.');
for (const [cwd, args] of [[cms, [path.join(cms, 'node_modules/next/dist/bin/next'), 'start', '-p', String(cmsPort), '-H', '127.0.0.1']], [site, [path.join(site, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(sitePort), '--strictPort', '--host', '127.0.0.1']]]) children.push(spawn(process.execPath, args, {cwd,env,stdio:['ignore',log.fd,log.fd]}));

for (const origin of [cmsOrigin, siteOrigin]) {
  const deadline = Date.now() + 30000;
  while (true) {
    try { await fetch(origin); break; } catch (error) { if (Date.now() > deadline) throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
await checkPreviews({work,cmsOrigin,siteOrigin,addFreshInventory});
} finally { stop(); await log.close(); }

async function checkPreviews(state) {
const { chromium, expect } = createRequire(path.join(root, 'wareongo-evals/package.json'))('@playwright/test');
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1900, height: 1100 }, reducedMotion: 'reduce' });
const payload = Buffer.from(JSON.stringify({ e: 'reviewer@example.test', n: 'Preview Reviewer' })).toString('base64url');
const signature = createHmac('sha256', 'isolated-preview-test-secret-over-32-characters').update(payload).digest('base64url');
await context.addCookies([{ name: 'cms_session', value: `${payload}.${signature}`, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
const errors = [], posts = [], requests = [], results = [], audit = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
context.on('request', request => { requests.push(request.url()); if (request.method() === 'POST') posts.push(request.url()); });
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname)) return route.abort();
  if (route.request().method() !== 'GET') return route.abort();
  return route.continue();
});
const cms = await context.newPage();
const publicPage = await context.newPage();
const cases = [
  ['city', '/overview/karnataka/bengaluru'], ['sparse', '/overview/andhra-pradesh/vijayawada'],
  ['slug', '/overview/maharashtra/chhatrapati-sambhajinagar--aurangabad'],
  ['state', '/overview/karnataka'], ['micromarket', '/overview/karnataka/bengaluru/peenya'],
  ['blog', '/blogs/preview-blog'], ['service', '/services/warehouse-search'], ['service-build-to-suit','/services/build-to-suit'], ['service-lease-negotiation','/services/lease-negotiation'], ['service-compliance-procurement','/services/compliance-procurement'], ['legal', '/privacy-policy'],
  ['terms', '/terms-of-service'], ['ad', '/bangalore'],
];
const selectedCase = process.argv.find(value => value.startsWith('--case='))?.slice(7);
assert.ok(!selectedCase || cases.some(([kind]) => kind === selectedCase), 'Unknown preview case');
async function frameReady() {
  const iframe = cms.locator('iframe');
  await expect(iframe).toHaveCount(1);
  await expect(iframe).toBeVisible({timeout:30000});
  const frame = await iframe.elementHandle().then(handle => handle.contentFrame());
  await expect(frame.locator('h1')).toBeVisible();
  return frame;
}
async function settled(page) {
  await page.evaluate(async () => { await document.fonts.ready; scrollTo(0, 0); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function metrics(page) {
  return page.evaluate(() => {
    const targets = ['h1', 'main', '#overview', '#listings', '#rents', '#specification', '#cities', '.bangalore-landing__hero', '.bangalore-landing__area-fit', '.bangalore-landing__rent-guide', '.bangalore-landing__services-grid', 'footer'];
    return targets.flatMap(selector => {
      const el = document.querySelector(selector); if (!el) return [];
      const r = el.getBoundingClientRect(), css = getComputedStyle(el);
      return [{selector,x:r.x,y:r.y+scrollY,width:r.width,height:r.height,font:css.fontFamily,size:css.fontSize}];
    });
  });
}
try {
  for (const [kind, routePath] of cases.filter(([kind]) => !selectedCase || kind === selectedCase)) {
    await cms.goto(`${state.cmsOrigin}/preview-check/${kind}`);
    console.log('Checking',kind);
    const editor=await cms.evaluate(()=>({
      sections:[...document.querySelectorAll('form h2,form h3,form details summary')].map(el=>({id:el.id||el.closest('details')?.id,text:el.textContent.trim()})),
      fields:[...document.querySelectorAll('form input:not([type=hidden]),form textarea,form select')].map(el=>({id:el.id,name:el.name,path:el.dataset.writingPath,label:el.labels?.[0]?.textContent||el.getAttribute('aria-label')}))
    }));
    audit.push({kind,editor});
    // Check the editor independently of preview/public parity: both pages sharing
    // a renderer cannot reveal controls that appear in the wrong reading order.
    const precedes = async (first, second) => assert.ok(await cms.locator(first).evaluate((el, selector) => Boolean(el.compareDocumentPosition(document.querySelector(selector)) & Node.DOCUMENT_POSITION_FOLLOWING), second), `${kind}: ${first} before ${second}`);
    if (kind === 'ad') {
      const order = ['hero','enquiry','featured','why','available','locations','areas','request','services','audiences','rent','faqs'];
      for (let i = 1; i < order.length; i++) await precedes(`#ad-section-${order[i-1]}`, `#ad-section-${order[i]}`);
      await expect(cms.locator('#ad-section-available summary')).toContainText('desktop only');
    } else if (['city','sparse','slug','micromarket'].includes(kind)) {
      await precedes('#heroProse', '#inventoryHeading');
      await precedes('#inventoryHeading', '#marketHeading');
      await precedes('[data-writing-path="faqs.0.q"]', '[data-editor-section="related"]');
    } else if (kind === 'state') {
      await precedes('#citiesHeading', '#inventoryHeading');
      await precedes('#inventoryHeading', '#rentsHeading');
    } else if (kind === 'blog') {
      await precedes('#title', '#author');
      await precedes('#author', '#summary');
      await precedes('[data-writing-path="faqs"]', 'section[aria-label="Related blogs"]');
    }
    await cms.locator('button').filter({hasText:/^Preview$/i}).click();
    for (const [device, width] of [['Desktop',1440],['Mobile',390]]) {
      await cms.getByRole('button', {name:new RegExp(`^${device} `)}).click();
      const frame = await frameReady();
      await expect.poll(() => frame.evaluate(() => innerWidth)).toBe(width);
      await publicPage.setViewportSize({width,height:device==='Mobile'?844:900});
      await publicPage.goto(state.siteOrigin+routePath);
      await expect(publicPage.locator('h1')).toBeVisible();
      await Promise.all([settled(frame),settled(publicPage)]);
      const [preview, live] = await Promise.all([metrics(frame),metrics(publicPage)]);
      assert.deepEqual(preview.map(m=>m.selector),live.map(m=>m.selector),`${kind} sections`);
      for (let i=0;i<preview.length;i++) {
        for (const key of ['x','y','width','height']) assert.ok(Math.abs(preview[i][key]-live[i][key])<=2,`${kind}/${device}: ${preview[i].selector}.${key}: ${preview[i][key]} vs ${live[i][key]}`);
        for (const key of ['font','size']) assert.equal(preview[i][key],live[i][key],`${kind}/${device}: ${key}`);
      }
      assert.equal(await frame.evaluate(()=>innerWidth),width);
      await expect(frame.locator('meta[name="robots"]')).toHaveAttribute('content',/noindex/);
      if (['city','sparse','state','micromarket'].includes(kind)) {
        await expect(frame.locator('#listings .warehouse-card')).toHaveCount(6);
        await expect(frame.locator('[aria-label="Related pages"]')).toContainText('Related Article Title');
      }
      if (kind === 'city') await expect(frame.locator('.city-corridor-table')).toHaveCount(1);
      if (kind === 'sparse') {
        await expect(frame.locator('.city-corridor-table')).toHaveCount(0);
        await expect(frame.locator('#rents figure')).toHaveCount(0);
        await expect(frame.locator('#specification tbody tr')).toHaveCount(0);
      }
      if (kind === 'blog') await expect(frame.locator('#blog-faq')).toHaveCount(1);
      const link = frame.locator('a[href="/request-warehouse"]').first();
      if (await link.count() && await link.isVisible()) { await link.click(); assert.ok(frame.url().includes('/preview/')); }
      await cms.locator('section[aria-label="Website preview"]').screenshot({path:`${state.work}/${kind}-${device.toLowerCase()}.png`});
      const rendered=await frame.evaluate(()=>({
        headings:[...document.querySelectorAll('main h1,main h2,main h3')].filter(el=>el.checkVisibility()).map(el=>({text:el.textContent.trim(),top:el.getBoundingClientRect().top+scrollY})).sort((a,b)=>a.top-b.top),
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
        visibleBody:document.body.innerText,
        imageCount:document.querySelectorAll('main img').length,
        keywordsInHead:document.head.innerHTML.includes('UNIQUE_SERVICE_KEYWORD_SENTINEL'),
        availableVisible:document.querySelector('#available-warehouses')?.checkVisibility()??null,
        legalCompactMargin:[...document.querySelectorAll('[data-legal-body] p')].find(el=>el.textContent==='Audit compact paragraph')?.className
      }));
      audit.find(item=>item.kind===kind)[device.toLowerCase()]=rendered;
      assert.equal(rendered.horizontalOverflow, false, `${kind}/${device}: no horizontal overflow`);
      if (kind.startsWith('service')) assert.equal(rendered.keywordsInHead, true, 'Service keywords reach WebPage metadata');
      results.push(`${kind}/${device}: layout, fonts, content and viewport matched`);
      console.log('PASS '+results.at(-1));
    }
    if (kind === 'legal') {
      const frame = await frameReady(); await frame.getByRole('button',{name:'Back',exact:true}).click();
      assert.ok(frame.url().includes('/preview/cms'));
    }
    if (kind === 'terms') {
      await cms.getByRole('tab',{name:'Edit',exact:true}).click();
      const toggle = cms.getByRole('checkbox', {name:'Compact spacing after paragraph 6'});
      await expect(toggle).toBeChecked();
      await toggle.uncheck();
      const blocks = JSON.parse(await cms.locator('input[name="blocks"]').inputValue());
      assert.equal('compact' in blocks[5], false);
      await cms.locator('button').filter({hasText:/^Preview$/i}).click();
      await expect((await frameReady()).getByText('Audit compact paragraph', {exact:true})).toHaveClass(/mb-4/);
      results.push('terms: compact paragraph spacing can be edited and previewed');
    }
    if (kind === 'blog') {
      await cms.getByRole('button',{name:/^Edit$/i}).click();
      await cms.locator('#title').fill('Unsaved Index Title');
      await cms.locator('#description').fill('Unsaved index card description');
      await cms.locator('#sortOrder').fill('30');
      await cms.locator('section[aria-labelledby="thumbnail-heading"]').getByRole('button',{name:'Remove',exact:true}).click();
      await cms.locator('button').filter({hasText:/^Preview$/i}).click();
      await cms.getByLabel('Preview view', {exact:true}).selectOption('index');
      const frame = await frameReady();
      await expect(frame.locator('[data-blog-slug]')).toHaveCount(2);
      assert.deepEqual(await frame.locator('[data-blog-slug]').evaluateAll(els => els.map(el=>el.dataset.blogSlug)), ['preview-related','preview-blog']);
      await expect(frame.locator('[data-blog-slug="preview-blog"]')).toContainText('Unsaved Index Title');
      await expect(frame.locator('[data-blog-slug="preview-blog"]')).toContainText('Unsaved index card description');
      const fallback = JSON.parse(await fs.readFile(path.join(root, 'wareongo-website/src/data/blogThumbnailFallbacks.json'), 'utf8'));
      await expect(frame.locator('[data-blog-slug="preview-related"] img')).toHaveAttribute('src', fallback[0].url);
      await expect(frame.locator('[data-blog-slug="preview-blog"] img')).toHaveAttribute('src', fallback[1].url);
      await cms.getByLabel('Preview view', {exact:true}).selectOption('page');
      await expect(frame.locator('h1')).toHaveText('Unsaved Index Title');
      results.push('blog: unsaved card copy and sort order reach the real index, then return to the article');
    }
    if (kind === 'city') {
      await cms.getByRole('button',{name:/^Edit$/i}).click();
      await cms.locator('[name="h1"]').fill('private heading — pending approval');
      await cms.locator('button').filter({hasText:/^Preview$/i}).click();
      const frame=await frameReady();
      await expect(frame.locator('h1')).toHaveText('Private Heading: Pending Approval');
      assert.ok(!requests.some(url=>url.includes('private heading')||url.includes('pending%20approval')));
      await cms.evaluate(origin=>document.querySelector('iframe').contentWindow.postMessage({type:'wareongo:cms-preview',action:'content',content:{type:'city',content:{}}},origin),state.siteOrigin);
      await expect(cms.getByRole('button',{name:'Retry preview'})).toBeVisible();
      await cms.getByRole('button',{name:'Retry preview'}).click();
      await expect((await frameReady()).locator('h1')).toHaveText('Private Heading: Pending Approval');
      results.push('city: unsaved edits survive invalid preview and retry');
    }
    if (kind === 'ad') {
      await cms.getByRole('button',{name:'Edit content',exact:true}).click();
      for (const group of ['areas','rent','faqs','services','why','audiences','locations']) await cms.locator(`#ad-section-${group} summary`).click();
      const editedPhotos = ['doddaballapur','bidadi','sarjapur','north-bangalore','indiranagar','marathalli','jp-nagar','hsr'];
      for (const slot of editedPhotos) await cms.locator(`[data-image-slot="micromarket-${slot}"] input:not([type=file])`).fill(`Private ${slot} image`);
      await cms.locator('#area-highway-belts-0-need').fill('Private area requirement');
      await cms.locator('#rent-intro').fill('Private rent introduction');
      await cms.locator('#faq-0-a').fill('Private FAQ answer');
      await cms.locator('#service-find-warehouse-mobileTitle').fill('Private Mobile Service');
      await cms.locator('#service-find-warehouse-mobileBody').fill('Unique mobile service description');
      await cms.locator('#service-find-warehouse-body').fill('Unique desktop service description');
      await cms.locator('#benefit-local-body').fill('Unique desktop benefit description');
      await cms.locator('#benefit-local-mobileBody').fill('Unique **mobile benefit** description');
      await cms.locator('#audience-3pls-body').fill('Unique desktop audience description');
      await cms.locator('#audience-3pls-mobileTitle').fill('Mobile Audience');
      await cms.locator('#audience-3pls-mobileBody').fill('Unique **mobile audience** description');
      await cms.locator('button').filter({hasText:/^Preview$/i}).click();
      await cms.getByRole('button',{name:/^Mobile /}).click();
      const frame=await frameReady();
      await expect(frame.locator('.bangalore-landing__area-fit')).toContainText('Private area requirement');
      await expect(frame.locator('.bangalore-landing__rent-guide')).toContainText('Private rent introduction');
      await expect(frame.locator('.bangalore-landing__faq')).toContainText('Private FAQ answer');
      await expect(frame.locator('.bangalore-landing__service-mobile-copy').first()).toHaveText('Private Mobile Service');
      for (const [scope, slots] of [['Warehouse Belts',editedPhotos.slice(0,3)],['City Areas',editedPhotos.slice(3)]]) {
        await frame.getByRole('button',{name:scope,exact:true}).click();
        for (const slot of slots) await expect(frame.locator(`img[alt="Private ${slot} image"]`)).toHaveCount(2);
      }
      await frame.getByRole('button',{name:'Warehouse Belts',exact:true}).click();
      await expect(frame.getByText('Unique mobile service description',{exact:true})).toBeVisible();
      await expect(frame.getByText('Unique desktop service description',{exact:true})).not.toBeVisible();
      for (const subject of ['benefit','audience']) {
        await expect(frame.getByText(`Unique mobile ${subject} description`,{exact:true})).toBeVisible();
        await expect(frame.getByText(`Unique desktop ${subject} description`,{exact:true})).not.toBeVisible();
        await expect(frame.locator('strong').filter({hasText:`mobile ${subject}`})).toBeVisible();
      }
      await cms.getByRole('button',{name:/^Desktop /}).click();
      await expect(frame.getByText('Unique desktop service description',{exact:true})).toBeVisible();
      await expect(frame.getByText('Unique mobile service description',{exact:true})).not.toBeVisible();
      for (const subject of ['benefit','audience']) {
        await expect(frame.getByText(`Unique desktop ${subject} description`,{exact:true})).toBeVisible();
        await expect(frame.getByText(`Unique mobile ${subject} description`,{exact:true})).not.toBeVisible();
      }
      audit.find(item=>item.kind==='ad').serviceDescriptionSwitch=true;
      results.push('Bangalore: area, rent, FAQ, mobile heading and mobile description reach the real page');
      await frame.locator('#bangalore-name').fill('Preview only');
      await frame.locator('#bangalore-companyName').fill('Preview company');
      await frame.locator('#bangalore-phone').fill('9999999999');
      await frame.locator('#bangalore-enquiry button[type="submit"]').click();
      await expect(frame.locator('#bangalore-name')).toHaveValue('Preview only');
      await expect(frame.locator('.bangalore-landing__enquiry-success')).toHaveCount(0);
      await cms.bringToFront();
      await cms.getByRole('button',{name:'Full screen',exact:true}).click();
      await expect(cms.getByRole('button',{name:'Exit full screen'})).toBeVisible();
      await cms.getByRole('button',{name:'Exit full screen'}).click();
      results.push('Bangalore: form submission blocked and full screen controls work');
      for (const [view, selector, text] of [
        ['hero-success','.bangalore-landing__enquiry-success',ad.copy.enquirySuccessHeading],
        ['contact','[role="dialog"]',ad.copy.contactHeading],
        ['contact-success','[role="status"]',ad.copy.contactSuccess],
      ]) {
        await cms.getByLabel('Preview state',{exact:true}).selectOption(view);
        await expect(frame.locator(selector).filter({hasText:text}).first()).toBeVisible();
      }
      await cms.getByLabel('Preview state',{exact:true}).selectOption('page');
      await expect(frame.locator('.bangalore-landing__enquiry-success')).toHaveCount(0);
      await expect(frame.locator('[role="dialog"]')).toHaveCount(0);
      await expect(frame.getByText(ad.copy.contactSuccess,{exact:true})).not.toBeVisible();
      results.push('Bangalore: all three interaction states preview without sending a lead');
    }
  }
  await state.addFreshInventory();
  await cms.goto(`${state.cmsOrigin}/preview-check/city`);
  await cms.locator('button').filter({hasText:/^Preview$/i}).click();
  const freshFrame = await frameReady();
  await cms.evaluate(({origin,content}) => document.querySelector('iframe').contentWindow.postMessage({type:'wareongo:cms-preview',action:'content',content},origin), {
    origin: state.siteOrigin, content: { type:'city', content: {...pageContent, kind:'CITY', slug:'new-city', name:'New City', h1:'New city inventory'} },
  });
  await expect(freshFrame.locator('h1')).toHaveText('New City Inventory');
  await expect(freshFrame.locator('#listings .warehouse-card')).toHaveCount(5);
  results.push('inventory: a city added after the website build previews all five new listings');

  const token = Buffer.from('{"alg":"none"}').toString('base64url') + '.'
    + Buffer.from('{"name":"Website User","role":"user"}').toString('base64url') + '.test';
  await publicPage.setViewportSize({width:1440,height:900});
  await publicPage.goto(state.siteOrigin+'/blogs/preview-blog');
  await publicPage.evaluate(value => localStorage.setItem('authToken',value), token);
  await publicPage.reload();
  await expect(publicPage.getByRole('button',{name:'Your account'})).toBeVisible();
  for (const kind of ['blog','ad']) {
    for (const stored of [token,'invalid-token']) {
      await publicPage.evaluate(value => localStorage.setItem('authToken',value), stored);
      await cms.goto(`${state.cmsOrigin}/preview-check/${kind}`);
      await cms.locator('button').filter({hasText:/^Preview$/i}).click();
      const frame = await frameReady();
      await expect(frame.getByRole('button',{name:'Your account'})).toHaveCount(0);
      await expect(frame.getByRole('button',{name:'Logout',exact:true})).toHaveCount(0);
      assert.equal(await frame.evaluate(() => localStorage.getItem('authToken')),stored);
      assert.equal(await publicPage.evaluate(() => localStorage.getItem('authToken')),stored);
      results.push(`${kind}: guest preview preserves ${stored === token ? 'valid' : 'invalid'} website credentials`);
    }
  }
  await publicPage.evaluate(value => localStorage.setItem('authToken',value), token);
  await publicPage.reload();
  await expect(publicPage.getByRole('button',{name:'Your account'})).toBeVisible();
  const direct = await context.newPage();
  await direct.goto(state.siteOrigin+'/preview/cms');
  await expect(direct.locator('h1')).toHaveCount(0);
  await direct.evaluate(()=>window.postMessage({type:'wareongo:cms-preview',action:'content',content:{type:'blog',content:{title:'Injected'}}},'*'));
  await expect(direct.locator('h1')).toHaveCount(0);
  assert.deepEqual(posts,[],'Preview must not submit requests');
  assert.deepEqual(errors,[],'Browser errors');
  results.push('preview privacy: no direct-page injection, POSTs, draft URLs or browser errors');
  await fs.writeFile(`${state.work}/results.json`,JSON.stringify({results,errors,posts,audit},null,2));
  console.log('All '+results.length+' checks passed. Artifacts: '+state.work);
} catch (error) { console.error('CMS URL', cms.url(), 'body', (await cms.locator('body').innerText()).slice(0,2500), 'errors', errors); await cms.screenshot({path:state.work+'/failure.png'}); throw error; } finally { await browser.close(); }

}
