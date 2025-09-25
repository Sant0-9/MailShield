'use client'

import { useState, useEffect, useCallback } from 'react'

interface EmailAuthResult {
  spf: {
    present: boolean
    status: 'pass' | 'warn' | 'fail'
    score: number
    issues: string[]
    fix: string
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
  }
  overallScore: number
  overallGrade: string
  domain: string
  timestamp: string
}

export default function Home() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<EmailAuthResult | null>(null)
  const [error, setError] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [domainValid, setDomainValid] = useState<boolean | null>(null)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loadingStep, setLoadingStep] = useState<string>('')
  const [comparisonMode, setComparisonMode] = useState(false)
  const [comparisonResults, setComparisonResults] = useState<EmailAuthResult[]>([])
  const [darkMode, setDarkMode] = useState(false)

  // Load search history and theme from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('mailshield-history')
    if (saved) {
      setSearchHistory(JSON.parse(saved))
    }

    const theme = localStorage.getItem('mailshield-theme')
    if (theme === 'dark') {
      setDarkMode(true)
      document.documentElement.classList.add('dark')
    }
  }, [])

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
    if (!darkMode) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('mailshield-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('mailshield-theme', 'light')
    }
  }

  // Validate domain in real-time
  const validateDomain = useCallback((inputDomain: string): boolean => {
    if (!inputDomain) return false

    // Remove protocol if present
    const cleanDomain = inputDomain.replace(/^https?:\/\//, '').split('/')[0]

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.([a-zA-Z]{2,}|[a-zA-Z]{2,}\.[a-zA-Z]{2,})$/
    return domainRegex.test(cleanDomain) && cleanDomain.length <= 253
  }, [])

  // Handle domain input change with validation
  const handleDomainChange = (value: string) => {
    setDomain(value)
    if (value.trim()) {
      setDomainValid(validateDomain(value.trim()))
    } else {
      setDomainValid(null)
    }
  }

  // Save to search history
  const saveToHistory = (searchDomain: string) => {
    const newHistory = [searchDomain, ...searchHistory.filter(d => d !== searchDomain)].slice(0, 10)
    setSearchHistory(newHistory)
    localStorage.setItem('mailshield-history', JSON.stringify(newHistory))
  }

  const checkEmailAuth = async () => {
    if (!domain || !domainValid) return

    const cleanDomain = domain.trim()
    setLoading(true)
    setError('')
    if (!comparisonMode) {
      setResult(null)
    }
    setShowHistory(false)
    setLoadingStep('Validating domain...')

    try {
      // Save to history before checking
      saveToHistory(cleanDomain)

      // Simulate progressive loading steps
      setTimeout(() => setLoadingStep('Looking up SPF records...'), 500)
      setTimeout(() => setLoadingStep('Checking DKIM selectors...'), 1500)
      setTimeout(() => setLoadingStep('Analyzing DMARC policy...'), 2500)
      setTimeout(() => setLoadingStep('Calculating security score...'), 3500)

      const response = await fetch(`/api/check?domain=${encodeURIComponent(cleanDomain)}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check domain')
      }

      if (comparisonMode) {
        // Add to comparison results
        const existingIndex = comparisonResults.findIndex(r => r.domain === cleanDomain)
        if (existingIndex >= 0) {
          const newResults = [...comparisonResults]
          newResults[existingIndex] = data
          setComparisonResults(newResults)
        } else {
          setComparisonResults([...comparisonResults, data])
        }
      } else {
        setResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  // Clear comparison results
  const clearComparison = () => {
    setComparisonResults([])
    setComparisonMode(false)
    setResult(null)
  }

  // Export functionality
  const exportResults = () => {
    const data = comparisonMode ? comparisonResults : (result ? [result] : [])
    const exportData = data.map(r => ({
      domain: r.domain,
      overallGrade: r.overallGrade,
      overallScore: r.overallScore,
      spf: { score: r.spf.score, status: r.spf.status },
      dkim: { score: r.dkim.score, status: r.dkim.status, selectors: r.dkim.selectors },
      dmarc: { score: r.dmarc.score, status: r.dmarc.status, policy: r.dmarc.policy },
      timestamp: r.timestamp
    }))

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mailshield-report-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Copy to clipboard functionality
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // Could add a toast notification here
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  // Animated Progress Bar Component
  const ProgressBar = ({ score, className = "" }: { score: number; className?: string }) => {
    const [animatedScore, setAnimatedScore] = useState(0)

    useEffect(() => {
      const timer = setTimeout(() => {
        setAnimatedScore(score)
      }, 300)
      return () => clearTimeout(timer)
    }, [score])

    const getProgressColor = (value: number) => {
      if (value >= 80) return 'from-green-500 to-emerald-500'
      if (value >= 60) return 'from-yellow-500 to-amber-500'
      return 'from-red-500 to-rose-500'
    }

    return (
      <div className={`relative ${className}`}>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${getProgressColor(score)} rounded-full transition-all duration-1000 ease-out`}
            style={{ width: `${animatedScore}%` }}
          />
        </div>
        <div className="absolute right-0 top-4 text-sm font-bold text-gray-700">
          {score}/100
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-400 shadow-lg'
      case 'warn': return 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-yellow-400 shadow-lg'
      case 'fail': return 'bg-gradient-to-r from-red-500 to-rose-500 text-white border-red-400 shadow-lg'
      default: return 'bg-gradient-to-r from-gray-400 to-gray-500 text-white border-gray-300 shadow-lg'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pass': return 'All Good'
      case 'warn': return 'Needs Attention'
      case 'fail': return 'Broken'
      default: return 'Unknown'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
      case 'warn': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      )
      case 'fail': return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
      default: return null
    }
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 py-8 px-4 sm:px-6 lg:px-8 ${
      darkMode
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900'
        : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50'
    }`}>
      <div className="max-w-4xl mx-auto">
        {/* Header with controls */}
        <div className="flex justify-end mb-6 gap-4">
          {/* Dark Mode Toggle */}
          <button
            onClick={toggleDarkMode}
            className={`p-3 rounded-xl transition-all duration-200 ${
              darkMode
                ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600'
                : 'bg-white/80 text-gray-600 hover:bg-white hover:text-yellow-500'
            } shadow-lg backdrop-blur-sm border border-white/20`}
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {/* Comparison Mode Toggle */}
          <button
            onClick={() => setComparisonMode(!comparisonMode)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
              comparisonMode
                ? 'bg-blue-600 text-white shadow-lg'
                : darkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-white/80 text-gray-600 hover:bg-white'
            } shadow-lg backdrop-blur-sm border border-white/20`}
            title="Toggle comparison mode"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Compare
          </button>

          {/* Export Button */}
          {((result && !comparisonMode) || (comparisonMode && comparisonResults.length > 0)) && (
            <button
              onClick={exportResults}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                darkMode
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              } shadow-lg`}
              title="Export results as JSON"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
          )}

          {/* Clear Comparison */}
          {comparisonMode && comparisonResults.length > 0 && (
            <button
              onClick={clearComparison}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
                darkMode
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              } shadow-lg`}
              title="Clear comparison"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
            </button>
          )}
        </div>

        <div className="text-center mb-12">
          <div className={`inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl mb-6 shadow-lg`}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className={`text-5xl font-bold mb-4 ${
            darkMode
              ? 'bg-gradient-to-r from-white via-blue-200 to-indigo-200 bg-clip-text text-transparent'
              : 'bg-gradient-to-r from-gray-900 via-blue-900 to-indigo-900 bg-clip-text text-transparent'
          }`}>
            MailShield Lite
          </h1>
          <p className={`text-2xl font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
            Will your emails land in the Inbox?
          </p>
          <p className={`text-lg mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Check your domain&apos;s email authentication in seconds
          </p>
          {comparisonMode && (
            <div className={`mt-4 px-4 py-2 rounded-lg ${
              darkMode ? 'bg-blue-900/50 text-blue-200' : 'bg-blue-50 text-blue-700'
            } inline-block`}>
              <span className="font-medium">Comparison Mode Active</span> - Check multiple domains to compare
            </div>
          )}
        </div>

        <div className={`backdrop-blur-sm rounded-2xl shadow-xl border p-8 mb-8 ${
          darkMode
            ? 'bg-gray-800/80 border-gray-700/20'
            : 'bg-white/80 border-white/20'
        }`}>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <label htmlFor="domain" className={`block text-sm font-semibold mb-2 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Enter Domain
                {domainValid === false && (
                  <span className="text-red-500 ml-2 text-xs">Invalid domain format</span>
                )}
                {domainValid === true && (
                  <span className="text-green-500 ml-2 text-xs">Valid domain</span>
                )}
              </label>
              <div className="relative">
                <input
                  id="domain"
                  type="text"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => handleDomainChange(e.target.value)}
                  onFocus={() => setShowHistory(searchHistory.length > 0)}
                  onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                  className={`w-full px-5 py-4 pr-12 border-2 rounded-xl focus:ring-4 focus:ring-blue-500/20 transition-all duration-200 text-lg font-medium ${
                    darkMode
                      ? 'text-white placeholder-gray-500 bg-gray-700/50'
                      : 'text-gray-900 placeholder-gray-400 bg-white'
                  } ${
                    domainValid === false ? 'border-red-300 focus:border-red-500' :
                    domainValid === true ? 'border-green-300 focus:border-green-500' :
                    darkMode ? 'border-gray-600 focus:border-blue-500' : 'border-gray-200 focus:border-blue-500'
                  }`}
                  onKeyPress={(e) => e.key === 'Enter' && checkEmailAuth()}
                  disabled={loading}
                />

                {/* Validation Icon */}
                <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                  {domainValid === true && (
                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  {domainValid === false && (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
              </div>

              {/* Search History Dropdown */}
              {showHistory && searchHistory.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white border-2 border-gray-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                  <div className="p-2">
                    <div className="text-xs font-semibold text-gray-500 mb-2 px-2">Recent searches</div>
                    {searchHistory.map((historyDomain, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setDomain(historyDomain)
                          setDomainValid(validateDomain(historyDomain))
                          setShowHistory(false)
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors text-sm text-gray-700 hover:text-blue-600"
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {historyDomain}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 relative">
              <button
                onClick={checkEmailAuth}
                disabled={loading || !domain || domainValid === false}
                className={`px-8 py-4 text-white rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] ${
                  loading || !domain || domainValid === false
                    ? 'bg-gradient-to-r from-gray-400 to-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
                }`}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Checking...
                  </div>
                ) : 'Check Email Auth'}
              </button>

              <button
                onClick={() => setShowHelp(true)}
                className="px-4 py-4 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border-2 border-gray-200 hover:border-blue-300 transition-all duration-200 font-semibold"
                title="Learn about SPF, DKIM, and DMARC"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Loading step indicator */}
          {loading && loadingStep && (
            <div className="text-center mt-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50/80 backdrop-blur-sm text-blue-700 rounded-lg text-sm font-medium border border-blue-200">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 818-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {loadingStep}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50/80 backdrop-blur-sm border-2 border-red-200 rounded-xl p-6 mb-8 shadow-lg">
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1">
                <p className="text-red-800 font-medium text-lg">{error}</p>
                <button
                  onClick={() => setError('')}
                  className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-semibold mt-3 hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-3xl font-bold text-gray-900">Email Authentication Report</h2>
                    <button
                      onClick={() => copyToClipboard(`MailShield Report for ${result.domain}: Overall Grade ${result.overallGrade} (${result.overallScore}/100)\nSPF: ${result.spf.score}/100\nDKIM: ${result.dkim.score}/100\nDMARC: ${result.dmarc.score}/100`)}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded hover:bg-gray-100"
                      title="Copy full report summary"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg text-gray-700 font-medium">Domain: <span className="text-blue-600 font-semibold">{result.domain}</span></p>
                    <p className="text-gray-600">Checked: {new Date(result.timestamp).toLocaleString()}</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="mb-2">
                    <div className={`inline-block px-6 py-3 rounded-2xl text-4xl font-bold shadow-lg border-2 ${
                      result.overallGrade === 'A' ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-400' :
                      result.overallGrade === 'B' ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-blue-400' :
                      result.overallGrade === 'C' ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white border-yellow-400' :
                      result.overallGrade === 'D' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white border-orange-400' :
                      'bg-gradient-to-r from-red-500 to-rose-500 text-white border-red-400'
                    }`}>
                      {result.overallGrade}
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-gray-600">Overall Grade</p>
                  <p className="text-xs text-gray-500">{result.overallScore}/100 points</p>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {[
                { name: 'SPF', data: result.spf, description: 'Sender Policy Framework' },
                { name: 'DKIM', data: result.dkim, description: 'DomainKeys Identified Mail' },
                { name: 'DMARC', data: result.dmarc, description: 'Domain-based Message Authentication' }
              ].map(({ name, data, description }) => (
                <div key={name} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 hover:shadow-2xl transition-all duration-300 transform hover:scale-[1.02]">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-1">{name}</h3>
                      <p className="text-sm text-gray-600 font-medium">{description}</p>
                    </div>
                    <span className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 ${getStatusColor(data.status)}`}>
                      {getStatusIcon(data.status)}
                      {getStatusText(data.status)}
                    </span>
                  </div>

                  <div className="space-y-3 text-gray-700 mb-6">
                    {name === 'SPF' && (
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Record present:</span>
                        <span className={`px-2 py-1 rounded-lg text-sm font-semibold ${data.present ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                          {data.present ? 'Yes' : 'No'}
                        </span>
                      </div>
                    )}
                    {name === 'DKIM' && (
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">Selectors found:</span>
                          <span className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-sm font-semibold">
                            {result.dkim.selectors.length}
                          </span>
                        </div>
                        {result.dkim.selectors.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.dkim.selectors.slice(0, 3).map((selector) => (
                              <span key={selector} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                {selector}
                              </span>
                            ))}
                            {result.dkim.selectors.length > 3 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                                +{result.dkim.selectors.length - 3} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {name === 'DMARC' && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">Record present:</span>
                          <span className={`px-2 py-1 rounded-lg text-sm font-semibold ${data.present ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {data.present ? 'Yes' : 'No'}
                          </span>
                        </div>
                        {data.present && (
                          <div className="flex justify-between items-center">
                            <span className="font-medium">Policy:</span>
                            <span className={`px-2 py-1 rounded-lg text-sm font-semibold ${
                              result.dmarc.policy === 'reject' ? 'bg-green-100 text-green-700' :
                              result.dmarc.policy === 'quarantine' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {result.dmarc.policy}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-medium text-gray-700">Score</span>
                        <button
                          onClick={() => copyToClipboard(`${name}: ${data.score}/100`)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Copy score"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                      <ProgressBar score={data.score} />
                    </div>
                  </div>

                  {data.issues.length > 0 && (
                    <div className="bg-red-50/80 backdrop-blur-sm border-2 border-red-200 rounded-xl p-4 mb-4">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <ul className="text-sm text-red-800 space-y-1 font-medium">
                          {data.issues.map((issue, idx) => (
                            <li key={idx}>• {issue}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {data.fix && (
                    <div className="bg-blue-50/80 backdrop-blur-sm border-2 border-blue-200 rounded-xl p-4">
                      <div className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-blue-800 font-medium"><strong className="text-blue-900">Fix:</strong> {data.fix}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && !result && (
          <div className="space-y-8">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-8 animate-pulse">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <div className="h-8 bg-gray-300 rounded w-64 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-48"></div>
                </div>
                <div className="h-16 w-20 bg-gray-300 rounded-2xl"></div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {['SPF', 'DKIM', 'DMARC'].map((name) => (
                <div key={name} className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6 animate-pulse">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <div className="h-6 bg-gray-300 rounded w-16 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-32"></div>
                    </div>
                    <div className="h-8 bg-gray-300 rounded-xl w-24"></div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-full"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showHelp && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl max-w-2xl w-full p-8 border border-white/20">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Email Authentication Explained</h3>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-xl transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-6">
                <div className="bg-green-50/80 border border-green-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-sm">SPF</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 mb-2">SPF (Sender Policy Framework)</h4>
                      <p className="text-gray-700 leading-relaxed">Specifies which mail servers are authorized to send email for your domain. Prevents unauthorized servers from spoofing your domain.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs">DKIM</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 mb-2">DKIM (DomainKeys Identified Mail)</h4>
                      <p className="text-gray-700 leading-relaxed">Uses cryptographic signatures to verify that emails haven&apos;t been tampered with during transit and confirm they&apos;re from your domain.</p>
                    </div>
                  </div>
                </div>
                <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-xs">DMARC</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900 mb-2">DMARC (Domain-based Message Authentication)</h4>
                      <p className="text-gray-700 leading-relaxed">Builds on SPF and DKIM to tell receiving servers what to do with emails that fail authentication checks (reject, quarantine, or allow).</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-8 text-center">
                <button
                  onClick={() => setShowHelp(false)}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 transition-colors shadow-lg"
                >
                  Got it, thanks!
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
