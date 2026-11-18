import { Router } from "express";
import * as c from "../controllers";
import { asyncHandler as h } from "../utils/asyncHandler";
import { validateBody } from "../middlewares/validate";
import { bookSessionSchema, createSessionSchema, createTeacherSchema, createUserSchema } from "../validators/schemas";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ success: true, message: "OK" });
});

router.post("/users", validateBody(createUserSchema), h(c.createUser));
router.get("/users/:id/sessions", h(c.getUserSessions));

// Helper endpoint so teachers can be created without touching the database directly.
router.post("/teachers", validateBody(createTeacherSchema), h(c.createTeacher));

router.post("/sessions", validateBody(createSessionSchema), h(c.createSession));
// Must be registered before "/sessions/:id/..." routes.
router.get("/sessions/available", h(c.getAvailableSessions));
router.post("/sessions/:id/book", validateBody(bookSessionSchema), h(c.bookSession));
router.patch("/sessions/:id/complete", h(c.completeSession));

export default router;
