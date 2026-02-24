import { z } from "zod";

/** POST /admin/create-user — create employee (username, email, optional name) */
export const addEmployeeSchema = z.object({
  body: z.object({
    username: z
      .string({ message: "Username is required" })
      .min(3, "Username must be at least 3 characters")
      .regex(/^[a-zA-Z0-9._]+$/, "Username can only contain letters, numbers, dots, and underscores"),
    email: z.string({ message: "Email is required" }).email("Invalid email format"),
    name: z.string().optional(),
  }),
});

/** Params schema for routes with :id (deactivate, activate, resend-credentials) */
export const employeeIdSchema = z.object({
  params: z.object({
    id: z.string({ message: "Employee ID is required" }).min(1),
  }),
});
