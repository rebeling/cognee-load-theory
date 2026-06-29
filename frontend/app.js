// Thin viewer. No business logic — only fetch + render.

function show(targetId, data) {
  document.getElementById(targetId).textContent = JSON.stringify(data, null, 2);
}

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Generic GET buttons (data-get + data-target).
document.querySelectorAll("button[data-get]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    show(btn.dataset.target, await getJson(btn.dataset.get));
  });
});

// Ingest.
document.getElementById("ingest-btn").addEventListener("click", async () => {
  const text = document.getElementById("ingest-text").value;
  const item = await postJson("/api/ingest", { text });
  show("memory-out", await getJson("/api/memory"));
  show("load-out", await getJson("/api/load"));
  document.getElementById("ingest-text").value = "";
});

// Action.
document.getElementById("action-btn").addEventListener("click", async () => {
  const action = document.getElementById("action-name").value;
  show("action-out", await postJson("/api/actions", { action, payload: {} }));
});
