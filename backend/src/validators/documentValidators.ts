import { z } from "zod";

/** Params schema for document routes with :id (activate, deactivate) */
export const documentIdParamSchema = z.object({
  params: z.object({
    id: z.string({ message: "Document ID is required" }).uuid("Invalid document ID format"),
  }),
});
