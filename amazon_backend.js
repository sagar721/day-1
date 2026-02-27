let express = null;
let chromium = null;
let dependencyLoadError = null;

try {
  express = require('express');
  ({ chromium } = require('playwright'));
} catch (error) {
  dependencyLoadError = error;
}

const AMAZON_BASE_URL = 'https://www.amazon.in';
const RESULTS_SELECTOR = 'div.s-result-item[data-component-type="s-search-result"]';

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
    return new URL(href, AMAZON_BASE_URL).toString();
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

async function extractProduct(card) {
  const title = await textOrNull(card.locator('h2 span'));

  // Required selectors for price: .a-price-whole OR .a-price .a-offscreen
  const rawPrice =
    (await textOrNull(card.locator('.a-price .a-offscreen'))) ||
    (await textOrNull(card.locator('.a-price-whole')));

  const rawRating = await textOrNull(card.locator('.a-icon-alt'));

  const href = await attrOrNull(card.locator('h2 a'), 'href');
  const image = await attrOrNull(card.locator('img'), 'src');

  // Real coupon only if visible in scraped DOM.
  const coupon =
    (await textOrNull(card.locator('span.s-coupon-unclipped'))) ||
    (await textOrNull(card.locator('span.s-coupon-clipped'))) ||
    (await textOrNull(card.locator('[data-cy="coupon"]'))) ||
    null;

  return {
    platform: 'Amazon',
    title: title || 'Unavailable',
    price: parsePrice(rawPrice),
    rating: parseRating(rawRating),
    url: absoluteUrl(href),
    image: image || null,
    coupon: coupon || 'Unavailable'
  };
}

async function scrapeAmazonTop20(query) {
  const encodedQuery = encodeURIComponent(query.trim());
  const searchUrl = `${AMAZON_BASE_URL}/s?k=${encodedQuery}&_t=${Date.now()}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-IN',
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    }
  });

  const page = await context.newPage();

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // Detect hard block/captcha pages so we don't emit false product data.
    const pageText = (await page.textContent('body')) || '';
    const blocked =
      /Enter the characters you see below|Type the characters you see in this image|Robot Check/i.test(pageText) ||
      (await page.locator('form[action*="validateCaptcha"]').count()) > 0;

    if (blocked) {
      return {
        query,
        status: 'blocked',
        message: 'Amazon blocked the request (captcha/robot check). No false data returned.',
        products: []
      };
    }

    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      // Continue; Amazon may keep background requests active.
    }

    await page.waitForSelector(RESULTS_SELECTOR, { timeout: 30000 });

    // Hydrate lazy content (images/prices/coupons).
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, 1800);
      await page.waitForTimeout(700);
    }

    const cards = page.locator(RESULTS_SELECTOR);
    const count = await cards.count();

    const products = [];
    const seenUrls = new Set();

    for (let i = 0; i < count; i += 1) {
      const product = await extractProduct(cards.nth(i));

      if (product.title === 'Unavailable' || !product.url) continue;
      if (seenUrls.has(product.url)) continue;

      // Real data only: keep price/rating as null when missing rather than fake defaults.
      seenUrls.add(product.url);
      products.push(product);

      if (products.length === 20) break;
    }

    if (products.length === 0) {
      return {
        query,
        status: 'unavailable',
        message: 'No product listings found for this query at this time.',
        products: []
      };
    }

    return {
      query,
      status: 'ok',
      count: products.length,
      products
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

if (dependencyLoadError) {
  console.error('Missing runtime dependencies. Install optional deps with: npm install --include=optional');
  console.error(`Underlying error: ${dependencyLoadError.message}`);
  process.exit(1);
}

const app = express();
app.use(express.json());

app.get('/api/amazon', async (req, res) => {
  const query = (req.query.query || '').toString().trim();

  if (!query) {
    return res.status(400).json({
      status: 'error',
      message: 'Query is required. Example: /api/amazon?query=iphone%2015',
      products: []
    });
  }

  try {
    const data = await scrapeAmazonTop20(query);
    return res.status(data.status === 'blocked' ? 429 : 200).json(data);
  } catch (error) {
    return res.status(500).json({
      query,
      status: 'error',
      message: `Scraping failed: ${error.message}`,
      products: []
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Amazon scraper backend running on http://localhost:${PORT}`);
});
