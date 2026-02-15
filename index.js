import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --------------------------------------------------
// POST /sessions
// --------------------------------------------------
app.post("/sessions", async (req, res) => {
  try {
    const { class_code, participant_id, lesson_id, session_type, score, max_score, duration_seconds } = req.body;

    if (!class_code || !participant_id || !lesson_id || !session_type) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const { error } = await supabase
      .from("sessions")
      .insert({
        class_code,
        participant_id,
        lesson_id,
        session_type,
        score,
        max_score,
        duration_seconds
      });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// --------------------------------------------------
// GET /sessions
// --------------------------------------------------
app.get("/sessions", async (req, res) => {
  try {
    const classCode = req.query.class;
    const participant = req.query.participant;

    if (!classCode) {
      return res.status(400).json({ ok: false, error: "Missing class" });
    }

    let query = supabase
      .from("sessions")
      .select("*")
      .eq("class_code", classCode)
      .order("created_at", { ascending: true });

    if (participant) {
      query = query.eq("participant_id", participant);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, rows: data });

  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) });
  }
});

// --------------------------------------------------
// POST /b1-results
// --------------------------------------------------
app.post("/b1-results", async (req, res) => {
  try {
    const {
      class_code,
      participant_id,
      lesson_id,
      score,
      max_score,
      level,
      duration_seconds,
      result_json
    } = req.body;

    if (
      !class_code ||
      !participant_id ||
      !lesson_id ||
      score == null ||
      max_score == null ||
      !level
    ) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields"
      });
    }

    const { error } = await supabase
      .from("b1_dialog_results")
      .insert({
        class_code,
        participant_id,
        lesson_id,
        score,
        max_score,
        level,
        duration_seconds,
        result_json
      });

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    return res.json({ ok: true });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e)
    });
  }
});

// --------------------------------------------------
// GET /b1-results
// --------------------------------------------------
app.get("/b1-results", async (req, res) => {
  try {
    const classCode = req.query.class;

    if (!classCode) {
      return res.status(400).json({
        ok: false,
        error: "Missing class"
      });
    }

    const { data, error } = await supabase
      .from("b1_dialog_results")
      .select("*")
      .eq("class_code", classCode)
      .order("created_at", { ascending: true });

    if (error) {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    return res.json({
      ok: true,
      rows: data
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: String(e)
    });
  }
});

app.get("/", (_, res) => res.send("B1 Dialog API running"));

app.listen(process.env.PORT || 8000, "0.0.0.0");

