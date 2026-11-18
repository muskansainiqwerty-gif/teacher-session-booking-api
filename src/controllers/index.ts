import { Request, Response } from "express";
import * as userService from "../services/user.service";
import * as teacherService from "../services/teacher.service";
import * as sessionService from "../services/session.service";
import { toObjectId } from "../utils/objectId";

const ok = (res: Response, status: number, message: string, data: unknown) =>
  res.status(status).json({ success: true, message, data });

export const createUser = async (req: Request, res: Response) => {
  const user = await userService.createUser(req.body);
  ok(res, 201, "User created", user);
};

export const getUserSessions = async (req: Request, res: Response) => {
  const data = await userService.getUserSessions(toObjectId(req.params.id, "user id"));
  ok(res, 200, "User sessions fetched", data);
};

export const createTeacher = async (req: Request, res: Response) => {
  const teacher = await teacherService.createTeacher(req.body);
  ok(res, 201, "Teacher created", teacher);
};

export const createSession = async (req: Request, res: Response) => {
  const session = await sessionService.createSession(req.body);
  ok(res, 201, "Session created", session);
};

export const getAvailableSessions = async (req: Request, res: Response) => {
  const data = await sessionService.getAvailableSessions(req.query.dateTimestamp);
  ok(res, 200, "Available sessions fetched", data);
};

export const bookSession = async (req: Request, res: Response) => {
  const session = await sessionService.bookSession(toObjectId(req.params.id, "session id"), toObjectId(req.body.userId, "userId"));
  ok(res, 200, "Session booked", session);
};

export const completeSession = async (req: Request, res: Response) => {
  const session = await sessionService.completeSession(toObjectId(req.params.id, "session id"));
  ok(res, 200, "Session marked as completed", session);
};
