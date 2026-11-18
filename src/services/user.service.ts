import { PipelineStage, Types } from "mongoose";
import { User } from "../models/user.model";
import { Session, SessionStatus } from "../models/session.model";
import { AppError } from "../utils/AppError";

export const createUser = async (input: { fullName: string; email: string; phone: string }) => {
  // Friendly message for the common case; the unique index still guards against races
  // (the duplicate-key error is translated to a 409 by the error handler).
  if (await User.exists({ email: input.email })) {
    throw AppError.conflict("A user with this email already exists");
  }
  return User.create(input);
};

export const assertUserExists = async (userId: Types.ObjectId): Promise<void> => {
  if (!(await User.exists({ _id: userId }))) {
    throw AppError.notFound("User not found");
  }
};

const teacherLookup: PipelineStage.FacetPipelineStage[] = [
  {
    $lookup: {
      from: "teachers",
      localField: "teacherId",
      foreignField: "_id",
      pipeline: [{ $project: { fullName: 1, email: 1, specialization: 1, experience: 1 } }],
      as: "teacher",
    },
  },
  { $unwind: { path: "$teacher", preserveNullAndEmptyArrays: true } },
  { $project: { teacherId: 0 } },
];

/**
 * Sessions of a user split into upcoming (booked, not yet completed)
 * and completed ones, using one $facet aggregation.
 */
export const getUserSessions = async (userId: Types.ObjectId) => {
  await assertUserExists(userId);

  const [result] = await Session.aggregate([
    { $match: { userId, status: { $in: [SessionStatus.BOOKED, SessionStatus.COMPLETED] } } },
    {
      $facet: {
        upcomingSessions: [
          { $match: { status: SessionStatus.BOOKED } },
          { $sort: { startTime: 1, _id: 1 } },
          ...teacherLookup,
        ],
        completedSessions: [
          { $match: { status: SessionStatus.COMPLETED } },
          { $sort: { completedAt: -1, _id: 1 } },
          ...teacherLookup,
        ],
      },
    },
  ]);

  return {
    upcomingSessions: result?.upcomingSessions ?? [],
    completedSessions: result?.completedSessions ?? [],
  };
};
