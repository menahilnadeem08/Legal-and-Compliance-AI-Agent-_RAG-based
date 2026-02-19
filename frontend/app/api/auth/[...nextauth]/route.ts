import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "";
const ACCESS_TOKEN_LIFETIME_MS = 14 * 60 * 1000; // 14 min (refresh 1 min before 15-min expiry)

async function refreshBackendToken(refreshToken: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) return null;
  return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            googleId: account?.providerAccountId,
            email: user.email,
            name: user.name,
            image: user.image,
            role: "admin",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Signin failed with status ${response.status}`);
        }

        const data = await response.json();
        user.id = data.user.id;
        (user as any).accessToken = data.accessToken;
        (user as any).refreshToken = data.refreshToken;
        (user as any).role = data.user.role;

        return true;
      } catch (error) {
        console.error("[NEXTAUTH] Sign in error:", error);
        throw error;
      }
    },

    async jwt({ token, user }) {
      // First sign-in: populate from user object
      if (user) {
        token.id = user.id;
        token.accessToken = (user as any).accessToken;
        token.refreshToken = (user as any).refreshToken;
        token.role = (user as any).role;
        token.accessTokenExpires = Date.now() + ACCESS_TOKEN_LIFETIME_MS;
        token.error = undefined;
        return token;
      }

      // Subsequent calls: check if access token is still fresh
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Access token expired — use refresh token to get a new pair
      const refreshed = await refreshBackendToken(token.refreshToken as string);
      if (refreshed) {
        token.accessToken = refreshed.accessToken;
        token.refreshToken = refreshed.refreshToken;
        token.accessTokenExpires = Date.now() + ACCESS_TOKEN_LIFETIME_MS;
        token.error = undefined;
      } else {
        token.error = "RefreshTokenExpired";
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).accessToken = token.accessToken;
        (session.user as any).refreshToken = token.refreshToken;
        (session.user as any).role = token.role;
        (session.user as any).error = token.error;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days — matches backend refresh token lifetime
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
