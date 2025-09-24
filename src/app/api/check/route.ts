import { NextRequest, NextResponse } from 'next/server'
import dns from 'dns/promises'

interface EmailAuthResult {
  spf: {
    present: boolean
    status: 'pass' | 'warn' | 'fail'
    score: number
    issues: string[]
    fix: string
    record?: string
    qualifier?: string
    includes?: string[]
  }
  dkim: {
    present: boolean
    status: 'pass' | 'warn' | 'fail'
    score: number
    selectors: string[]
    issues: string[]
    fix: string
  }
  dmarc: {
    present: boolean
    status: 'pass' | 'warn' | 'fail'
    score: number
    policy: string
    issues: string[]
    fix: string
    record?: string
    rua?: string
  }
  overallScore: number
  overallGrade: string
  domain: string
  timestamp: string
}

const DKIM_SELECTORS = [
  'default', 'google', 's1', 's2', 'selector1', 'selector2',
  'mandrill', 'postmark', 'pm', 'k1', 'k2', 'mail'
]

function validateDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false

  // Remove protocol if present
  domain = domain.replace(/^https?:\/\//, '')

  // Remove path if present
  domain = domain.split('/')[0]

  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$/
  return domainRegex.test(domain)
}

async function lookupTXT(hostname: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(hostname)
    return records.map(record => record.join(''))
  } catch {
    return []
  }
}

function parseSPF(records: string[]) {
  const spfRecords = records.filter(record => record.startsWith('v=spf1'))

  if (spfRecords.length === 0) {
    return {
      present: false,
      record: null,
      qualifier: null,
      includes: [],
      issues: ['No SPF record found']
    }
  }

  if (spfRecords.length > 1) {
    return {
      present: true,
      record: spfRecords[0],
      qualifier: null,
      includes: [],
      issues: ['Multiple SPF records found - this causes ambiguity']
    }
  }

  const record = spfRecords[0]
  const issues: string[] = []

  // Extract qualifier
  let qualifier = null
  if (record.includes('-all')) qualifier = 'fail'
  else if (record.includes('~all')) qualifier = 'softfail'
  else if (record.includes('?all')) qualifier = 'neutral'
  else if (record.includes('+all')) qualifier = 'pass'
  else issues.push('Missing "all" mechanism')

  // Extract includes
  const includeMatches = record.match(/include:([^\s]+)/g) || []
  const includes = includeMatches.map(match => match.replace('include:', ''))

  if (includes.length > 10) {
    issues.push('Too many include mechanisms (>10) may cause DNS lookup limits')
  }

  if (qualifier === 'pass') {
    issues.push('Using "+all" is overly permissive and allows any server to send email')
  }

  return {
    present: true,
    record,
    qualifier,
    includes,
    issues
  }
}

function parseDMARC(records: string[]) {
  const dmarcRecords = records.filter(record => record.startsWith('v=DMARC1'))

  if (dmarcRecords.length === 0) {
    return {
      present: false,
      record: null,
      policy: null,
      rua: null,
      issues: ['No DMARC record found']
    }
  }

  const record = dmarcRecords[0]
  const issues: string[] = []

  // Extract policy
  const policyMatch = record.match(/p=([^;]+)/)
  const policy = policyMatch ? policyMatch[1] : 'none'

  // Extract rua (aggregate reporting)
  const ruaMatch = record.match(/rua=([^;]+)/)
  const rua = ruaMatch ? ruaMatch[1] : null

  if (policy === 'none') {
    issues.push('Policy is set to "none" - no action taken on failed emails')
  }

  if (!rua) {
    issues.push('No aggregate reporting address (rua) configured')
  }

  return {
    present: true,
    record,
    policy,
    rua,
    issues
  }
}

async function checkDKIM(domain: string) {
  const foundSelectors: string[] = []

  for (const selector of DKIM_SELECTORS) {
    const hostname = `${selector}._domainkey.${domain}`
    const records = await lookupTXT(hostname)

    if (records.length > 0) {
      const dkimRecord = records.find(record => record.includes('k=') || record.includes('p='))
      if (dkimRecord) {
        foundSelectors.push(selector)
      }
    }
  }

  const issues: string[] = []
  if (foundSelectors.length === 0) {
    issues.push('No DKIM selectors found (checked common selectors)')
  }

  return {
    present: foundSelectors.length > 0,
    selectors: foundSelectors,
    issues
  }
}

