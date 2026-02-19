import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

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
    async signIn({ user, account, profile, email, credentials }) {
      try {
        // Detect if user is signing in as employee or admin
        // by checking if role was stored in localStorage before Google signin
        let userRole = 'admin'; // default to admin
        
        // The role might be passed via the state parameter if available
        // For now, we default to admin for Google OAuth users
        // Employees can still be created by admins and use local login
        
        console.log('[NEXTAUTH] 🔐 Google Sign In Callback');
        console.log('[NEXTAUTH] User email:', user.email);
        console.log('[NEXTAUTH] User role:', userRole);

        // Send user data to backend for OAuth processing
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/signin`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            googleId: account?.providerAccountId,
            email: user.email,
            name: user.name,
            image: user.image,
            role: userRole,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("[NEXTAUTH] Backend signin error:", response.status, errorData);
          // Return error object with custom error code for client-side handling
          throw new Error(errorData.error || `Signin failed with status ${response.status}`);
        }

        const data = await response.json();
        user.id = data.user.id;
        (user as any).token = data.token;
        (user as any).role = data.user.role;
        
        console.log('[NEXTAUTH] ✅ Signin successful');

        return true;
      } catch (error) {
        console.error("[NEXTAUTH] Sign in error:", error);
        // Re-throw to let NextAuth handle the error page redirect
        throw error;
      }
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.token = (user as any)?.token;
        token.role = (user as any)?.role;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).token = token.token;
        (session.user as any).role = token.role;
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
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
