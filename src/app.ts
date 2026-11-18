import express from "express";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler";

export const createApp = () => {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};
