# day-1

## Amazon.in Real-Time Scraper Backend (Playwright + Express)

### What this does
- Scrapes top 20 Amazon.in search results in real time.
- Uses real DOM scraping only (no LLM inference/fake values).
- Returns `status: "unavailable"` with empty products if no products are found.
- Returns `status: "blocked"` with empty products when Amazon shows captcha/robot-check.
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

### API
```bash
GET /api/amazon?query=iphone%2015
```

### Response shape
```json
{
  "query": "iphone 15",
  "status": "ok",
  "count": 20,
  "products": [
    {
      "platform": "Amazon",
      "title": "...",
      "price": 79999,
      "rating": 4.4,
      "url": "https://www.amazon.in/...",
      "image": "https://m.media-amazon.com/...",
      "coupon": "Save ₹2,000 with coupon"
    }
  ]
}
```
