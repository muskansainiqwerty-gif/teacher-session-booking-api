import { InferSchemaType, Schema, model } from "mongoose";

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { timestamps: true, versionKey: false }
);

export type IUser = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
