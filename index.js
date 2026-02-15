import express from "express";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// --------------------------------------------------
// POST /sessions (unverändert gelassen)
// --------------------------------------------------
app.post("/sessions", async (req, res) => {
  try {
    const {
      class_code,
      participant_id,
      lesson_id,
      session_type,
      score,
      max_score,
      duration_seconds
    } = req.body;

    if (!class_code || !participant_id || !lesson_id || !session_type) {
      return res.status(400).json({ ok: false, error: "Missing required fields" });
    }

    const { error } = await supabase.from("sessions").insert({
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
// POST /b1-results (NEU – mit Progress-Fortschreibung)
// --------------------------------------------------
app.post("/b1-results", async (req, res) => {
  try {
    const {
      class_code,
      participant_id,
      topic_id,
      difficulty_level,
      score_total,
      max_score,
      duration_sec,
      analysis_json
    } = req.body;

    if (
      !class_code ||
      !participant_id ||
      !topic_id ||
      !difficulty_level ||
      score_total == null ||
      max_score == null ||
      !analysis_json
    ) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields"
      });
    }

    // 1️⃣ Session speichern
    const { error: sessionError } = await supabase
      .from("b1_sessions")
      .insert({
        class_code,
        participant_id,
        topic_id,
        difficulty_level,
        score_total,
        max_score,
        duration_sec,
        analysis_json
      });

    if (sessionError) {
      return res.status(500).json({
        ok: false,
        error: sessionError.message
      });
    }

    // 2️⃣ Alten Progress holen
    const { data: existingProgress } = await supabase
      .from("b1_progress")
      .select("progress_summary")
      .eq("class_code", class_code)
      .eq("participant_id", participant_id)
      .eq("topic_id", topic_id)
      .single();

    let prompt;

    if (existingProgress) {
      prompt = `
Bisherige Themenentwicklung:
${existingProgress.progress_summary}

Neue Sitzung:
Score: ${score_total}/${max_score}
Analyse:
${JSON.stringify(analysis_json, null, 2)}

Bitte aktualisiere die Themenentwicklung pädagogisch strukturiert.
Strukturiere:
- Entwicklung
- Stärken
- Schwächen
- Konkrete Verbesserungsempfehlungen
Maximal 200 Wörter.
`;
    } else {
      prompt = `
Erstelle eine erste Themenentwicklung basierend auf:

Score: ${score_total}/${max_score}
Analyse:
${JSON.stringify(analysis_json, null, 2)}

Strukturiere:
- Aktueller Stand
- Stärken
- Schwächen
- Empfehlung
Maximal 200 Wörter.
`;
    }

    // 3️⃣ GPT Fortschreibung
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Du bist ein pädagogischer B1-Prüfungsexperte."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.4
    });

    const newSummary = completion.choices[0].message.content;

    // 4️⃣ Progress upsert
    const { error: progressError } = await supabase
      .from("b1_progress")
      .upsert({
        class_code,
        participant_id,
        topic_id,
        progress_summary: newSummary,
        updated_at: new Date()
      });

    if (progressError) {
      return res.status(500).json({
        ok: false,
        error: progressError.message
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
// GET /b1-results  (holt Sessions)
// --------------------------------------------------
app.get("/b1-results", async (req, res) => {
  try {
    const classCode = req.query.class;
    const participant = req.query.participant;

    if (!classCode) {
      return res.status(400).json({
        ok: false,
        error: "Missing class"
      });
    }

    let query = supabase
      .from("b1_sessions")
      .select("*")
      .eq("class_code", classCode)
      .order("created_at", { ascending: true });

    if (participant) {
      query = query.eq("participant_id", participant);
    }

    const { data, error } = await query;

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

// --------------------------------------------------
// GET /b1-progress  (holt Themenentwicklung)
// --------------------------------------------------
app.get("/b1-progress", async (req, res) => {
  try {
    const classCode = req.query.class;
    const participant = req.query.participant;
    const topic = req.query.topic;

    if (!classCode || !participant || !topic) {
      return res.status(400).json({
        ok: false,
        error: "Missing parameters"
      });
    }

    const { data, error } = await supabase
      .from("b1_progress")
      .select("*")
      .eq("class_code", classCode)
      .eq("participant_id", participant)
      .eq("topic_id", topic)
      .single();

    if (error && error.code !== "PGRST116") {
      return res.status(500).json({
        ok: false,
        error: error.message
      });
    }

    return res.json({
      ok: true,
      row: data || null
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
