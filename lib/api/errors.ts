import { NextResponse } from 'next/server'
import type { ZodError } from 'zod'

export function validationError(error: ZodError) {
  const message = process.env.NODE_ENV === 'development'
    ? (error.issues[0]?.message ?? '入力値が不正です')
    : '入力値が不正です'
  return NextResponse.json({ error: message }, { status: 400 })
}

export function dbError(message: string, error?: unknown) {
  if (error) console.error('[DB Error]', message, error)
  return NextResponse.json({ error: message }, { status: 500 })
}

export function notFound(message: string) {
  return NextResponse.json({ error: message }, { status: 404 })
}
