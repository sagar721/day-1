# day-1

## Real-Time Price Scraper Backend (Playwright + Express)

### What this does
- Scrapes top 20 search results in real time from:
  - Amazon India
  - Flipkart
- Uses real DOM scraping only (no LLM inference/fake values).
- Returns `status: "unavailable"` with empty products if no products are found.
- Returns `status: "blocked"` with empty products when captcha/bot protection is detected.
- Includes coupon text only when coupon is actually found in the listing card; otherwise `"Unavailable"`.

### Setup
```bash
npm install
npx playwright install chromium
```

> If your environment skips optional packages by policy, run:
```bash
npm install --include=optional
```

### Run server
```bash
npm start
```

### Files
- `amazon_backend.js` contains Express API + Amazon scraper flow.
- `flipkart_scraper.js` contains Flipkart scraping logic in a separate module.

### APIs
```bash
GET /api/amazon?query=iphone%2015
GET /api/flipkart?query=iphone%2015
```

### Response shape
```json
{
  "query": "iphone 15",
  "status": "ok",
  "count": 20,
  "products": [
    {
      "platform": "Amazon or Flipkart",
      "title": "...",
      "price": 79999,
      "rating": 4.4,
      "url": "https://...",
      "image": "https://...",
      "coupon": "Save ₹2,000 with coupon"
    }
  ]
}
```
