const FLIPKART_BASE_URL = 'https://www.flipkart.com';
const FLIPKART_RESULTS_SELECTOR = 'div[data-id]';

function parsePrice(rawPrice) {
  if (!rawPrice || typeof rawPrice !== 'string') return null;
  const match = rawPrice.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  return Math.floor(Number(match[0]));
}

function parseRating(rawRating) {
  if (!rawRating || typeof rawRating !== 'string') return null;
  const match = rawRating.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  return Number(match[0]);
}

function absoluteUrl(href) {
  if (!href) return null;
  try {
    return new URL(href, FLIPKART_BASE_URL).toString();
  } catch {
    return null;
  }
}

async function textOrNull(locator) {
  try {
    if (await locator.count()) {
      const value = (await locator.first().innerText()).trim();
      return value || null;
    }
  } catch {
    return null;
  }
  return null;
}

async function attrOrNull(locator, attr) {
  try {
    if (await locator.count()) {
      const value = await locator.first().getAttribute(attr);
      return value ? value.trim() : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function extractFlipkartProduct(card) {
  const title =
    (await textOrNull(card.locator('a.s1Q9rs'))) ||
    (await textOrNull(card.locator('div.KzDlHZ'))) ||
    (await textOrNull(card.locator('a.IRpwTa'))) ||
    null;

  const rawPrice = await textOrNull(card.locator('div.Nx9bqj'));
  const rawRating = await textOrNull(card.locator('div.XQDdHH'));

  const href =
    (await attrOrNull(card.locator('a.CGtC98'), 'href')) ||
    (await attrOrNull(card.locator('a._1fQZEK'), 'href')) ||
    (await attrOrNull(card.locator('a.s1Q9rs'), 'href')) ||
    null;

  const image =
    (await attrOrNull(card.locator('img.DByuf4'), 'src')) ||
    (await attrOrNull(card.locator('img'), 'src')) ||
    null;

  const coupon =
    (await textOrNull(card.locator('div.UkUFwK span'))) ||
    (await textOrNull(card.locator('div._3Ay6Sb span'))) ||
    null;

  return {
    platform: 'Flipkart',
    title: title || 'Unavailable',
    price: parsePrice(rawPrice),
    rating: parseRating(rawRating),
    url: absoluteUrl(href),
    image: image || null,
    coupon: coupon || 'Unavailable'
  };
}

function commonUnavailable(query, message) {
  return { query, status: 'unavailable', message, products: [] };
}

async function scrapeFlipkartTop20(query, chromium, createContext) {
  const encodedQuery = encodeURIComponent(query.trim());
  const searchUrl = `${FLIPKART_BASE_URL}/search?q=${encodedQuery}&_t=${Date.now()}`;

  const browser = await chromium.launch({ headless: true });
  const context = await createContext(browser);
  const page = await context.newPage();

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    const closeBtn = page.locator('button._2KpZ6l._2doB4z');
    if (await closeBtn.count()) {
      await closeBtn.first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }

    const pageText = (await page.textContent('body')) || '';
    const blocked = /Access Denied|blocked|captcha|unusual traffic/i.test(pageText);
    if (blocked) {
      return {
        query,
        status: 'blocked',
        message: 'Flipkart blocked the request. No false data returned.',
        products: []
      };
    }

    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {}

    await page.waitForSelector(FLIPKART_RESULTS_SELECTOR, { timeout: 30000 });

    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(700);
    }

    const cards = page.locator(FLIPKART_RESULTS_SELECTOR);
    const count = await cards.count();

    const products = [];
    const seenUrls = new Set();

    for (let i = 0; i < count; i += 1) {
      const product = await extractFlipkartProduct(cards.nth(i));
      if (product.title === 'Unavailable' || !product.url) continue;
      if (seenUrls.has(product.url)) continue;

      seenUrls.add(product.url);
      products.push(product);
      if (products.length === 20) break;
    }

    if (products.length === 0) return commonUnavailable(query, 'No Flipkart product listings found for this query at this time.');
    return { query, status: 'ok', count: products.length, products };
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = {
  scrapeFlipkartTop20
};
