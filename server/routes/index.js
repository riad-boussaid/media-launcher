import { Router } from "express";
import { lunchMPV } from "../controllers/launch-mpv.js";

const router = Router();

router.post("/", (req, res) => {
  try {
    let url = req.body.url;

    lunchMPV(url);
    return res.status(200).json({ data: "success" });
  } catch (err) {
    console.error(err.message);
    return res.status(400).json({ err: err.message });
  }
});

export default router;