function calculateScore(
  spf: { present: boolean; qualifier?: string | null; issues: string[] },
  dkim: { present: boolean; selectors: string[]; issues: string[] },
  dmarc: { present: boolean; policy?: string | null; rua?: string | null; issues: string[] }
) {
  let spfScore = 60
  let dkimScore = 60
  let dmarcScore = 60

  // SPF scoring
  if (spf.present && spf.issues.length === 0) {
    spfScore += 20
  }
  if (spf.qualifier === 'fail') {
    spfScore += 20
  } else if (spf.qualifier === 'softfail') {
    spfScore += 10
  }
  spfScore -= spf.issues.length * 10

  // DKIM scoring
  if (dkim.present) {
    dkimScore += 20
  }
  dkimScore += Math.min(dkim.selectors.length * 10, 20)
  dkimScore -= dkim.issues.length * 10

  // DMARC scoring
  if (dmarc.present) {
    dmarcScore += 20
  }
  if (dmarc.policy === 'reject') {
    dmarcScore += 20
  } else if (dmarc.policy === 'quarantine') {
    dmarcScore += 10
  }
  if (dmarc.rua) {
    dmarcScore += 10
  }
  dmarcScore -= dmarc.issues.length * 10

  // Ensure scores are between 0 and 100
  spfScore = Math.max(0, Math.min(100, spfScore))
  dkimScore = Math.max(0, Math.min(100, dkimScore))
  dmarcScore = Math.max(0, Math.min(100, dmarcScore))

  return { spfScore, dkimScore, dmarcScore }
}

function getStatus(score: number): 'pass' | 'warn' | 'fail' {
  if (score >= 80) return 'pass'
  if (score >= 60) return 'warn'
  return 'fail'
}

function getFix(
  type: string,
  data: {
    present?: boolean;
    qualifier?: string | null;
    policy?: string | null;
    rua?: string | null;
    issues?: string[];
  }
): string {
  if (type === 'spf') {
    if (!data.present) {
      return 'Create an SPF record in your DNS: "v=spf1 include:_spf.google.com ~all" (adjust for your email provider)'
    }
    if (data.issues?.includes('Multiple SPF records found - this causes ambiguity')) {
      return 'Remove duplicate SPF records - only one SPF record is allowed per domain'
    }
    if (data.qualifier === 'pass') {
      return 'Change "+all" to "~all" or "-all" to prevent unauthorized email sending'
    }
    if (!data.qualifier) {
      return 'Add an "all" mechanism to your SPF record (recommended: "~all" or "-all")'
    }
    return 'Review your SPF record for potential issues with includes or syntax'
  }

  if (type === 'dkim') {
    if (!data.present) {
      return 'Configure DKIM signing with your email provider and publish DKIM public keys in DNS'
    }
    return 'DKIM appears to be configured correctly'
  }

  if (type === 'dmarc') {
    if (!data.present) {
      return 'Create a DMARC record: "_dmarc.yourdomain.com TXT v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com"'
    }
    if (data.policy === 'none') {
      return 'Upgrade DMARC policy from "none" to "quarantine" or "reject" for better protection'
    }
    if (!data.rua) {
      return 'Add aggregate reporting to your DMARC record: "rua=mailto:dmarc@yourdomain.com"'
    }
    return 'Consider upgrading to "p=reject" for maximum protection'
  }

  return 'No specific recommendations available'
}

function calculateOverallGrade(overallScore: number): string {
  if (overallScore >= 90) return 'A'
  if (overallScore >= 80) return 'B'
  if (overallScore >= 70) return 'C'
  if (overallScore >= 60) return 'D'
  return 'F'
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const domain = searchParams.get('domain')

  if (!domain) {
    return NextResponse.json(
      { error: 'Domain parameter is required' },
      { status: 400 }
    )
  }

  const cleanDomain = domain.toLowerCase().trim()

  if (!validateDomain(cleanDomain)) {
    return NextResponse.json(
      { error: 'Invalid domain format' },
      { status: 400 }
    )
  }

  try {
    // Perform DNS lookups
    const [spfRecords, dmarcRecords] = await Promise.all([
      lookupTXT(cleanDomain),
      lookupTXT(`_dmarc.${cleanDomain}`)
    ])

    // Parse records
    const spfData = parseSPF(spfRecords)
    const dmarcData = parseDMARC(dmarcRecords)
    const dkimData = await checkDKIM(cleanDomain)

    // Calculate scores
    const { spfScore, dkimScore, dmarcScore } = calculateScore(spfData, dkimData, dmarcData)
    const overallScore = Math.round((spfScore + dkimScore + dmarcScore) / 3)

    const result: EmailAuthResult = {
      spf: {
        present: spfData.present,
        status: getStatus(spfScore),
        score: spfScore,
        issues: spfData.issues,
        fix: getFix('spf', spfData)
      },
      dkim: {
        present: dkimData.present,
        status: getStatus(dkimScore),
        score: dkimScore,
        selectors: dkimData.selectors,
        issues: dkimData.issues,
        fix: getFix('dkim', dkimData)
      },
      dmarc: {
        present: dmarcData.present,
        status: getStatus(dmarcScore),
        score: dmarcScore,
        policy: dmarcData.policy || 'none',
        issues: dmarcData.issues,
        fix: getFix('dmarc', dmarcData)
      },
      overallScore,
      overallGrade: calculateOverallGrade(overallScore),
      domain: cleanDomain,
      timestamp: new Date().toISOString()
    }

    // Cache for 5 minutes
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300'
      }
    })

  } catch (error) {
    console.error('DNS lookup error:', error)

    return NextResponse.json(
      {
        error: 'Failed to check domain. Please verify the domain exists and is publicly accessible.',
        domain: cleanDomain,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}