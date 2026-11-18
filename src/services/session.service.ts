import { PipelineStage, Types } from "mongoose";
import { Session, SessionStatus } from "../models/session.model";
import { Teacher } from "../models/teacher.model";
import { AppError } from "../utils/AppError";
import { assertUserExists } from "./user.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export const createSession = async (input: { teacherId: string; startTime: Date; endTime: Date }) => {
  const teacherId = new Types.ObjectId(input.teacherId);

  if (!(await Teacher.exists({ _id: teacherId }))) {
    throw AppError.notFound("Teacher not found");
  }
  if (input.startTime.getTime() <= Date.now()) {
    throw AppError.badRequest("startTime must be in the future");
  }

  // A teacher cannot be in two sessions at once: [start, end) ranges must not intersect.
  const overlapping = await Session.exists({
    teacherId,
    startTime: { $lt: input.endTime },
    endTime: { $gt: input.startTime },
  });
  if (overlapping) {
    throw AppError.conflict("Teacher already has a session overlapping this time range");
  }

  return Session.create({
    teacherId,
    startTime: input.startTime,
    endTime: input.endTime,
    status: SessionStatus.AVAILABLE,
    userId: null,
  });
};

/**
 * Parses `dateTimestamp` into the [start, end) range of the UTC day it falls in.
 * Accepts epoch milliseconds; a 10-digit value is treated as epoch seconds.
 */
export const getUtcDayRange = (raw: unknown): { dayStart: Date; dayEnd: Date } => {
  if (typeof raw !== "string" || !/^-?\d+$/.test(raw.trim())) {
    throw AppError.badRequest("dateTimestamp query parameter is required and must be a numeric timestamp");
  }
  let ts = Number(raw.trim());
  if (Math.abs(ts) < 1e11) ts *= 1000; // seconds -> milliseconds

  const date = new Date(ts);
  if (!Number.isFinite(ts) || Number.isNaN(date.getTime())) {
    throw AppError.badRequest("dateTimestamp is not a valid timestamp");
  }
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return { dayStart, dayEnd: new Date(dayStart.getTime() + DAY_MS) };
};

export const getAvailableSessions = async (rawTimestamp: unknown) => {
  const { dayStart, dayEnd } = getUtcDayRange(rawTimestamp);

  const pipeline: PipelineStage[] = [
    {
      $match: {
        status: SessionStatus.AVAILABLE,
        startTime: { $gte: dayStart, $lt: dayEnd },
      },
    },
    { $sort: { startTime: 1, _id: 1 } },
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
    { $project: { teacherId: 0, userId: 0, completedAt: 0 } },
  ];

  const sessions = await Session.aggregate(pipeline);
  return { date: dayStart.toISOString().slice(0, 10), count: sessions.length, sessions };
};

export const bookSession = async (sessionId: Types.ObjectId, userId: Types.ObjectId) => {
  await assertUserExists(userId);

  const existing = await Session.findById(sessionId);
  if (!existing) throw AppError.notFound("Session not found");
  if (existing.status !== SessionStatus.AVAILABLE) {
    throw AppError.conflict(`Session cannot be booked because it is already ${existing.status}`);
  }
  if (existing.startTime.getTime() <= Date.now()) {
    throw AppError.conflict("Session has already started and can no longer be booked");
  }

  // The user must not hold another active booking that overlaps in time.
  const clash = await Session.exists({
    userId,
    status: SessionStatus.BOOKED,
    startTime: { $lt: existing.endTime },
    endTime: { $gt: existing.startTime },
  });
  if (clash) {
    throw AppError.conflict("User already has a booked session overlapping this time range");
  }

  // Atomic compare-and-set: if two users race for the same slot, only one update matches.
  const booked = await Session.findOneAndUpdate(
    { _id: sessionId, status: SessionStatus.AVAILABLE, userId: null },
    { $set: { status: SessionStatus.BOOKED, userId } },
    { new: true }
  );
  if (!booked) {
    throw AppError.conflict("Session was just booked by someone else");
  }
  return booked;
};

export const completeSession = async (sessionId: Types.ObjectId) => {
  // Atomic: only a BOOKED session transitions, so double completion is impossible.
  const completed = await Session.findOneAndUpdate(
    { _id: sessionId, status: SessionStatus.BOOKED },
    { $set: { status: SessionStatus.COMPLETED, completedAt: new Date() } },
    { new: true }
  );
  if (completed) return completed;

  const existing = await Session.findById(sessionId).select("status");
  if (!existing) throw AppError.notFound("Session not found");
  throw AppError.conflict(`Only BOOKED sessions can be completed; this session is ${existing.status}`);
};
