import { Teacher } from "../models/teacher.model";

export const createTeacher = async (input: {
  fullName: string;
  email: string;
  specialization: string;
  experience: number;
}) => Teacher.create(input);
