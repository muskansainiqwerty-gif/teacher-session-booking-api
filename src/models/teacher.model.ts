import { InferSchemaType, Schema, model } from "mongoose";

const teacherSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    specialization: { type: String, required: true, trim: true },
    experience: { type: Number, required: true, min: 0 }, // years
  },
  { timestamps: true, versionKey: false }
);

export type ITeacher = InferSchemaType<typeof teacherSchema>;
export const Teacher = model("Teacher", teacherSchema);
