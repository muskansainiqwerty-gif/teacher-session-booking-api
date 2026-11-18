import mongoose from "mongoose";
import { AppError } from "./AppError";

// `isValid` accepts any 12-char string, so we additionally require a 24-char hex string.
export const toObjectId = (value: unknown, label = "id"): mongoose.Types.ObjectId => {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw AppError.badRequest(`Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(value);
};
