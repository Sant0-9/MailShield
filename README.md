# MailShield Lite

> **Will your emails land in the Inbox?**

A fast, simple web app that checks domain email authentication posture (SPF, DKIM, DMARC) and provides clear pass/warn/fail results with actionable recommendations.

## Features

- **Instant Domain Analysis**: Check any public domain's email authentication setup
- **SPF, DKIM & DMARC Verification**: Comprehensive email security assessment
- **Clear Grading System**: Simple A-F grades with detailed scoring
- **Actionable Recommendations**: Specific "Fix:" guidance for each issue found
- **Responsive Design**: Works seamlessly on desktop and mobile
- **No Registration Required**: Just enter a domain and get results

## How It Works

1. Enter any domain (e.g., `example.com`)
2. The app performs DNS lookups for:
   - **SPF**: Sender Policy Framework records
   - **DKIM**: DomainKeys Identified Mail selectors
   - **DMARC**: Domain-based Message Authentication records
3. Get instant results with scores, issues, and fixes

## Tech Stack

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes with Node.js DNS lookups
- **Deployment**: Optimized for Vercel serverless functions
- **Caching**: 5-minute API response caching for performance

## Getting Started

```bash
# Clone and install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

## API Usage

```bash
# Check a domain programmatically
curl "http://localhost:3000/api/check?domain=github.com"
```

Example response:
```json
{
  "spf": {
    "present": true,
    "status": "pass",
    "score": 90,
    "issues": [],
    "fix": "SPF record looks good"
  },
  "dkim": {
    "present": true,
    "status": "pass",
    "score": 100,
    "selectors": ["google", "s1", "s2"],
    "issues": [],
    "fix": "DKIM appears configured correctly"
  },
  "dmarc": {
    "present": true,
    "status": "pass",
    "score": 100,
    "policy": "reject",
    "issues": [],
    "fix": "DMARC policy is optimally configured"
  },
  "overallScore": 97,
  "overallGrade": "A",
  "domain": "github.com"
}
```

## Deployment

Deploy instantly to Vercel:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/mailshield-lite)

The app is pre-configured for Vercel with:
- Node.js serverless runtime for DNS lookups
- Optimized caching headers
- Mobile-responsive design

## Who Benefits

- **IT Administrators**: Quickly verify email deliverability setup
- **Marketing Teams**: Ensure campaigns reach the inbox
- **Security Teams**: Audit email authentication policies
- **Developers**: Reference implementation for email auth checking

## License

MIT License - feel free to use and modify for your needs.
