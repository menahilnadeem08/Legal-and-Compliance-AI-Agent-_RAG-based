if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set.');
}

export const JWT_SECRET: string = process.env.JWT_SECRET;
