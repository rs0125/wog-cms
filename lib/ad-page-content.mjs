import defaults from '../content/ad-pages/bangalore.json' with { type: 'json' };

export const MAX_AD_PAGE_BYTES = 500000;
// Shared by the native validator and the AI writing schema export.
export const AD_TEXT_LIMIT = 20000;
export const AD_LIST_LIMIT = 30;
export const AD_HERO_STEP_COUNT = 4;
export const AD_REQUIRED_COPY_FIELDS = ['seoTitle', 'metaDescription', 'heroHeading', 'heroAccent', 'enquiryHeading', 'enquiryDescription', 'enquirySubmit', 'enquirySuccessHeading', 'enquirySuccessDescription', 'enquirySuccessCta', 'featuredHeading', 'availableHeading', 'filterAll', 'filterSmall', 'filterMedium', 'filterLarge', 'availableFooter', 'availableCta', 'locationsHeading', 'locationsCta', 'mapLabel', 'areaHeading', 'areaNeedHeading', 'areaLocationsHeading', 'whyHeading', 'requestHeading', 'requestDescription', 'requestCta', 'requestPhoneCta', 'servicesHeading', 'audiencesHeading', 'overviewHeading', 'statsHeading', 'statsLocationsHeading', 'statsRentHeading', 'statsInventoryHeading', 'statsSpecificationsHeading', 'statsCityHeading', 'contactHeading', 'contactDescription', 'contactSuccess'];
export const AD_REQUIRED_CARD_FIELDS = {
  benefits: ['title'], services: ['title', 'body', 'cta'], audiences: ['title', 'body', 'primaryCta'],
};

// Mirrored in the CMS and website build. Keep this contract and the import
// snapshot together; tests cover draft privacy and invalid build inputs.
export function parseAdPage(value, { draft = false } = {}) {
  const serialized = JSON.stringify(value);
  if (serialized && new TextEncoder().encode(serialized).byteLength > MAX_AD_PAGE_BYTES) throw new Error('The ad page is too large.');
  const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
  function read(input, example, path) {
    if (typeof example === 'string') {
      if (typeof input !== 'string' || input.length > AD_TEXT_LIMIT) fail(path, `Enter text up to ${AD_TEXT_LIMIT.toLocaleString('en-US')} characters.`);
      return input;
    }
    if (typeof example === 'number') {
      if (!Number.isFinite(input)) fail(path, 'Enter a valid number.');
      return input;
    }
    if (Array.isArray(example)) {
      if (!Array.isArray(input) || input.length > AD_LIST_LIMIT) fail(path, `Use at most ${AD_LIST_LIMIT} entries.`);
      return input.map((item, index) => read(item, example[0], `${path}.${index + 1}`));
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail(path, 'This section is missing.');
    // Pick only content fields. Database metadata and private revisions are
    // never copied into the public endpoint or generated website snapshot.
    return Object.fromEntries(Object.entries(example).map(([key, child]) => [key, read(input[key], child, path ? `${path}.${key}` : key)]));
  }
  // Add new template slots to older saved revisions without overwriting edits
  // or rewriting drafts/approved records in the database.
  let compatible = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const legacyBenefits = Array.isArray(value.benefits) && value.benefits.length === 3
      && value.benefits.every(item => ['verified', 'local', 'lease'].includes(item?.id));
    const images = value.images && typeof value.images === 'object' && !Array.isArray(value.images) && value.images.why === undefined
      ? { ...value.images, why: defaults.images.why } : value.images;
    compatible = {
      ...value,
      heroSteps: value.heroSteps === undefined ? defaults.heroSteps : value.heroSteps,
      benefits: legacyBenefits ? [...value.benefits, ...defaults.benefits.slice(3)] : value.benefits,
      images,
    };
  }
  const page = read(compatible, defaults, '');
  if (page.heroSteps.length !== AD_HERO_STEP_COUNT) fail('heroSteps', `Keep the ${AD_HERO_STEP_COUNT} process steps.`);
  if (page.version !== 1 || page.slug !== 'bangalore') fail('page', 'Unknown ad page or content version.');
  for (const group of ['benefits', 'services', 'audiences']) {
    const actual = page[group].map(item => item.id).sort();
    const expected = defaults[group].map(item => item.id).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(group, 'Keep the existing card identities.');
  }
  for (const [slot, image] of Object.entries(page.images)) {
    if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 10000 || image.height > 10000) fail(`images.${slot}`, 'Enter valid image dimensions.');
    if (!image.url && draft) continue;
    let safe = false;
    try {
      const url = new URL(image.url, 'https://wareongo.com');
      const local = image.url.startsWith('/') && !image.url.startsWith('//');
      safe = (local || image.url.startsWith('https://')) && url.protocol === 'https:' && !url.username && !url.password && !image.url.includes('\\') && !/[\u0000-\u0020]/.test(image.url);
    } catch { /* Report a field error below without echoing an invalid URL. */ }
    if (!safe) fail(`images.${slot}`, 'Choose a website image or an HTTPS image URL.');
    if (!draft && !image.alt.trim()) fail(`images.${slot}.alt`, 'Describe the image.');
  }
  if (!draft) {
    if (!page.name.trim()) fail('name', 'Add a page name.');
    for (const key of AD_REQUIRED_COPY_FIELDS) if (!page.copy[key].trim()) fail(`copy.${key}`, 'Add this text before saving for the next build.');
    if (page.heroSteps.some(step => !step.trim())) fail('heroSteps', 'Name each process step before saving for the next build.');
    for (const group of ['overviewStats']) {
      if (page[group].length < 1 || page[group].length > 8) fail(group, 'Use one to eight figures.');
      for (const item of page[group]) if (!item.value.trim() || !item.label.trim()) fail(group, 'Give every figure a value and label.');
    }
    if (!page.overviewParagraphs.length || page.overviewParagraphs.some(text => !text.trim())) fail('overviewParagraphs', 'Write the overview paragraphs.');
    if (!page.areaRows.length || page.areaRows.some(row => !row.need.trim() || !row.areas.length || row.areas.some(area => !area.trim()))) fail('areaRows', 'Complete each area recommendation.');
    const messages = { benefits: 'Give each benefit a title.', services: 'Complete each service card.', audiences: 'Complete each audience card.' };
    for (const [group, fields] of Object.entries(AD_REQUIRED_CARD_FIELDS)) {
      for (const item of page[group]) if (fields.some(field => !item[field].trim()) || (group === 'audiences' && item.id === '3pls' && !item.secondaryCta.trim())) fail(group, messages[group]);
    }
  }
  return page;
}

export function parseAdPages(value) {
  if (!Array.isArray(value) || value.length !== 1) throw new Error('The approved Bangalore ad page is missing.');
  return value.map(page => parseAdPage(page));
}
