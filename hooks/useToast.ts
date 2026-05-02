'use client'

import { useState, useCallback } from 'react'

const TOAST_DURATION_MS = 3000

export function useToast() {
  const [message, setMessage] = useState<string | null>(null)

  const showToast = useCallback((msg: string, duration = TOAST_DURATION_MS) => {
    setMessage(msg)
    setTimeout(() => setMessage(null), duration)
  }, [])

  const clearToast = useCallback(() => setMessage(null), [])

  return { toast: message, showToast, clearToast }
}
