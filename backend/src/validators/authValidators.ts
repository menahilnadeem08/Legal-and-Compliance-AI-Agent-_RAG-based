import { z } from "zod";

const passwordRules = z
  .string({ message: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[0-9]/, "Must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character");

/** POST /auth/login — username or email + password */
export const loginSchema = z
  .object({
    body: z.object({
      username: z.string().optional(),
      email: z.string().email("Invalid email format").optional(),
      password: z.string({ message: "Password is required" }).min(1),
    }),
  })
  .refine((data) => data.body.username || data.body.email, {
    message: "Username or email is required",
    path: ["body", "username"],
  });

/** POST /auth/admin/login — username or email + password */
export const adminLoginSchema = z
  .object({
    body: z.object({
      username: z.string().optional(),
      email: z.string().email("Invalid email format").optional(),
      password: z.string({ message: "Password is required" }).min(1),
    }),
  })
  .refine((data) => data.body.username || data.body.email, {
    message: "Username or email is required",
    path: ["body", "username"],
  });

/** POST /auth/admin/signup — username, email, password, confirmPassword, optional companyName */
export const adminSignupSchema = z.object({
  body: z
    .object({
      username: z
        .string({ message: "Username is required" })
        .min(3, "Username must be at least 3 characters")
        .regex(/^[a-zA-Z0-9._]+$/, "Username can only contain letters, numbers, dots, and underscores"),
      email: z.string({ message: "Email is required" }).email("Invalid email format"),
      password: passwordRules,
      confirmPassword: z.string({ message: "Confirm password is required" }),
      companyName: z.string().optional(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    }),
});

/** POST /auth/change-password — newPassword, confirmPassword, optional currentPassword */
export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().optional(),
      newPassword: passwordRules,
      confirmPassword: z.string({ message: "Confirm password is required" }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    }),
});

/** POST /auth/admin/verify-otp */
export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string({ message: "Email is required" }).email("Invalid email format"),
    otp: z.string({ message: "OTP is required" }).length(6, "OTP must be 6 digits"),
  }),
});

/** POST /auth/admin/resend-otp */
export const resendOtpSchema = z.object({
  body: z.object({
    email: z.string({ message: "Email is required" }).email("Invalid email format"),
  }),
});

/** POST /auth/refresh */
export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string({ message: "Refresh token is required" }).min(1),
  }),
});

/** POST /auth/signin (Google) */
export const googleSignInSchema = z.object({
  body: z.object({
    googleId: z.string({ message: "Google ID is required" }).min(1),
    email: z.string({ message: "Email is required" }).email("Invalid email format"),
    name: z.string().optional(),
    image: z.string().optional(),
  }),
});

/** POST /auth/forgot-password — email + role (admin or employee) */
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string({ message: "Email is required" }).email("Invalid email format"),
    role: z.enum(["admin", "employee"], { message: "Role must be 'admin' or 'employee'" }),
  }),
});

/** POST /auth/verify-reset-otp — email + 6-digit OTP + role */
export const verifyResetOtpSchema = z.object({
  body: z.object({
    email: z.string({ message: "Email is required" }).email("Invalid email format"),
    otp: z.string({ message: "OTP is required" }).length(6, "OTP must be 6 digits"),
    role: z.enum(["admin", "employee"], { message: "Role must be 'admin' or 'employee'" }),
  }),
});

/** POST /auth/reset-password — resetToken from verify-reset-otp + new password */
export const resetPasswordSchema = z.object({
  body: z
    .object({
      resetToken: z.string({ message: "Reset token is required" }).min(1),
      newPassword: passwordRules,
      confirmPassword: z.string({ message: "Confirm password is required" }),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"],
    }),
});

/** POST /auth/resend-reset-otp — email + role (resend OTP for forgot-password) */
export const resendResetOtpSchema = z.object({
  body: z.object({
    email: z.string({ message: "Email is required" }).email("Invalid email format"),
    role: z.enum(["admin", "employee"], { message: "Role must be 'admin' or 'employee'" }),
  }),
});
