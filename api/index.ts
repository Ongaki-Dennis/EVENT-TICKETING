import { createApp } from "../src/app";

const app = createApp();

export default (req, res) => {
  app(req, res);
};