import { Response } from 'express';

export const ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  EMAIL_UNVERIFIED: 'EMAIL_UNVERIFIED',
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  GOOGLE_ACCOUNT: 'GOOGLE_ACCOUNT',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_ALREADY_VERIFIED: 'OTP_ALREADY_VERIFIED',
  TEMP_PASSWORD_EXPIRED: 'TEMP_PASSWORD_EXPIRED',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  MISSING_FIELDS: 'MISSING_FIELDS',
  INVALID_EMAIL_FORMAT: 'INVALID_EMAIL_FORMAT',
  PASSWORD_SAME_AS_CURRENT: 'PASSWORD_SAME_AS_CURRENT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  UNEXPECTED_ERROR: 'UNEXPECTED_ERROR',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  NOT_FOUND: 'NOT_FOUND',
} as const

export const authError = (
  res: Response,
  status: number,
  message: string,
  code: keyof typeof ERROR_CODES
): void => {
  res.status(status).json({ 
    success: false, 
    error: message, 
    code 
  })
}

export const authSuccess = (
  res: Response,
  status: number,
  data: object
): void => {
  res.status(status).json({ 
    success: true, 
    data 
  })
}

export const isDbError = (error: any): boolean => {
  const dbCodes = ['ECONNREFUSED', '57P03', 'ENOTFOUND', 
                   'ETIMEDOUT', 'ECONNRESET']
  return dbCodes.includes(error?.code) || 
         error?.message?.includes('connect ECONNREFUSED')
}

export const lockedMessage = (lockedUntil: Date): string => {
  const remainingMs = lockedUntil.getTime() - Date.now()
  const remainingMins = Math.ceil(remainingMs / 60000)
  return `Account locked. Try again in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}`
}
