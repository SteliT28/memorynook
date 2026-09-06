// Memory Nook — a small personal memory store.
// You save notes; later you ask questions and it finds the relevant
// notes and uses them to write an answer.

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";
const CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function newId() {
  return crypto.randomUUID();
}

async function embed(env, text) {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: [text] });
  return result.data[0];
}

async function handleAddNote(request, env) {
  const { content } = await request.json();
  if (!content || !content.trim()) {
    return json({ error: "Note can't be empty." }, 400);
  }

  const id = newId();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO notes (id, content, created_at) VALUES (?, ?, ?)"
  )
    .bind(id, content.trim(), createdAt)
    .run();

  const vector = await embed(env, content.trim());
  await env.VECTORIZE.upsert([{ id, values: vector }]);

  return json({ id, content: content.trim(), created_at: createdAt });
}

async function handleListNotes(env) {
  const { results } = await env.DB.prepare(
    "SELECT id, content, created_at FROM notes ORDER BY created_at DESC"
  ).all();
  return json({ notes: results });
}

async function handleDeleteNote(id, env) {
  await env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(id).run();
  await env.VECTORIZE.deleteByIds([id]);
  return json({ deleted: id });
}

async function handleAsk(request, env) {
  const { question } = await request.json();
  if (!question || !question.trim()) {
    return json({ error: "Ask me something." }, 400);
  }

  const { results: countCheck } = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM notes"
  ).all();

  if (!countCheck[0].count) {
    return json({
      answer: "You haven't saved any notes yet, so I don't have anything to look through. Add a note first.",
      sources: [],
    });
  }

  const queryVector = await embed(env, question.trim());

  const matches = await env.VECTORIZE.query(queryVector, {
    topK: 5,
    returnValues: false,
    returnMetadata: "none",
  });

  const ids = matches.matches.map((m) => m.id);

  if (ids.length === 0) {
    return json({
      answer: "I couldn't find anything relevant in your notes.",
      sources: [],
    });
  }

  const placeholders = ids.map(() => "?").join(",");

  const { results: notes } = await env.DB.prepare(
    `SELECT id, content, created_at FROM notes WHERE id IN (${placeholders})`
  )
    .bind(...ids)
    .all();

  const context = notes
    .map(
      (n, i) =>
        `Note ${i + 1} (saved ${n.created_at.slice(0, 10)}): ${n.content}`
    )
    .join("\n\n");

  const prompt = `You are a helpful personal memory assistant. Answer the question using ONLY the notes below. If the notes don't contain the answer, say so plainly rather than guessing.

Notes:
${context}

Question: ${question.trim()}

Answer:`;

  const aiResponse = await env.AI.run(CHAT_MODEL, {
    messages: [{ role: "user", content: prompt }],
  });

  return json({
    answer: aiResponse.response,
    sources: notes,
  });
}

function checkAuth(request, env) {
  const header = request.headers.get("Authorization");

  if (!header || !header.startsWith("Basic ")) {
    return false;
  }

  const decoded = atob(header.slice(6));
  const separatorIndex = decoded.indexOf(":");
  const password =
    separatorIndex === -1
      ? decoded
      : decoded.slice(separatorIndex + 1);

  return password === env.APP_PASSWORD;
}

function unauthorized() {
  return new Response("Password required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Memory Nook"',
    },
  });
}

export default {
  async fetch(request, env) {
    if (!checkAuth(request, env)) {
      return unauthorized();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/notes" && request.method === "POST") {
        return await handleAddNote(request, env);
      }

      if (path === "/api/notes" && request.method === "GET") {
        return await handleListNotes(env);
      }

      if (
        path.startsWith("/api/notes/") &&
        request.method === "DELETE"
      ) {
        const id = path.split("/").pop();
        return await handleDeleteNote(id, env);
      }

      if (path === "/api/ask" && request.method === "POST") {
        return await handleAsk(request, env);
      }
    } catch (err) {
      return json(
        { error: err.message || "Something went wrong." },
        500
      );
    }

    // Fall back to serving the static frontend
    return env.ASSETS.fetch(request);
  },
};
