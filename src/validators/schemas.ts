import { z } from "zod";

const dateString = (label: string) =>
  z
    .string({ error: `${label} is required and must be an ISO 8601 date string` })
    .trim()
    .refine((v) => v.length > 0 && !Number.isNaN(Date.parse(v)), {
      message: `${label} must be a valid date (e.g. 2030-01-15T10:00:00Z)`,
    })
    .transform((v) => new Date(v));

const objectIdString = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .regex(/^[a-f\d]{24}$/i, { message: `${label} must be a valid ObjectId` });

export const createUserSchema = z.object({
  fullName: z.string({ error: "fullName is required" }).trim().min(2, "fullName must be at least 2 characters").max(100),
  email: z.string({ error: "email is required" }).trim().toLowerCase().max(254).pipe(z.email("email is invalid")),
  phone: z
    .string({ error: "phone is required" })
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,18}[0-9]$/, "phone must be 8-20 digits and may start with +"),
});

export const createTeacherSchema = z.object({
  fullName: z.string({ error: "fullName is required" }).trim().min(2).max(100),
  email: z.string({ error: "email is required" }).trim().toLowerCase().max(254).pipe(z.email("email is invalid")),
  specialization: z.string({ error: "specialization is required" }).trim().min(2).max(100),
  experience: z
    .number({ error: "experience must be a number (years)" })
    .min(0, "experience cannot be negative")
    .max(80, "experience is unrealistic"),
});

export const createSessionSchema = z
  .object({
    teacherId: objectIdString("teacherId"),
    startTime: dateString("startTime"),
    endTime: dateString("endTime"),
  })
  // If a date field already failed, it is still a raw value here, so only compare real Dates.
  .refine((d) => !(d.startTime instanceof Date && d.endTime instanceof Date) || d.endTime > d.startTime, {
    message: "endTime must be greater than startTime",
    path: ["endTime"],
  });

export const bookSessionSchema = z.object({
  userId: objectIdString("userId"),
});
