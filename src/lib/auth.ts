import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Admin',
      credentials: {
        email:    { label: 'Email',    type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const adminEmail    = process.env.ADMIN_EMAIL
        const passwordHash  = process.env.ADMIN_PASSWORD_HASH

        if (!adminEmail || !passwordHash) return null
        if (credentials.email !== adminEmail) return null

        const valid = await compare(credentials.password, passwordHash)
        if (!valid) return null

        return { id: '1', email: adminEmail, name: 'Admin' }
      },
    }),
  ],
  pages: {
    signIn: '/admin/login',
  },
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8h
  secret: process.env.NEXTAUTH_SECRET,
}
